import { Inject, Injectable } from '@nestjs/common'
import {
  accountFor,
  companyCarUse,
  type CompanyCarInput,
  type CompanyCarResult,
  USEFUL_LIVES,
  type AssetCategory,
  depreciationDrafts,
  disposalDrafts,
  assetRegister,
  type BookingDraft,
  type JournalEntry,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { BUSINESS_REPOSITORY, type BusinessRef, type BusinessRepository, type FixedAssetRecord, type NewFixedAsset } from './business.repository.js'
import { bankAccountOf, registerAssetOf, vatCorrectionOf } from './business-ledger.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { ledgerCall } from './business-helpers.js'
import type { BuildingFactsInput, SpecialDepreciationInput, VatCorrectionInput } from './views.js'

/** Fixed assets (ADR-0101 §7): the register, depreciation and disposals booked through the ledger, and the Firmenwagen (§22). */
@Injectable()
export class AssetService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

  async assets(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const records = await this.repository.listAssets(userId, ref, year)
    const register = assetRegister(records.map((r) => registerAssetOf(r, year)), year)
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return { register, records }
  }

  async createAsset(
    userId: string,
    year: number,
    ref: BusinessRef,
    input: {
      label: string
      account: string
      acquisitionDate: string
      acquisitionCostCents: number
      method: string
      category?: string | undefined
      usefulLifeYears?: number | undefined
      building?: BuildingFactsInput | undefined
      specialDepreciation?: SpecialDepreciationInput | undefined
    },
  ): Promise<FixedAssetRecord> {
    await this.context.assertOpen(userId, year)
    if (Number(input.acquisitionDate.slice(0, 4)) > year) throw new InvalidInputError('ASSET_FUTURE', 'Das Anschaffungsdatum liegt nach diesem Jahr.')
    const asset: NewFixedAsset = {
      taxYear: Number(input.acquisitionDate.slice(0, 4)),
      person: ref.person,
      business: ref.business,
      label: input.label,
      account: input.account,
      acquisitionDate: input.acquisitionDate,
      acquisitionCost: input.acquisitionCostCents,
      method: input.method,
      category: input.category ?? null,
      // The category sets the useful life when none is given (the DTO's contract), as on the booking path.
      usefulLifeYears: input.usefulLifeYears ?? (input.category && Object.hasOwn(USEFUL_LIVES, input.category) ? USEFUL_LIVES[input.category as AssetCategory].years : null),
      specialDepreciation: input.specialDepreciation ? JSON.stringify(input.specialDepreciation) : null,
      disposal: null,
      buildingFacts: input.building ? JSON.stringify(input.building) : null,
      vatCorrection: null,
    }
    // The schedule must be computable now, not only at the year's end, and before anything is stored.
    ledgerCall(() => registerAssetOf({ ...asset, id: 'neu' }, year))
    const record = await this.repository.createAsset(userId, asset)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return record
  }

  /**
   * The Sonder-AfA (§ 7g Abs. 5 EStG), chosen per year in the acquisition year and the four after it, and the
   * Vorsteuerberichtigung (§ 15a UStG) of an asset. `null` clears one; the schedule must stay computable.
   */
  async setAssetFacts(userId: string, year: number, ref: BusinessRef, assetId: string, facts: { specialDepreciation?: SpecialDepreciationInput | null | undefined; vatCorrection?: VatCorrectionInput | null | undefined }): Promise<FixedAssetRecord> {
    await this.context.assertOpen(userId, year)
    const current = (await this.repository.listAssets(userId, ref, year)).find((a) => a.id === assetId)
    if (!current) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    const patch = {
      ...(facts.specialDepreciation !== undefined ? { specialDepreciation: facts.specialDepreciation === null ? null : JSON.stringify(facts.specialDepreciation) } : {}),
      ...(facts.vatCorrection !== undefined ? { vatCorrection: facts.vatCorrection === null ? null : JSON.stringify(facts.vatCorrection) } : {}),
    }
    const next = { ...current, ...patch }
    ledgerCall(() => registerAssetOf(next, year))
    ledgerCall(() => vatCorrectionOf(next))
    const updated = await this.repository.setAssetFacts(userId, assetId, patch)
    if (!updated) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return updated
  }

  async disposeAsset(userId: string, year: number, ref: BusinessRef, assetId: string, disposal: { date: string; proceedsCents?: number | undefined }): Promise<FixedAssetRecord> {
    await this.context.assertOpen(userId, year)
    const updated = await this.repository.setAssetDisposal(userId, assetId, JSON.stringify(disposal))
    if (!updated) throw new NotFoundError('ASSET_NOT_FOUND', 'Dieses Anlagegut gibt es nicht.')
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return updated
  }

  /** Books the year's depreciation and disposals the core computed, once per asset and year. */
  async bookDepreciation(userId: string, year: number, ref: BusinessRef): Promise<readonly JournalEntry[]> {
    await this.context.assertOpen(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const assets = (await this.repository.listAssets(userId, ref, year)).map((r) => registerAssetOf(r, year))
    const posted = await this.ledger.postDrafts(userId, year, ref, { chart, mode }, profile, (book) => {
      const booked = new Set(book.sources.values())
      return [
        ...ledgerCall(() => depreciationDrafts(chart, assets, year)).map((draft) => ({ draft, source: `afa:${draft.documentNumber}` })),
        ...ledgerCall(() => disposalDrafts(chart, assets, year, bankAccountOf(chart))).map((draft) => ({ draft, source: `abgang:${draft.documentNumber}` })),
      ].filter((d) => !booked.has(d.source))
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return posted
  }

  /** The private use of a business car: computed, nothing booked. A Kleinunternehmer owes no Wertabgabe. */
  async companyCar(userId: string, year: number, ref: BusinessRef, input: Omit<CompanyCarInput, 'year' | 'vatDeductible'>): Promise<CompanyCarResult> {
    await this.context.assertOpen(userId, year)
    const profile = await this.context.personRecord(userId, year, ref)
    return companyCarUse({ ...input, year, vatDeductible: !(profile?.smallBusiness ?? false) })
  }

  /**
   * Books the year's private use: the Entnahme (income tax value on the EÜR line, the VAT on its full
   * base through the 19 % account, the rest without VAT) and the non-deductible commute moved off the
   * car costs. Two entries dated 31.12., source `kfz`.
   */
  async bookCompanyCar(userId: string, year: number, ref: BusinessRef, input: Omit<CompanyCarInput, 'year' | 'vatDeductible'>): Promise<readonly JournalEntry[]> {
    const result = await this.companyCar(userId, year, ref, input)
    if (result.kind !== 'berechnet') throw new InvalidInputError('CAR_NOT_COMPUTABLE', result.kind === 'offen' ? 'Für das Fahrtenbuch fehlen Gesamtkosten oder Privatanteil.' : 'Die 1-%-Regel gilt nur bei mehr als 50 % betrieblicher Nutzung.')
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const n = (concept: Parameters<typeof accountFor>[1]) => accountFor(chart, concept).number
    const c = (eurAmount: number) => Math.round(eurAmount * 100)
    const drafts: { draft: BookingDraft; source: string }[] = []
    const use = c(result.privateUseEur)
    const base = c(result.vat?.baseEur ?? 0)
    const vat = c(result.vat?.vatEur ?? 0)
    if (use > 0 || base > 0) {
      const rest = use - base
      drafts.push({
        source: 'kfz',
        draft: {
          date: `${year}-12-31`,
          documentNumber: `Kfz-Privat-${year}`,
          text: `Private Kfz-Nutzung ${year} (${result.method === 'pauschal' ? '1-%-Regel' : 'Fahrtenbuch'})`,
          lines: [
            { account: n('private_withdrawals'), side: 'debit', amount: use + vat },
            ...(base > 0 ? [{ account: n('private_car_use_19'), side: 'credit' as const, amount: base, taxKey: 'ust19' as const, amountIs: 'net' as const }] : []),
            // An electric car: the VAT base above the income tax value; the difference comes back off the EÜR line.
            ...(rest > 0 ? [{ account: n('private_car_use_free'), side: 'credit' as const, amount: rest }] : rest < 0 ? [{ account: n('private_car_use_free'), side: 'debit' as const, amount: -rest }] : []),
          ],
        },
      })
    }
    const commute = c(result.commute?.nonDeductibleEur ?? 0)
    if (commute > 0) {
      drafts.push({
        source: 'kfz',
        draft: {
          date: `${year}-12-31`,
          documentNumber: `Kfz-Wege-${year}`,
          text: `Wege Wohnung–Betrieb ${year}, nicht abziehbarer Teil (§ 4 Abs. 5 Satz 1 Nr. 6 EStG)`,
          lines: [
            { account: n('commute_nondeductible'), side: 'debit', amount: commute },
            { account: n('vehicle_other'), side: 'credit', amount: commute },
          ],
        },
      })
    }
    const posted = await this.ledger.postDrafts(userId, year, ref, { chart, mode }, profile, () => drafts)
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return posted
  }
}
