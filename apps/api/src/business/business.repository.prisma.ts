import { createHash } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { canonicalJson, type BookingTaxKey, type ChartOfAccounts, type BookkeepingMode, type JournalEntry, type JournalLine, type LogRecord } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type {
  BankTransactionRecord,
  BookAppend,
  BookingRuleRecord,
  BookRecord,
  BusinessPerson,
  BusinessProfilePatch,
  BusinessProfileRecord,
  BusinessRepository,
  FixedAssetRecord,
  LoadedBook,
  NewFixedAsset,
} from './business.repository.js'

type Tx = Pick<EncryptedPrismaClient, 'ledger' | 'journalEntry' | 'journalLine' | 'ledgerLogRecord' | 'fixedAsset' | '$queryRaw'>

/** SHA-256 over the canonical plaintext: the stored hash does not depend on the field encryption. */
export function entryContentHash(entry: JournalEntry): string {
  return createHash('sha256').update(canonicalJson(entry)).digest('hex')
}

function toProfile(row: {
  id: string
  userId: string
  taxYear: number
  person: string
  kind: string | null
  professionAnswers: string | null
  suggestion: string | null
  name: string | null
  mode: string
  chart: string
  smallBusiness: boolean
  vatMethod: string
  municipalityAgs: string | null
  multiplierOverride: string | null
  startDate: string | null
  vatPrepayments: string | null
  tradeTaxInputs: string | null
  lossFacts: string | null
  partnershipShares: string | null
  procedureDoc: string | null
}): BusinessProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    taxYear: row.taxYear,
    person: row.person === 'B' ? 'B' : 'A',
    kind: row.kind === 'freiberuf' || row.kind === 'gewerbe' ? row.kind : null,
    professionAnswers: row.professionAnswers,
    suggestion: row.suggestion,
    name: row.name,
    mode: row.mode === 'bilanz' ? 'bilanz' : 'euer',
    chart: row.chart === 'SKR04' ? 'SKR04' : 'SKR03',
    smallBusiness: row.smallBusiness,
    vatMethod: row.vatMethod === 'soll' ? 'soll' : 'ist',
    municipalityAgs: row.municipalityAgs,
    multiplierOverride: row.multiplierOverride,
    startDate: row.startDate,
    vatPrepayments: row.vatPrepayments,
    tradeTaxInputs: row.tradeTaxInputs,
    lossFacts: row.lossFacts,
    partnershipShares: row.partnershipShares,
    procedureDoc: row.procedureDoc,
  }
}

function toBook(row: { id: string; chart: string; mode: string; lockedThrough: string | null }): BookRecord {
  return { id: row.id, chart: row.chart === 'SKR04' ? 'SKR04' : 'SKR03', mode: row.mode === 'bilanz' ? 'bilanz' : 'euer', lockedThrough: row.lockedThrough }
}

function toAsset(row: {
  id: string
  taxYear: number
  person: string
  label: string
  account: string
  acquisitionDate: string
  acquisitionCost: string
  method: string
  category: string | null
  usefulLifeYears: number | null
  specialDepreciation: string | null
  disposal: string | null
}): FixedAssetRecord {
  return {
    id: row.id,
    taxYear: row.taxYear,
    person: row.person === 'B' ? 'B' : 'A',
    label: row.label,
    account: row.account,
    acquisitionDate: row.acquisitionDate,
    acquisitionCost: Number(row.acquisitionCost),
    method: row.method,
    category: row.category,
    usefulLifeYears: row.usefulLifeYears,
    specialDepreciation: row.specialDepreciation,
    disposal: row.disposal,
  }
}

/** Rebuilds the core entry from its rows, the same shape `postEntry` produced and the log holds. */
function toEntry(row: {
  number: number
  date: string
  documentNumber: string
  receiptRef: string | null
  text: string
  regularPayment: string | null
  reversalOf: number | null
  lines: { account: string; side: string; amount: string; taxKey: string; taxPart: string | null }[]
}): JournalEntry {
  return {
    number: row.number,
    date: row.date,
    documentNumber: row.documentNumber,
    receiptRef: row.receiptRef,
    text: row.text,
    lines: row.lines.map(
      (l): JournalLine => ({
        account: l.account,
        side: l.side === 'credit' ? 'credit' : 'debit',
        amount: Number(l.amount),
        taxKey: l.taxKey as BookingTaxKey,
        taxPart: l.taxPart === 'base' || l.taxPart === 'tax' ? l.taxPart : null,
      }),
    ),
    regularPayment: row.regularPayment === null ? null : (JSON.parse(row.regularPayment) as JournalEntry['regularPayment']),
    reversalOf: row.reversalOf,
  }
}

