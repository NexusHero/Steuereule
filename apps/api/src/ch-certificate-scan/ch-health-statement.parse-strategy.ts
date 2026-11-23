import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common'
import { ANNUAL_AVERAGE_RATES, chfToEur, formatChf, insuredMember, parseChHealthStatement, receiptFilingYear, type AdvisorCountedItem, type InsuredPremium } from '@steuereule/core'
import { AdvisorService } from '../advisor/advisor.service.js'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { LinkService } from '../link/link.service.js'
import type { ParseReceiptDto, ParseReceiptResponseDto } from '../receipt/dto/parse-receipt.dto.js'
import { DocumentParseRegistry, type DocumentParseStrategy } from '../receipt/parse/document-parse.registry.js'
import { DETERMINISTIC_ENGINE, NOTHING_STAGED, SCAN_CHECK_NOTE, isFromOcr, noTaxYearReason, type StagedDrafts } from '../receipt/parse/document-parse-steps.js'

type Field = Parameters<AdvisorService['stageDocumentDrafts']>[2]['fields'][number]

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
    @Inject(AdvisorService) private readonly advisorService: AdvisorService,
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

    const household = await this.householdOf(userId, year)
    const rates = await this.childRates(userId, year)
    const drafts = await this.collectDrafts(userId, dto, year, read, household, rates)
    const staged = (dto.stageDraft ?? true) && filingYear !== null ? await this.stageDrafts(userId, dto, year, household.names, drafts) : NOTHING_STAGED

    return {
      mode: 'deterministic_fallback',
      securityBlocked: false,
      parsed: {
        vendorCategory: 'sonstiges',
        receiptDate: null,
        amountEur: null,
        suggestedScreen: staged.stagedAction ? 'chLohnausweis' : null,
        suggestedField: staged.stagedAction ? 'krankenkasseChf' : null,
        suggestedValue: null,
        summary: statementSummary(read, filingYear, year, dto.taxYear, staged.stagedAction !== null, drafts.notes),
        taxYear: year,
      },
      stagedAction: staged.stagedAction,
      assistantMessage: staged.assistantMessage,
      draftsTaxYear: staged.stagedActionIds.length > 0 ? year : null,
      noValuesReason: noTaxYearReason(dto, filingYear),
    }
  }

  /** The partners and the children of the year, as the statement's names are matched against them. */
  private async householdOf(userId: string, year: number): Promise<Household> {
    const names = await this.advisorService.householdNames(userId, year)
    const kids = (await this.children?.listForUserAndYear(userId, year)) ?? []
    const members = [
      { key: 'A', ...names.A },
      ...(names.B ? [{ key: 'B', firstName: names.B.firstName, lastName: names.B.lastName }] : []),
      ...kids.map((k) => ({ key: `kind:${k.id}`, firstName: k.firstName, lastName: k.lastName })),
    ]
    return { names, children: kids.length, members }
  }

  /**
   * The child's premiums are in euros: at the rate of the Lohnausweis, or — while none is chosen yet — at the
   * official annual average the Anlage N-Gre prints, to be checked (ADR-0086).
   */
  private async childRates(userId: string, year: number): Promise<Rates> {
    const chosen = exchangeRateFromRecord((await this.chRepo?.findForUserAndYear(userId, year)) ?? null)?.rate ?? null
    return { chosen, rate: chosen ?? ANNUAL_AVERAGE_RATES[year] ?? null }
  }

  /** Every insured person's premiums as drafts for whom they belong to, plus the self-borne costs (§ 33 EStG). */
  private async collectDrafts(userId: string, dto: ParseReceiptDto, year: number, read: HealthStatement, household: Household, rates: Rates): Promise<Drafts> {
    const drafts: Drafts = { forA: [], forB: [], notes: [] }
    const ctx: InsuredContext = { userId, dto, year, insurer: read.insurer, household, rates, drafts, childRateNoted: false }
    // Franchise and Selbstbehalt the household paid itself: Krankheitskosten (§ 33 EStG), in euros.
    const countedHealth = await this.advisorService.countedReceiptItems(userId, year, { screen: 'interview', field: 'gesundheit-betrag' })
    const selfBorne = { chf: 0, items: [] as AdvisorCountedItem[] }
    // Read for one person of the household (ADR-0092 §5): only their lines; the others are offered apart.
    const only = dto.holder
    const spouse = spouseByElimination(read, household)
    if (spouse) drafts.notes.push('Eine versicherte Person habe ich Person B zugeordnet, weil für Person B noch kein Name eingetragen ist. Bitte prüfe das.')
    let unmatched = 0
    for (const person of read.insured) {
      const matched = person === spouse ? 'B' : insuredMember(person.name, household.members)
      // The user said whose statement it is („Für wen?“): a statement for one person is theirs, also when
      // the printed name fits nobody on record (real-data run: „Nichts erkannt“ beside the amount read).
      const key = matched === null && only !== undefined && read.insured.length === 1 && household.members.some((m) => m.key === only) ? only : matched
      // A person nobody matches is said, also on a pass for one holder: never dropped without a word.
      if (key === null) {
        unmatched++
        continue
      }
      if (only !== undefined && key !== only) continue
      if (!(await this.draftPremium(ctx, person, key))) continue
      if (person.selfBorneCents > 0) {
        const item = selfBorneItemOf(read.insurer, year, person)
        if (!countedHealth.some((c) => c.ref === item.ref)) {
          selfBorne.chf += person.selfBorneCents / 100
          selfBorne.items.push(item)
        }
      }
    }
    if (selfBorne.chf > 0) drafts.forA.push(...selfBorneDrafts(Math.round(selfBorne.chf), selfBorne.items, rates, isFromOcr(dto), drafts.notes))
    if (unmatched > 0) drafts.notes.push(`${unmatched === 1 ? 'Eine versicherte Person' : `${unmatched} versicherte Personen`} konnte ich niemandem im Haushalt zuordnen; trag die Prämie bitte selbst ein.`)
    return drafts
  }

  /**
   * One insured person's basic-insurance premium: a partner's to the Lohnausweis mask (CHF), a child's to its
   * Anlage Kind (Kz 89, in euros). False when nothing was drafted (already counted, no rate yet).
   */
  private async draftPremium(ctx: InsuredContext, person: InsuredPremium, key: string): Promise<boolean> {
    const { userId, year, drafts, rates } = ctx
    const items = countedItemsOf(ctx.insurer, year, person)
    const chf = Math.round(person.premiumCents / 100)
    if (key === 'A' || key === 'B') {
      const counted = await this.advisorService.countedReceiptItems(userId, year, { screen: 'chLohnausweis', field: 'krankenkasseChf', person: key })
      if (counted.some((c) => c.ref === items[0]!.ref)) {
        drafts.notes.push(`Die Prämien ${key === 'B' ? 'von Person B' : 'für dich'} aus diesem Auszug sind schon gezählt.`)
        return false
      }
      ;(key === 'A' ? drafts.forA : drafts.forB).push(premiumField('krankenkasseChf', chf, ctx.dto, items))
      return true
    }
    const childId = key.slice('kind:'.length)
    const counted = await this.advisorService.countedReceiptItems(userId, year, { screen: 'kind', field: 'healthBasicEur', instance: childId })
    if (counted.some((c) => c.ref === items[0]!.ref)) {
      drafts.notes.push('Die Prämien für das Kind aus diesem Auszug sind schon gezählt.')
      return false
    }
    if (rates.rate === null) {
      drafts.notes.push(`Für das Kind stehen ${formatChf(chf)} Grundversicherung im Auszug. Den Betrag in Euro rechne ich, sobald der Wechselkurs im Lohnausweis steht.`)
      return false
    }
    if (rates.chosen === null && !ctx.childRateNoted) {
      ctx.childRateNoted = true
      drafts.notes.push(`${ctx.household.children > 1 ? 'Die Prämien der Kinder' : 'Die Prämie des Kindes'} habe ich zum amtlichen Jahresdurchschnitt umgerechnet (100 CHF = ${(rates.rate * 100).toFixed(2).replace('.', ',')} €). Wählst du im Lohnausweis einen anderen Kurs, passe sie bitte an.`)
    }
    const field = premiumField('healthBasicEur', Math.round(chfToEur(chf, rates.rate)), ctx.dto, items)
    drafts.forA.push({ ...field, ...(rates.chosen === null ? { status: 'pruefen' as const } : {}), screen: 'kind', instance: childId })
    // A Swiss insurer is a foreign one: the child's premium belongs in Anlage Kind Kz 89 (ADR-0090).
    drafts.forA.push({ field: 'healthInsuranceAbroad', label: 'Kind: Kasse im Ausland (Anlage Kind Kz 89)', value: 'true', status: 'ok', reason: null, screen: 'kind', instance: childId })
    return true
  }

  /** One batch per partner. A's message carries the notes; B's drafts wait until the partners are linked. */
  private async stageDrafts(userId: string, dto: ParseReceiptDto, year: number, household: HouseholdNames, drafts: Drafts): Promise<StagedDrafts> {
    const intro = `Ich habe den Auszug der Krankenkasse für ${year} gelesen: Prämien der Grundversicherung, als ausländische Krankenversicherung absetzbar.`
    const ocr = isFromOcr(dto) ? [SCAN_CHECK_NOTE] : []
    const stagedActionIds: string[] = []
    let stagedAction: StagedDrafts['stagedAction'] = null
    let assistantMessage: StagedDrafts['assistantMessage'] = null
    for (const [person, fields] of [['A', drafts.forA], ['B', drafts.forB]] as const) {
      if (fields.length === 0) continue
      if (person === 'B' && household.B?.recordable !== true) {
        drafts.notes.push('Die Prämien von Person B kann ich erst eintragen, wenn ihr gekoppelt seid.')
        continue
      }
      const result = await this.advisorService.stageDocumentDrafts(userId, year, {
        screen: 'chLohnausweis',
        person,
        digestUserId: await this.linkService.dataUser(userId, year, person),
        receiptId: dto.receiptId ?? null,
        engine: DETERMINISTIC_ENGINE,
        summaryText: [intro, ...ocr, ...(person === 'A' ? drafts.notes : [])].join('\n'),
        sourceId: 'estg-10-1-3',
        fields,
      })
      stagedActionIds.push(...result.actions.map((a) => a.actionId))
      stagedAction ??= result.actions[0] ?? null
      assistantMessage ??= result.assistantMessage
    }
    return { stagedActionIds, stagedAction, assistantMessage }
  }
}

