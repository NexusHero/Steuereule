import { Inject, Injectable } from '@nestjs/common'
import {
  BANK_CSV_PRESETS,
  draftFromTransaction,
  parseBankCsv,
  parseCamt053,
  suggestBooking,
  withFingerprints,
  type BankCsvPreset,
  type BankTransaction,
  type BookingRule,
  type BookingTaxKey,
  type CsvMapping,
  type JournalEntry,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { BUSINESS_REPOSITORY, type BusinessPerson, type BusinessRef, type BusinessRepository } from './business.repository.js'
import { bankAccountOf } from './business-ledger.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { emptyTransaction, parseJson } from './business-helpers.js'

/** Bank import (ADR-0101 §14): bank lines from CSV or camt.053, the booking suggestion, a line taken as a booking or ignored. */
@Injectable()
export class BankImportService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

  async importBank(
    userId: string,
    year: number,
    ref: BusinessRef,
    input: { format: 'csv' | 'camt053'; content: string; preset?: BankCsvPreset | undefined; mapping?: CsvMapping | undefined },
  ): Promise<{ readonly added: number; readonly duplicates: number; readonly outsideYear: number }> {
    await this.context.assertOpen(userId, year)
    const { chart, mode } = await this.context.frame(userId, year, ref)
    let parsed: readonly BankTransaction[]
    try {
      if (input.format === 'camt053') parsed = parseCamt053(input.content)
      else {
        const mapping = input.mapping ?? (input.preset ? BANK_CSV_PRESETS[input.preset] : undefined)
        if (mapping === undefined) throw new InvalidInputError('BANK_MAPPING_MISSING', 'Für eine CSV-Datei die Bank wählen oder die Spalten zuordnen.')
        parsed = parseBankCsv(input.content, mapping)
      }
    } catch (error) {
      if (error instanceof InvalidInputError) throw error
      throw new InvalidInputError('BANK_FILE_UNREADABLE', error instanceof Error ? error.message : 'Die Datei ließ sich nicht lesen.')
    }
    const all = withFingerprints(parsed)
    const inYear = all.filter((tx) => Number(tx.bookingDate.slice(0, 4)) === year)
    const added = await this.repository.addBankTransactions(
      userId,
      year,
      ref,
      { chart, mode },
      inYear.map(({ fingerprint, amount, ...details }) => ({ fingerprint, amount, details: JSON.stringify(details) })),
    )
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return { added, duplicates: inYear.length - added, outsideYear: all.length - inYear.length }
  }

  private async rules(userId: string, person: BusinessPerson): Promise<BookingRule[]> {
    return (await this.repository.listRules(userId, person)).map((r) => ({ id: r.id, ...parseJson<Omit<BookingRule, 'id' | 'account' | 'taxKey'>>(r.criteria, {}), account: r.account, taxKey: r.taxKey as BookingTaxKey, ...(r.text ? { text: r.text } : {}) }))
  }

  async listBank(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const [records, rules] = await Promise.all([this.repository.listBankTransactions(userId, year, ref), this.rules(userId, ref.person)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return records.map((r) => {
      const tx: BankTransaction = { ...parseJson<Omit<BankTransaction, 'amount'>>(r.details, emptyTransaction()), amount: r.amount }
      return { id: r.id, status: r.status, entryNumber: r.entryNumber, transaction: tx, suggestion: r.status === 'offen' ? suggestBooking(tx, rules) : null }
    })
  }

  /** Takes a suggestion (or the user's own account) as a booking: bank against the account. */
  async acceptBank(
    userId: string,
    year: number,
    ref: BusinessRef,
    id: string,
    input: { account?: string | undefined; taxKey?: BookingTaxKey | undefined; text?: string | undefined; documentNumber?: string | undefined; remember?: boolean | undefined },
  ): Promise<JournalEntry> {
    const list = await this.listBank(userId, year, ref)
    const item = list.find((t) => t.id === id)
    if (!item) throw new NotFoundError('BANK_TRANSACTION_NOT_FOUND', 'Diesen Kontoumsatz gibt es nicht.')
    if (item.status !== 'offen') throw new ConflictError('BANK_TRANSACTION_DONE', 'Dieser Kontoumsatz ist schon erledigt.')
    const account = input.account ?? item.suggestion?.account
    if (account === undefined) throw new InvalidInputError('BANK_ACCOUNT_MISSING', 'Für diesen Umsatz gibt es keinen Vorschlag; bitte ein Konto wählen.')
    const taxKey = input.taxKey ?? item.suggestion?.taxKey ?? 'none'
    const text = input.text ?? item.suggestion?.text ?? (item.transaction.counterpartyName ?? item.transaction.reference)
    const { chart } = await this.context.frame(userId, year, ref)
    const draft = draftFromTransaction(item.transaction, bankAccountOf(chart), { ruleId: item.suggestion?.ruleId ?? 'manuell', account, taxKey, text }, input.documentNumber ?? `Bank-${item.transaction.bookingDate}-${id.slice(0, 6)}`)
    const entry = await this.ledger.post(userId, year, ref, draft, `bank:${id}`)
    await this.repository.setBankTransactionStatus(userId, id, 'gebucht', entry.number)
    if (input.remember === true && (item.transaction.counterpartyIban || item.transaction.counterpartyName)) {
      const criteria = item.transaction.counterpartyIban ? { counterpartyIban: item.transaction.counterpartyIban } : { counterpartyNameContains: item.transaction.counterpartyName! }
      await this.repository.createRule(userId, { person: ref.person, criteria: JSON.stringify({ ...criteria, direction: item.transaction.amount > 0 ? 'in' : 'out' }), account, taxKey, text })
    }
    return entry
  }

  async ignoreBank(userId: string, year: number, ref: BusinessRef, id: string): Promise<void> {
    await this.context.assertOpen(userId, year)
    const records = await this.repository.listBankTransactions(userId, year, ref)
    if (!records.some((r) => r.id === id)) throw new NotFoundError('BANK_TRANSACTION_NOT_FOUND', 'Diesen Kontoumsatz gibt es nicht.')
    await this.repository.setBankTransactionStatus(userId, id, 'ignoriert', null)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
  }
}
