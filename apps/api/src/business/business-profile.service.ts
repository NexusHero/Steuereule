import { Inject, Injectable } from '@nestjs/common'
import { suggestProfessionKind, type BookkeepingMode, type ProfessionAnswers, type ProfessionSuggestion } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, ForbiddenError } from '../common/domain-error.js'
import {
  BUSINESS_REPOSITORY,
  type BusinessPerson,
  type BusinessRef,
  FIRST_BUSINESS,
  firstBusinessOf,
  type BusinessProfilePatch,
  type BusinessProfileRecord,
  type BusinessRepository,
} from './business.repository.js'
import { BusinessContext } from './business-context.js'
import { parseJson, personWideOf, withDefaultAnswers, withoutPersonWide } from './business-helpers.js'
import type { BusinessProfileView, DisposalFacts, LossFacts, PartnershipShare, ProfileInput, RetainedFacts, TradeTaxInputs, VatPeriodFacts } from './views.js'

/** The businesses of a person and their profiles (ADR-0101 §3, §22), and whether the path is open at all. */
@Injectable()
export class BusinessProfileService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
  ) {}

  /** Whether the path is open for the year (switch on, a business declared), for callers that must not throw. */
  async pathOpen(userId: string, year: number): Promise<boolean> {
    try {
      await this.context.assertOpen(userId, year)
      return true
    } catch (error) {
      if (error instanceof ForbiddenError) return false
      throw error
    }
  }

  private toView(record: BusinessProfileRecord | null, ref: BusinessRef, bookExists: boolean): BusinessProfileView {
    return {
      person: ref.person,
      business: ref.business,
      confirmedKind: record?.kind ?? null,
      professionAnswers: parseJson<ProfessionAnswers | null>(record?.professionAnswers ?? null, null),
      suggestion: parseJson<ProfessionSuggestion | null>(record?.suggestion ?? null, null),
      name: record?.name ?? null,
      mode: record?.mode ?? 'euer',
      chart: record?.chart ?? 'SKR03',
      smallBusiness: record?.smallBusiness ?? false,
      vatMethod: record?.vatMethod ?? 'ist',
      municipalityAgs: record?.municipalityAgs ?? null,
      multiplierOverride: record?.multiplierOverride ? Number(record.multiplierOverride) : null,
      startDate: record?.startDate ?? null,
      vatPrepaymentsCents: record?.vatPrepayments ? Number(record.vatPrepayments) : null,
      vatPeriodFacts: parseJson<VatPeriodFacts>(record?.vatPeriodFacts ?? null, {}),
      disposalFacts: parseJson<DisposalFacts | null>(record?.disposalFacts ?? null, null),
      retainedFacts: parseJson<RetainedFacts | null>(record?.retainedFacts ?? null, null),
      tradeTaxInputs: parseJson<TradeTaxInputs>(record?.tradeTaxInputs ?? null, {}),
      lossFacts: parseJson<LossFacts>(record?.lossFacts ?? null, {}),
      partnershipShares: parseJson<PartnershipShare[]>(record?.partnershipShares ?? null, []),
      bookExists,
    }
  }

  async getProfile(userId: string, year: number, ref: BusinessRef): Promise<BusinessProfileView> {
    await this.context.assertOpen(userId, year)
    const [record, book] = await Promise.all([this.context.personRecord(userId, year, ref), this.repository.loadBook(userId, year, ref)])
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.toView(record, ref, book !== null)
  }

  /** The businesses of the person in the year: at least the first, even before anything was entered. */
  async listBusinesses(userId: string, year: number, person: BusinessPerson): Promise<readonly { business: number; name: string | null; kind: 'freiberuf' | 'gewerbe' | null; mode: BookkeepingMode }[]> {
    await this.context.assertOpen(userId, year)
    const profiles = await this.repository.listProfiles(userId, year, person)
    const listed = profiles.map((p) => ({ business: p.business, name: p.name, kind: p.kind, mode: p.mode }))
    return listed.some((b) => b.business === FIRST_BUSINESS) ? listed : [{ business: FIRST_BUSINESS, name: null, kind: null, mode: 'euer' as const }, ...listed]
  }

  /** A further business of the person (ADR-0101 §22): the next number, with its name. */
  async addBusiness(userId: string, year: number, person: BusinessPerson, name: string): Promise<BusinessProfileView> {
    await this.context.assertOpen(userId, year)
    const existing = await this.repository.listProfiles(userId, year, person)
    if (!existing.some((p) => p.business === FIRST_BUSINESS)) await this.repository.saveProfile(userId, year, firstBusinessOf(person), {})
    const next = Math.max(FIRST_BUSINESS, ...existing.map((p) => p.business)) + 1
    const ref = { person, business: next }
    await this.repository.saveProfile(userId, year, ref, { name })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.getProfile(userId, year, ref)
  }

  /** Removes a further business that has no book yet; the first business and any book stay. */
  async removeBusiness(userId: string, year: number, ref: BusinessRef): Promise<void> {
    await this.context.assertOpen(userId, year)
    if (ref.business === FIRST_BUSINESS) throw new ConflictError('BUSINESS_FIRST_STAYS', 'Der erste Betrieb bleibt; du kannst ihn umbenennen.')
    const book = await this.repository.loadBook(userId, year, ref)
    if (book !== null && book.ledger.entries.length > 0) throw new ConflictError('BUSINESS_HAS_BOOK', 'In diesem Betrieb wurde schon gebucht; Buchungen bleiben erhalten (GoBD).')
    // Assets and payroll runs belong to the business: a later business with the same number must not inherit them.
    const [assets, runs] = await Promise.all([this.repository.listAssets(userId, ref, year + 50), this.repository.listPayrollRuns(userId, year, ref)])
    if (assets.length > 0 || runs.length > 0) throw new ConflictError('BUSINESS_HAS_RECORDS', 'Zu diesem Betrieb gibt es Anlagen oder Lohnläufe; er bleibt.')
    await this.repository.deleteProfile(userId, year, ref)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
  }

  async saveProfile(userId: string, year: number, ref: BusinessRef, input: ProfileInput): Promise<BusinessProfileView> {
    await this.context.assertOpen(userId, year)
    const book = await this.repository.loadBook(userId, year, ref)
    // The trigger keeps chart and mode of a book; the service says so before the database refuses.
    if (book && book.ledger.entries.length > 0 && ((input.chart !== undefined && input.chart !== book.book.chart) || (input.mode !== undefined && input.mode !== book.book.mode))) {
      throw new ConflictError('BOOK_FRAME_FIXED', 'Kontenrahmen und Gewinnermittlung stehen fest, sobald im Jahr gebucht wurde.')
    }
    // The fact objects merge key by key (WEB-30/WEB-31), against what is stored for the person.
    const stored = input.vatPeriodFacts || input.tradeTaxInputs || input.lossFacts ? await this.context.personRecord(userId, year, ref) : null
    const patch: BusinessProfilePatch = {
      ...(input.confirmedKind !== undefined ? { kind: input.confirmedKind } : {}),
      ...(input.professionAnswers !== undefined
        ? {
            professionAnswers: input.professionAnswers === null ? null : JSON.stringify(input.professionAnswers),
            // The suggestion is kept with the answers it came from, so the reasons stay explainable.
            suggestion: input.professionAnswers === null ? null : JSON.stringify(suggestProfessionKind(withDefaultAnswers(input.professionAnswers))),
          }
        : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.chart !== undefined ? { chart: input.chart } : {}),
      ...(input.smallBusiness !== undefined ? { smallBusiness: input.smallBusiness } : {}),
      ...(input.vatMethod !== undefined ? { vatMethod: input.vatMethod } : {}),
      ...(input.municipalityAgs !== undefined ? { municipalityAgs: input.municipalityAgs } : {}),
      ...(input.multiplierOverride !== undefined ? { multiplierOverride: input.multiplierOverride === null ? null : String(input.multiplierOverride) } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.vatPrepaymentsCents !== undefined ? { vatPrepayments: input.vatPrepaymentsCents === null ? null : String(input.vatPrepaymentsCents) } : {}),
      ...(input.vatPeriodFacts !== undefined ? { vatPeriodFacts: input.vatPeriodFacts === null ? null : mergeFacts(stored?.vatPeriodFacts, input.vatPeriodFacts) } : {}),
      ...(input.disposalFacts !== undefined ? { disposalFacts: input.disposalFacts === null ? null : JSON.stringify(input.disposalFacts) } : {}),
      ...(input.retainedFacts !== undefined ? { retainedFacts: input.retainedFacts === null ? null : JSON.stringify(input.retainedFacts) } : {}),
      ...(input.tradeTaxInputs !== undefined ? { tradeTaxInputs: input.tradeTaxInputs === null ? null : mergeFacts(stored?.tradeTaxInputs, input.tradeTaxInputs) } : {}),
      ...(input.lossFacts !== undefined ? { lossFacts: input.lossFacts === null ? null : mergeFacts(stored?.lossFacts, input.lossFacts) } : {}),
      ...(input.partnershipShares !== undefined ? { partnershipShares: input.partnershipShares === null ? null : JSON.stringify(input.partnershipShares) } : {}),
    }
    if (ref.business !== FIRST_BUSINESS) {
      // Person-wide facts live on the first business, whichever business the user saved them from.
      const wide = personWideOf(patch as BusinessProfileRecord)
      if (Object.values(wide).some((v) => v !== undefined)) await this.repository.saveProfile(userId, year, firstBusinessOf(ref.person), wide)
    }
    const ownPatch = ref.business === FIRST_BUSINESS ? patch : withoutPersonWide(patch)
    await this.repository.saveProfile(userId, year, ref, ownPatch)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.toView(await this.context.personRecord(userId, year, ref), ref, book !== null)
  }
}

/** Stored facts with a patch applied: a key in the patch replaces, `null` removes, a key left out stays. */
function mergeFacts(stored: string | null | undefined, patch: object): string {
  const merged: Record<string, unknown> = { ...parseJson<Record<string, unknown>>(stored ?? null, {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else if (value !== undefined) merged[key] = value
  }
  return JSON.stringify(merged)
}