type HealthStatement = ReturnType<typeof parseChHealthStatement>
type HouseholdNames = Awaited<ReturnType<AdvisorService['householdNames']>>

interface Household {
  readonly names: HouseholdNames
  readonly children: number
  readonly members: { key: string; firstName: string | null; lastName: string | null }[]
}

interface Rates {
  /** The rate chosen in the Lohnausweis; null while none is. */
  readonly chosen: number | null
  /** The rate used: the chosen one, else the official annual average; null when neither exists. */
  readonly rate: number | null
}

interface Drafts {
  readonly forA: Field[]
  readonly forB: Field[]
  readonly notes: string[]
}

interface InsuredContext {
  readonly userId: string
  readonly dto: ParseReceiptDto
  readonly year: number
  readonly insurer: string
  readonly household: Household
  readonly rates: Rates
  readonly drafts: Drafts
  /** The note on the average rate is said once, for all children. */
  childRateNoted: boolean
}

/**
 * A Person B without a name on record matches nobody; the one insured person no one matches is then B
 * (real-data run: the spouse of a family statement was not assigned). Said, to be checked.
 */
function spouseByElimination(read: HealthStatement, household: Household): InsuredPremium | undefined {
  const unmatched = read.insured.filter((person) => insuredMember(person.name, household.members) === null)
  const bUnnamed = household.names.B !== null && !household.names.B.firstName && !household.names.B.lastName
  return bUnnamed && unmatched.length === 1 ? unmatched[0] : undefined
}

