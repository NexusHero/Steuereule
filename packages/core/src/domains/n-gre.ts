const AHV_IV = 0.0505
const EO = 0.0025
const ALV = 0.011
const ALV_MAX_AMOUNT_CHF = 148200
const WITHHOLDING_TAX_MAX_RATE = 0.045

/** The CHF facts from the Lohnausweis and the Vorsorgeausweis, plus the EUR-per-CHF Kurs. */
export interface NGreInput {
  readonly grossWageChf: number
  readonly familienzulagenChf: number
  readonly ahvContributionsChf: number
  readonly withholdingTaxChf: number
  readonly krankentaggeldChf: number
  /** Employee contributions to the BVG-Obligatorium (Säule 2a) — Zeile 84. */
  readonly pkArbeitnehmerChf: number
  /** Employer contributions to the BVG-Obligatorium (Säule 2a) — Zeile 87. */
  readonly pkArbeitgeberChf: number
  /** All employee pension contributions (Lohnausweis Ziffer 10); absent = only the Obligatorium is known. */
  readonly pkArbeitnehmerGesamtChf?: number | undefined
  /** All employer pension contributions; the part above the Obligatorium is taxable wage (Zeile 20). */
  readonly pkArbeitgeberGesamtChf?: number | undefined
  /** Tax-free Krankentaggeld contained in Ziffer 8 (Zeile 9, also Zeile 76). */
  readonly steuerfreiesKrankentaggeldChf?: number | undefined
  readonly rate: number
  /** Employer share of the Kollektivkrankentaggeld premium in percent (0–100); absent = 0. */
  readonly krankentaggeldArbeitgeberProzent?: number | undefined
  /** Employer contribution in CHF — only needed when the employer pays everything, so nothing can be derived. */
  readonly krankentaggeldArbeitgeberChf?: number | undefined
  /** Employer share of the NBUV premium in percent (0–100); absent = 0. */
  readonly nbuvArbeitgeberProzent?: number | undefined
  readonly nbuvArbeitgeberChf?: number | undefined
}

export type NGreRow =
  | 'z6' | 'z8' | 'z9' | 'z15' | 'z18' | 'z19' | 'z20' | 'z23' | 'z25'
  | 'z75' | 'z76' | 'z77' | 'z78' | 'z79' | 'z80' | 'z81' | 'z82'
  | 'z83' | 'z84' | 'z85' | 'z86' | 'z87' | 'z88'

/** Who pays a premium (N-Gre Zeilen 95/96 for Krankentaggeld, 97/98 for NBUV) — percent and CHF. */
export interface PremiumSplit {
  readonly employerPercent: number
  readonly employeePercent: number
  readonly employerChf: number
  readonly employeeChf: number
}

/** One side's pension contributions split into BVG-Obligatorium (Säule 2a) and Überobligatorium (Säule 2b). */
export interface PensionSplit {
  readonly mandatoryChf: number
  readonly overMandatoryChf: number
}

export interface NGreAmounts {
  readonly chf: Readonly<Record<NGreRow, number>>
  readonly eur: Readonly<Record<NGreRow, number>>
  readonly split: { readonly dailySicknessAllowance: PremiumSplit; readonly nbuv: PremiumSplit }
  readonly pension: { readonly employee: PensionSplit; readonly employer: PensionSplit }
}

/** The total minus the Obligatorium; without a total nothing above the Obligatorium is known. */
function pensionSplit(mandatoryChf: number, totalChf: number | undefined): PensionSplit {
  return { mandatoryChf, overMandatoryChf: totalChf === undefined ? 0 : Math.max(0, totalChf - mandatoryChf) }
}

/**
 * The employer's part of a premium the employee pays the rest of. With 100 % the employee part is 0 —
 * whatever the derived employee amount says (for the NBUV it is only the residue of Ziffer 9) — and
 * nothing can be derived, so the given CHF amount is used.
 */
function split(employeeChf: number, percent: number | undefined, employerChfGiven: number | undefined): PremiumSplit {
  const employerPercent = Math.min(100, Math.max(0, percent ?? 0))
  const employerChf =
    employerChfGiven !== undefined
      ? employerChfGiven
      : employerPercent === 0 || employerPercent === 100
        ? 0
        : Math.round((employeeChf * employerPercent) / (100 - employerPercent))
  return { employerPercent, employeePercent: 100 - employerPercent, employerChf, employeeChf: employerPercent === 100 ? 0 : employeeChf }
}

export function annexNGreAmounts(e: NGreInput): NGreAmounts {
  const sickPay = e.steuerfreiesKrankentaggeldChf ?? 0
  const basis = e.grossWageChf - e.familienzulagenChf - sickPay
  const ahv = Math.round(basis * AHV_IV)
  const eo = Math.round(basis * EO)
  const alv = Math.round(Math.min(basis, ALV_MAX_AMOUNT_CHF) * ALV)
  const nbuvEmployee = Math.max(0, e.ahvContributionsChf - ahv - eo - alv)
  const dailySicknessAllowance = split(e.krankentaggeldChf, e.krankentaggeldArbeitgeberProzent, e.krankentaggeldArbeitgeberChf)
  const nbuv = split(nbuvEmployee, e.nbuvArbeitgeberProzent, e.nbuvArbeitgeberChf)
  const employeePension = pensionSplit(e.pkArbeitnehmerChf, e.pkArbeitnehmerGesamtChf)
  const employerPension = pensionSplit(e.pkArbeitgeberChf, e.pkArbeitgeberGesamtChf)

  const parts = {
    z6: e.grossWageChf,
    z8: e.familienzulagenChf,
    z9: sickPay,
    // The employer's premiums are taxable wage (Z. 18/19, "vgl. Zeile 80/81") and therefore also count
    // as the employee's contributions in Z. 80/81.
    z18: dailySicknessAllowance.employerChf,
    z19: nbuv.employerChf,
    // The employer's contributions above the BVG-Obligatorium (Säule 2b) are taxable wage.
    z20: employerPension.overMandatoryChf,
    z25: Math.min(e.withholdingTaxChf, Math.round(e.grossWageChf * WITHHOLDING_TAX_MAX_RATE)),
    z78: eo,
    z79: alv,
    z80: dailySicknessAllowance.employeeChf + dailySicknessAllowance.employerChf,
    z81: Math.round((nbuv.employeeChf + nbuv.employerChf) / 2),
    z83: ahv,
    // Only the Obligatorium is a basic pension contribution (Kz 300/304).
    z84: employeePension.mandatoryChf,
    z87: employerPension.mandatoryChf,
  }
  const sums = (t: typeof parts): Record<NGreRow, number> => ({
    ...t,
    z15: t.z6 - t.z8 - t.z9,
    z23: t.z6 - t.z8 - t.z9 + t.z18 + t.z19 + t.z20,
    z75: t.z6,
    z76: t.z8 + t.z9,
    z77: t.z6 - t.z8 - t.z9,
    z82: t.z78 + t.z79 + t.z80 + t.z81,
    z85: t.z83 + t.z84,
    z86: t.z83,
    z88: t.z83 + t.z87,
  })
  const inEur = Object.fromEntries(Object.entries(parts).map(([row, chf]) => [row, Math.round(chf * e.rate)])) as typeof parts
  return {
    chf: sums(parts),
    eur: sums(inEur),
    split: { dailySicknessAllowance, nbuv },
    pension: { employee: employeePension, employer: employerPension },
  }
}
