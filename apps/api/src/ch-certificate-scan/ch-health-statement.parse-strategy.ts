import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common'
import { ANNUAL_AVERAGE_RATES, chfToEur, formatChf, insuredMember, parseChHealthStatement, receiptFilingYear, type AdvisorCountedItem, type InsuredPremium } from '@steuereule/core'
import { AdvisorDocumentStaging } from '../advisor/advisor-document-staging.js'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { LinkService } from '../link/link.service.js'
import type { ParseReceiptDto, ParseReceiptResponseDto } from '../receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry, type DocumentParseStrategy } from '../receipt/parse/document-parse.registry.js'

type Field = Parameters<AdvisorDocumentStaging['stageDocumentDrafts']>[2]['fields'][number]

/**
 * A Swiss health insurer's statement for the tax return (ADR-0080): the basic-insurance premiums of each
 * insured person. The partners' premiums go to their Lohnausweis mask (Krankenkasse, CHF), a child's to
 * its Anlage Kind (Kz 89 as a foreign insurer, in euros at the Lohnausweis rate; ADR-0090). A second insurer in the year adds to the
 * first; the same statement uploaded again adds nothing. A fixed rule reads it; names stay on the server.
 */
@Injectable()
export class ChHealthStatementParseStrategy implements DocumentParseStrategy, OnModuleInit {
  readonly kind = 'chKrankenkasse' as const

