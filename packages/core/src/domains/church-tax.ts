// Kirchensteuer (#450 Teil 6F, ADR-0063): rate by Bundesland, Kappung, besonderes Kirchgeld in
// glaubensverschiedener Ehe and the church tax on capital income. All amounts as ranges (ADR-015).
import type { GermanState } from '../common/postal-codes'
import {
  CHURCH_RULES,
  KIRCHGELD_TABLE_FROM_2025,
  KIRCHGELD_TABLE_UNTIL_2024,
  NINE_PERCENT_POSTAL_CODES_RK,
  type ChurchKind,
  type ChurchRules,
} from './church-tax.data'

export interface ChurchTaxRange {
  readonly from: number
  readonly to: number
}

export type ChurchMembership =
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'member'; readonly church: ChurchKind | 'other' }

/** ELStAM religion key → membership. `VD` = no church levying Kirchensteuer. */
export function churchMembership(religion: string | null | undefined): ChurchMembership {
  if (religion === undefined || religion === null || religion.trim() === '') return { kind: 'unknown' }
  if (religion === 'VD') return { kind: 'none' }
  if (religion === 'EV' || religion === 'RK') return { kind: 'member', church: religion }
  return { kind: 'member', church: 'other' }
}

export type ChurchTaxAmount =
  | { readonly kind: 'none' }
  | { readonly kind: 'offen'; readonly reason: 'konfession-fehlt' | 'kappung-unbekannt' | 'kirchgeld-unbekannt' }
  | {
      readonly kind: 'spanne'
      readonly due: ChurchTaxRange
      /** The church would cap the tax on application (Kappung auf Antrag), and the cap could bite. */
      readonly capOnApplication: boolean
    }

/** The lowest Kappung rate of any Land (2,75 %): below it no cap can change the amount. */
const LOWEST_CAP_SHARE = 0.0275

/** 8 % in Bayern and Baden-Württemberg, 9 % elsewhere; the range 8–9 % while the Land is unknown. */
export function churchTaxRate(state: GermanState | null, church: ChurchKind | 'other', postalCode: string | null): ChurchTaxRange {
  if (state === null) return { from: 0.08, to: 0.09 }
  if (state === 'BW' && church === 'RK' && postalCode !== null && NINE_PERCENT_POSTAL_CODES_RK.has(postalCode)) {
    return { from: 0.09, to: 0.09 }
  }
  const rate = state === 'BY' || state === 'BW' ? 0.08 : 0.09
  return { from: rate, to: rate }
}

function rulesFor(state: GermanState | null, church: ChurchKind | 'other'): ChurchRules | null {
  if (state === null || church === 'other') return null
  return CHURCH_RULES[state][church]
}

export interface ChurchTaxOnIncomeInput {
  readonly year: number
  readonly membership: ChurchMembership
  readonly state: GermanState | null
  readonly postalCode: string | null
  /** Einkommensteuer as the § 51a Abs. 2 EStG basis (after the child allowances). */
  readonly basis: ChurchTaxRange
  /** zu versteuerndes Einkommen the Kappung refers to. */
  readonly zvE: ChurchTaxRange
}

/** Kirchensteuer on the income tax: rate, then the Kappung where the Land has one. */
export function churchTaxOnIncome(input: ChurchTaxOnIncomeInput): ChurchTaxAmount {
  if (input.membership.kind === 'none') return { kind: 'none' }
  if (input.membership.kind === 'unknown') return { kind: 'offen', reason: 'konfession-fehlt' }
  const church = input.membership.church
  const rate = churchTaxRate(input.state, church, input.postalCode)
  const uncapped = {
    from: Math.floor(Math.max(0, input.basis.from) * rate.from),
    to: Math.floor(Math.max(0, input.basis.to) * rate.to),
  }
  const capCouldBite = uncapped.to > Math.floor(LOWEST_CAP_SHARE * input.zvE.to) || uncapped.from > Math.floor(LOWEST_CAP_SHARE * input.zvE.from)
  const cap = rulesFor(input.state, church)?.cap ?? { kind: 'unknown' as const }
  switch (cap.kind) {
    case 'automatic':
      return {
        kind: 'spanne',
        due: {
          from: Math.min(uncapped.from, Math.floor(cap.share.from * input.zvE.from)),
          to: Math.min(uncapped.to, Math.floor(cap.share.to * input.zvE.to)),
        },
        capOnApplication: false,
      }
    case 'on-application':
      return { kind: 'spanne', due: uncapped, capOnApplication: capCouldBite }
    case 'none':
      return { kind: 'spanne', due: uncapped, capOnApplication: false }
    case 'unknown':
      return capCouldBite ? { kind: 'offen', reason: 'kappung-unbekannt' } : { kind: 'spanne', due: uncapped, capOnApplication: false }
  }
}