/** Franchise and Selbstbehalt as Krankheitskosten in euros; without a rate only said, not drafted. */
export function selfBorneDrafts(chf: number, items: AdvisorCountedItem[], rates: Rates, fromOcr: boolean, notes: string[]): Field[] {
  if (rates.rate === null) {
    notes.push(`Dazu ${formatChf(chf)} selbst getragene Krankheitskosten (Franchise, Selbstbehalt). In Euro rechne ich sie, sobald der Wechselkurs im Lohnausweis steht.`)
    return []
  }
  notes.push(`Dazu ${formatChf(chf)} selbst getragene Krankheitskosten (Franchise, Selbstbehalt); die habe ich in Euro zu euren Krankheitskosten gerechnet (§ 33 EStG).`)
  const status = rates.chosen === null || fromOcr ? ('pruefen' as const) : ('ok' as const)
  return [
    { field: 'gesundheit-gate', label: 'Krankheitskosten', value: 'Ja', status: 'ok', reason: null, screen: 'interview' },
    { field: 'gesundheit-betrag', label: 'Krankheitskosten (Summe im Jahr)', value: Math.round(chfToEur(chf, rates.rate)), status, reason: null, screen: 'interview', accumulate: true, countedItems: items },
  ]
}

/** What the statement held; the notes only when nothing was staged (then they are not said above the drafts). */
function statementSummary(read: HealthStatement, filingYear: number | null, year: number, activeYear: number, staged: boolean, notes: readonly string[]): string {
  const total = read.insured.reduce((sum, p) => sum + p.premiumCents, 0)
  const otherYear = read.taxYear !== null && read.taxYear !== activeYear
  return [
    filingYear === null
      ? `Der Auszug gehört zu ${read.taxYear}, für dieses Jahr führt die App keine Steuererklärung.`
      : `Auszug der Krankenkasse gelesen: ${read.insured.length} versicherte ${read.insured.length === 1 ? 'Person' : 'Personen'}, Grundversicherung zusammen ${formatChf(Math.round(total / 100))}.${otherYear && staged ? ` Er gehört zum Steuerjahr ${year}; dort liegen die Entwürfe.` : ''}`,
    ...(staged ? [] : notes),
  ].join(' ')
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