@Injectable()
export class PrismaBusinessRepository implements BusinessRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findProfile(userId: string, taxYear: number, person: BusinessPerson): Promise<BusinessProfileRecord | null> {
    const row = await this.prisma.businessProfile.findUnique({ where: { userId_taxYear_person: { userId, taxYear, person } } })
    return row ? toProfile(row) : null
  }

  async saveProfile(userId: string, taxYear: number, person: BusinessPerson, patch: BusinessProfilePatch): Promise<BusinessProfileRecord> {
    const data = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
    const row = await this.prisma.businessProfile.upsert({
      where: { userId_taxYear_person: { userId, taxYear, person } },
      create: { userId, taxYear, person, ...data },
      update: data,
    })
    return toProfile(row)
  }

  private async load(tx: Tx, book: BookRecord): Promise<LoadedBook> {
    const [entries, log] = await Promise.all([
      tx.journalEntry.findMany({ where: { ledgerId: book.id }, orderBy: { number: 'asc' }, include: { lines: { orderBy: { position: 'asc' } } } }),
      tx.ledgerLogRecord.findMany({ where: { ledgerId: book.id }, orderBy: { seq: 'asc' } }),
    ])
    return {
      book,
      ledger: { chart: book.chart, mode: book.mode, entries: entries.map(toEntry), lockedThrough: book.lockedThrough },
      log: log.map((r) => ({ seq: r.seq, at: r.at, kind: r.kind as LogRecord['kind'], payload: JSON.parse(r.payload) as unknown, prevHash: r.prevHash, hash: r.hash })),
      sources: new Map(entries.map((e) => [e.number, e.source])),
      drafts: new Map(entries.filter((e) => e.draft !== null).map((e) => [e.number, e.draft!])),
    }
  }

  async loadBook(userId: string, taxYear: number, person: BusinessPerson): Promise<LoadedBook | null> {
    const row = await this.prisma.ledger.findUnique({ where: { userId_taxYear_person: { userId, taxYear, person } } })
    return row ? this.load(this.prisma, toBook(row)) : null
  }

  async changeBook<T>(
    userId: string,
    taxYear: number,
    person: BusinessPerson,
    frame: { readonly chart: ChartOfAccounts; readonly mode: BookkeepingMode },
    work: (book: LoadedBook) => { readonly result: T; readonly append: BookAppend } | Promise<{ readonly result: T; readonly append: BookAppend }>,
  ): Promise<T> {
    return this.prisma.$transaction(async (raw) => {
      const tx = raw as unknown as Tx
      const existing = await tx.ledger.findUnique({ where: { userId_taxYear_person: { userId, taxYear, person } } })
      const created = existing ?? (await tx.ledger.create({ data: { userId, taxYear, person, chart: frame.chart, mode: frame.mode } }))
      // The row lock serialises every change of one book: gapless numbers, one chain.
      await tx.$queryRaw`SELECT "id" FROM "Buch" WHERE "id" = ${created.id} FOR UPDATE`
      const loaded = await this.load(tx, toBook(created))
      const { result, append } = await work(loaded)
      await this.write(tx, created.id, userId, taxYear, append)
      return result
    })
  }

  private async write(tx: Tx, ledgerId: string, userId: string, taxYear: number, append: BookAppend): Promise<void> {
    for (const { entry, source, draft } of append.entries ?? []) {
      const row = await tx.journalEntry.create({
        data: {
          ledgerId,
          userId,
          taxYear,
          number: entry.number,
          date: entry.date,
          documentNumber: entry.documentNumber,
          receiptRef: entry.receiptRef,
          text: entry.text,
          regularPayment: entry.regularPayment === null ? null : JSON.stringify(entry.regularPayment),
          reversalOf: entry.reversalOf,
          source,
          draft: draft ?? null,
          contentHash: entryContentHash(entry),
        },
      })
      for (const [position, line] of entry.lines.entries()) {
        await tx.journalLine.create({
          data: { entryId: row.id, userId, taxYear, position: position + 1, account: line.account, side: line.side, amount: String(line.amount), taxKey: line.taxKey, taxPart: line.taxPart },
        })
      }
    }
    for (const record of append.log ?? []) {
      await tx.ledgerLogRecord.create({
        data: { ledgerId, userId, taxYear, seq: record.seq, at: record.at, kind: record.kind, payload: canonicalJson(record.payload), prevHash: record.prevHash, hash: record.hash },
      })
    }
    for (const asset of append.assets ?? []) {
      await tx.fixedAsset.create({ data: { userId, ...asset, acquisitionCost: String(asset.acquisitionCost) } })
    }
    if (append.lockedThrough !== undefined) {
      await tx.ledger.update({ where: { id: ledgerId }, data: { lockedThrough: append.lockedThrough } })
    }
  }

  async listAssets(userId: string, person: BusinessPerson, throughYear: number): Promise<FixedAssetRecord[]> {
    const rows = await this.prisma.fixedAsset.findMany({ where: { userId, person, taxYear: { lte: throughYear } }, orderBy: { createdAt: 'asc' } })
    return rows.map(toAsset)
  }

  async createAsset(userId: string, asset: NewFixedAsset): Promise<FixedAssetRecord> {
    const row = await this.prisma.fixedAsset.create({ data: { userId, ...asset, acquisitionCost: String(asset.acquisitionCost) } })
    return toAsset(row)
  }

  async setAssetDisposal(userId: string, assetId: string, disposal: string): Promise<FixedAssetRecord | null> {
    const { count } = await this.prisma.fixedAsset.updateMany({ where: { id: assetId, userId }, data: { disposal } })
    if (count === 0) return null
    const row = await this.prisma.fixedAsset.findFirst({ where: { id: assetId, userId } })
    return row ? toAsset(row) : null
  }

  async listBankTransactions(userId: string, taxYear: number, person: BusinessPerson): Promise<BankTransactionRecord[]> {
    const book = await this.prisma.ledger.findUnique({ where: { userId_taxYear_person: { userId, taxYear, person } } })
    if (!book) return []
    const rows = await this.prisma.bankTransaction.findMany({ where: { ledgerId: book.id, userId }, orderBy: { createdAt: 'asc' } })
    return rows.map((r) => ({
      id: r.id,
      fingerprint: r.fingerprint,
      amount: Number(r.amount),
      details: r.details,
      status: r.status === 'gebucht' || r.status === 'ignoriert' ? r.status : 'offen',
      entryNumber: r.entryNumber,
    }))
  }

  async addBankTransactions(
    userId: string,
    taxYear: number,
    person: BusinessPerson,
    frame: { readonly chart: ChartOfAccounts; readonly mode: BookkeepingMode },
    transactions: readonly { readonly fingerprint: string; readonly amount: number; readonly details: string }[],
  ): Promise<number> {
    const book = await this.prisma.ledger.upsert({
      where: { userId_taxYear_person: { userId, taxYear, person } },
      create: { userId, taxYear, person, chart: frame.chart, mode: frame.mode },
      update: {},
    })
    const known = new Set((await this.prisma.bankTransaction.findMany({ where: { ledgerId: book.id }, select: { fingerprint: true } })).map((r) => r.fingerprint))
    let added = 0
    for (const tx of transactions) {
      if (known.has(tx.fingerprint)) continue
      known.add(tx.fingerprint)
      await this.prisma.bankTransaction.create({ data: { ledgerId: book.id, userId, taxYear, fingerprint: tx.fingerprint, amount: String(tx.amount), details: tx.details } })
      added++
    }
    return added
  }

  async setBankTransactionStatus(userId: string, id: string, status: BankTransactionRecord['status'], entryNumber: number | null): Promise<void> {
    await this.prisma.bankTransaction.updateMany({ where: { id, userId }, data: { status, entryNumber } })
  }

  async listRules(userId: string, person: BusinessPerson): Promise<BookingRuleRecord[]> {
    const rows = await this.prisma.bookingRule.findMany({ where: { userId, person }, orderBy: { createdAt: 'asc' } })
    return rows.map((r) => ({ id: r.id, person: r.person === 'B' ? 'B' : 'A', criteria: r.criteria, account: r.account, taxKey: r.taxKey, text: r.text }))
  }

  async createRule(userId: string, rule: Omit<BookingRuleRecord, 'id'>): Promise<BookingRuleRecord> {
    const row = await this.prisma.bookingRule.create({ data: { userId, ...rule } })
    return { id: row.id, person: row.person === 'B' ? 'B' : 'A', criteria: row.criteria, account: row.account, taxKey: row.taxKey, text: row.text }
  }
}