/** Besonderes Kirchgeld from the official step table of the year (0 below the first step). */
export function kirchgeldFor(year: number, jointZvE: number): number {
  const table = year >= 2025 ? KIRCHGELD_TABLE_FROM_2025 : KIRCHGELD_TABLE_UNTIL_2024
  let amount = 0
  for (const step of table) if (jointZvE >= step.fromZvE) amount = step.annualEur
  return amount
}

type KirchgeldStatus = 'levied' | 'not-levied' | 'unknown'

function kirchgeldStatus(year: number, state: GermanState | null, church: ChurchKind | 'other'): KirchgeldStatus {
  const rules = rulesFor(state, church)
  if (rules === null) return 'unknown'
  if (rules.kirchgeld.some((rule) => rule.kind === 'not-levied')) return 'not-levied'
  return rules.kirchgeld.some((rule) => rule.kind === 'levied' && year >= rule.fromYear && year <= rule.toYear) ? 'levied' : 'unknown'
}

export interface MixedMarriageInput extends ChurchTaxOnIncomeInput {
  /** The member's share of the joint income tax (ratio of the spouses' tax on their own income). */
  readonly memberShare: ChurchTaxRange
  /** Gemeinsam zu versteuerndes Einkommen after § 51a Abs. 2 EStG — the Kirchgeld basis. */
  readonly kirchgeldBase: ChurchTaxRange
}

/**
 * Glaubensverschiedene Ehe: church tax on the member's share of the joint tax (capped on the
 * member's share of the zvE), compared with the besonderes Kirchgeld — the higher amount is due.
 */
export function churchTaxMixedMarriage(input: MixedMarriageInput): ChurchTaxAmount {
  const onShare = churchTaxOnIncome({
    ...input,
    basis: { from: input.basis.from * input.memberShare.from, to: input.basis.to * input.memberShare.to },
    zvE: { from: input.zvE.from * input.memberShare.from, to: input.zvE.to * input.memberShare.to },
  })
  if (onShare.kind !== 'spanne' || input.membership.kind !== 'member') return onShare
  const kirchgeld = { from: kirchgeldFor(input.year, input.kirchgeldBase.from), to: kirchgeldFor(input.year, input.kirchgeldBase.to) }
  if (kirchgeld.to === 0) return onShare
  const status = kirchgeldStatus(input.year, input.state, input.membership.church)
  if (status === 'not-levied') return onShare
  if (status === 'unknown') return { kind: 'offen', reason: 'kirchgeld-unbekannt' }
  return {
    kind: 'spanne',
    due: { from: Math.max(onShare.due.from, kirchgeld.from), to: Math.max(onShare.due.to, kirchgeld.to) },
    capOnApplication: onShare.capOnApplication,
  }
}

/**
 * Abgeltungsteuer with church tax (§ 32d Abs. 1 Satz 4 EStG): ESt = (e − 4q) / (4 + k), the church
 * tax is k × ESt. The church tax is deductible this way, which lowers the 25 %.
 */
export function flatRateTaxWithChurchTax(
  capitalIncome: number,
  churchRate: number,
  creditableForeignTax = 0,
): { readonly incomeTax: number; readonly churchTax: number } {
  if (!Number.isFinite(capitalIncome) || capitalIncome <= 0) return { incomeTax: 0, churchTax: 0 }
  const incomeTax = Math.max(0, Math.floor((capitalIncome - 4 * creditableForeignTax) / (4 + churchRate)))
  return { incomeTax, churchTax: Math.floor(incomeTax * churchRate) }
}