  constructor(
    @Inject(DocumentParseRegistry) private readonly registry: DocumentParseRegistry,
    @Inject(AdvisorDocumentStaging) private readonly staging: AdvisorDocumentStaging,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(LinkService) private readonly linkService: LinkService,
    @Optional() @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chRepo?: CrossBorderSalaryStatementRepository,
    @Optional() @Inject(CHILD_REPOSITORY) private readonly children?: ChildRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async parse(userId: string, dto: ParseReceiptDto): Promise<ParseReceiptResponseDto> {
    const read = parseChHealthStatement(dto.rawText ?? '')
    // One year rule (ADR-0097 §5): the statement's year decides the household, the rate and where its drafts go.
    const filingYear = receiptFilingYear(read.taxYear, dto.taxYear)
    const year = filingYear ?? dto.taxYear
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg_analyse' })
    const otherYear = read.taxYear !== null && read.taxYear !== dto.taxYear

    const household = await this.staging.householdNames(userId, year)
    const kids = (await this.children?.listForUserAndYear(userId, year)) ?? []
    const members = [
      { key: 'A', ...household.A },
      ...(household.B ? [{ key: 'B', firstName: household.B.firstName, lastName: household.B.lastName }] : []),
      ...kids.map((k) => ({ key: `kind:${k.id}`, firstName: k.firstName, lastName: k.lastName })),
    ]
    // The child's premiums are in euros: at the rate of the Lohnausweis, or — while none is chosen yet — at the
    // official annual average the Anlage N-Gre prints, to be checked (ADR-0086).
    const chosenRate = exchangeRateFromRecord((await this.chRepo?.findForUserAndYear(userId, year)) ?? null)?.rate ?? null
    const averageRate = ANNUAL_AVERAGE_RATES[year] ?? null
    const rateA = chosenRate ?? averageRate

    const notes: string[] = []
    const forA: Field[] = []
    const forB: Field[] = []
    let unmatched = 0
    let childRateNoted = false
    // Franchise and Selbstbehalt the household paid itself: Krankheitskosten (§ 33 EStG), in euros.
    let selfBorneChf = 0
    const selfBorneItems: AdvisorCountedItem[] = []
    const countedHealth = await this.staging.countedReceiptItems(userId, year, { screen: 'interview', field: 'gesundheit-betrag' })
    // Read for one person of the household (ADR-0092 §5): only their lines; the others are offered apart.
    const only = dto.holder
    // A Person B without a name on record matches nobody; the one insured person no one matches is then B
    // (real-data run: the spouse of a family statement was not assigned). Said, to be checked.
    const unmatchedInsured = read.insured.filter((person) => insuredMember(person.name, members) === null)
    const bUnnamed = household.B !== null && !household.B.firstName && !household.B.lastName
    const spouseByElimination = bUnnamed && unmatchedInsured.length === 1 ? unmatchedInsured[0] : undefined
    if (spouseByElimination) notes.push('Eine versicherte Person habe ich Person B zugeordnet, weil für Person B noch kein Name eingetragen ist. Bitte prüfe das.')
    for (const person of read.insured) {
      const matched = person === spouseByElimination ? 'B' : insuredMember(person.name, members)
      // The user said whose statement it is („Für wen?“): a statement for one person is theirs, also when
      // the printed name fits nobody on record (real-data run: „Nichts erkannt“ beside the amount read).
      const key = matched === null && only !== undefined && read.insured.length === 1 && members.some((m) => m.key === only) ? only : matched
      // A person nobody matches is said, also on a pass for one holder: never dropped without a word.
      if (key === null) {
        unmatched++
        continue
      }
      if (only !== undefined && key !== only) continue
      const items = countedItemsOf(read.insurer, year, person)
      const chf = Math.round(person.premiumCents / 100)
      if (key === 'A' || key === 'B') {
        const counted = await this.staging.countedReceiptItems(userId, year, { screen: 'chLohnausweis', field: 'krankenkasseChf', person: key })
        if (counted.some((c) => c.ref === items[0]!.ref)) {
          notes.push(`Die Prämien ${key === 'B' ? 'von Person B' : 'für dich'} aus diesem Auszug sind schon gezählt.`)
          continue
        }
        ;(key === 'A' ? forA : forB).push(premiumField('krankenkasseChf', chf, dto, items))
      } else {
        const childId = key.slice('kind:'.length)
        const counted = await this.staging.countedReceiptItems(userId, year, { screen: 'kind', field: 'healthBasicEur', instance: childId })
        if (counted.some((c) => c.ref === items[0]!.ref)) {
          notes.push('Die Prämien für das Kind aus diesem Auszug sind schon gezählt.')
          continue
        }
        if (rateA === null) {
          notes.push(`Für das Kind stehen ${formatChf(chf)} Grundversicherung im Auszug. Den Betrag in Euro rechne ich, sobald der Wechselkurs im Lohnausweis steht.`)
          continue
        }
        if (chosenRate === null && !childRateNoted) {
          childRateNoted = true
          notes.push(`${kids.length > 1 ? 'Die Prämien der Kinder' : 'Die Prämie des Kindes'} habe ich zum amtlichen Jahresdurchschnitt umgerechnet (100 CHF = ${(rateA * 100).toFixed(2).replace('.', ',')} €). Wählst du im Lohnausweis einen anderen Kurs, passe sie bitte an.`)
        }
        const field = premiumField('healthBasicEur', Math.round(chfToEur(chf, rateA)), dto, items)
        forA.push({ ...field, ...(chosenRate === null ? { status: 'pruefen' as const } : {}), screen: 'kind', instance: childId })
        // A Swiss insurer is a foreign one: the child's premium belongs in Anlage Kind Kz 89 (ADR-0090).
        forA.push({ field: 'healthInsuranceAbroad', label: 'Kind: Kasse im Ausland (Anlage Kind Kz 89)', value: 'true', status: 'ok', reason: null, screen: 'kind', instance: childId })
      }
      if (person.selfBorneCents > 0) {
        const item = selfBorneItemOf(read.insurer, year, person)
        if (!countedHealth.some((c) => c.ref === item.ref)) {
          selfBorneChf += person.selfBorneCents / 100
          selfBorneItems.push(item)
        }
      }
    }
    if (selfBorneChf > 0) {
      const chf = Math.round(selfBorneChf)
      if (rateA === null) {
        notes.push(`Dazu ${formatChf(chf)} selbst getragene Krankheitskosten (Franchise, Selbstbehalt). In Euro rechne ich sie, sobald der Wechselkurs im Lohnausweis steht.`)
      } else {
        notes.push(`Dazu ${formatChf(chf)} selbst getragene Krankheitskosten (Franchise, Selbstbehalt); die habe ich in Euro zu euren Krankheitskosten gerechnet (§ 33 EStG).`)
        const status = chosenRate === null || dto.textSource !== 'pdf_text' ? ('pruefen' as const) : ('ok' as const)
        forA.push(
          { field: 'gesundheit-gate', label: 'Krankheitskosten', value: 'Ja', status: 'ok', reason: null, screen: 'interview' },
          { field: 'gesundheit-betrag', label: 'Krankheitskosten (Summe im Jahr)', value: Math.round(chfToEur(chf, rateA)), status, reason: null, screen: 'interview', accumulate: true, countedItems: selfBorneItems },
        )
      }
    }
    if (unmatched > 0) notes.push(`${unmatched === 1 ? 'Eine versicherte Person' : `${unmatched} versicherte Personen`} konnte ich niemandem im Haushalt zuordnen; trag die Prämie bitte selbst ein.`)

    const staged: string[] = []
    let stagedAction: ParseReceiptResponseDto['stagedAction'] = null
    let assistantMessage: ParseReceiptResponseDto['assistantMessage'] = null
    if ((dto.stageDraft ?? true) && filingYear !== null) {
      const intro = `Ich habe den Auszug der Krankenkasse für ${year} gelesen: Prämien der Grundversicherung, als ausländische Krankenversicherung absetzbar.`
      const ocr = dto.textSource !== 'pdf_text' ? ['Der Text stammt aus einem Scan; prüfe die Beträge, bevor du sie übernimmst.'] : []
      for (const [person, fields] of [['A', forA], ['B', forB]] as const) {
        if (fields.length === 0) continue
        if (person === 'B' && household.B?.recordable !== true) {
          notes.push('Die Prämien von Person B kann ich erst eintragen, wenn ihr gekoppelt seid.')
          continue
        }
        const result = await this.staging.stageDocumentDrafts(userId, year, {
          screen: 'chLohnausweis',
          person,
          digestUserId: await this.linkService.dataUser(userId, year, person),
          receiptId: dto.receiptId ?? null,
          engine: { mode: 'deterministic_fallback', provider: 'deterministic' },
          summaryText: [intro, ...ocr, ...(person === 'A' ? notes : [])].join('\n'),
          sourceId: 'estg-10-1-3',
          fields,
        })
        staged.push(...result.actions.map((a) => a.actionId))
        stagedAction ??= result.actions[0] ?? null
        assistantMessage ??= result.assistantMessage
      }
    }

    const total = read.insured.reduce((sum, p) => sum + p.premiumCents, 0)
    return {
      mode: 'deterministic_fallback',
      securityBlocked: false,
      parsed: {
        vendorCategory: 'sonstiges',
        receiptDate: null,
        amountEur: null,
        suggestedScreen: stagedAction ? 'chLohnausweis' : null,
        suggestedField: stagedAction ? 'krankenkasseChf' : null,
        suggestedValue: null,
        summary: [
          filingYear === null
            ? `Der Auszug gehört zu ${read.taxYear}, für dieses Jahr führt die App keine Steuererklärung.`
            : `Auszug der Krankenkasse gelesen: ${read.insured.length} versicherte ${read.insured.length === 1 ? 'Person' : 'Personen'}, Grundversicherung zusammen ${formatChf(Math.round(total / 100))}.${otherYear && stagedAction ? ` Er gehört zum Steuerjahr ${year}; dort liegen die Entwürfe.` : ''}`,
          ...(stagedAction === null ? notes : []),
        ].join(' '),
        taxYear: year,
      },
      stagedAction,
      assistantMessage,
      draftsTaxYear: staged.length > 0 ? year : null,
      noValuesReason: (dto.stageDraft ?? true) && filingYear === null ? 'kein_steuerjahr' : null,
    }
  }
}

function premiumField(field: string, value: number, dto: ParseReceiptDto, items: AdvisorCountedItem[]): Field {
  const fromOcr = dto.textSource !== 'pdf_text'
  return { field, label: field === 'healthBasicEur' ? 'Kind: Basis-Krankenversicherung (Anlage Kind Kz 89)' : 'Krankenkasse Grundversicherung (CHF)', value, status: fromOcr ? 'pruefen' : 'ok', reason: fromOcr ? 'ocr_source' : null, accumulate: true, countedItems: items }
}

/** The self-borne costs of one person on one statement: counted into the Krankheitskosten once. */
function selfBorneItemOf(insurer: string, year: number, person: InsuredPremium): AdvisorCountedItem {
  const hash = (value: string) => `0${createHash('sha256').update(`health-own:${value}`).digest('hex').slice(0, 24)}`
  const who = person.insuredNo ?? person.name.toLowerCase()
  return { ref: hash(`${insurer}|${who}|${year}|${person.period ?? ''}|${person.selfBorneCents}`), amountKey: hash(`${insurer}|${who}|${year}`) }
}

/** One statement for one person: insurer, insured number (or name), year and amount — stored only hashed. */
function countedItemsOf(insurer: string, year: number, person: InsuredPremium): AdvisorCountedItem[] {
  const hash = (value: string) => `0${createHash('sha256').update(`health:${value}`).digest('hex').slice(0, 24)}`
  const who = person.insuredNo ?? person.name.toLowerCase()
  return [{ ref: hash(`${insurer}|${who}|${year}|${person.period ?? ''}|${person.premiumCents}`), amountKey: hash(`${insurer}|${who}|${year}`), ...(person.period ? { period: person.period } : {}) }]
}
