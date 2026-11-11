// Church tax rules per Bundesland and church (#450 Teil 6F, ADR-0063). Every value carries its
// official source. Where no official value was found, the entry says `unknown`; the estimate then
// shows "offen" instead of guessing (product decision 10.11.2026).
import type { GermanState } from '../common/postal-codes'

export interface KirchgeldStep {
  /** Lower bound of the gemeinsam zu versteuerndes Einkommen (after § 51a Abs. 2 EStG), inclusive. */
  readonly fromZvE: number
  /** Annual besonderes Kirchgeld in EUR. */
  readonly annualEur: number
}

/**
 * Table up to 2024 (40.000 € threshold). Source: Bekanntmachungen über die Kirchensteuerbeschlüsse
 * Niedersachsen 2024 (BStBl 2024 I S. 706), Nordrhein-Westfalen 2024 (BStBl 2024 I S. 720) and
 * Rheinland-Pfalz 2023 (BStBl 2023 I S. 343), identical in all three.
 */
export const KIRCHGELD_TABLE_UNTIL_2024: readonly KirchgeldStep[] = [
  { fromZvE: 40_000, annualEur: 96 },
  { fromZvE: 47_500, annualEur: 156 },
  { fromZvE: 60_000, annualEur: 276 },
  { fromZvE: 72_500, annualEur: 396 },
  { fromZvE: 85_000, annualEur: 540 },
  { fromZvE: 97_500, annualEur: 696 },
  { fromZvE: 110_000, annualEur: 840 },
  { fromZvE: 135_000, annualEur: 1_200 },
  { fromZvE: 160_000, annualEur: 1_560 },
  { fromZvE: 185_000, annualEur: 1_860 },
  { fromZvE: 210_000, annualEur: 2_220 },
  { fromZvE: 260_000, annualEur: 2_940 },
  { fromZvE: 310_000, annualEur: 3_600 },
]

/**
 * Table from 2025 (thresholds raised by 10.000 €). Source: Bekanntmachungen 2025 Sachsen (SMF
 * 28.03.2025), Niedersachsen (BStBl 2025 I S. 1172), Nordrhein-Westfalen (BStBl 2025 I S. 2060),
 * Mecklenburg-Vorpommern (BStBl 2025 I S. 418), Berlin (BStBl 2025 I S. 300), Thüringen (TFM
 * 13.02.2025); 2026: Sachsen (SMF 28.04.2026) and Baden-Württemberg (BStBl 2026 I S. 869).
 */
export const KIRCHGELD_TABLE_FROM_2025: readonly KirchgeldStep[] = KIRCHGELD_TABLE_UNTIL_2024.map((step) => ({
  fromZvE: step.fromZvE + 10_000,
  annualEur: step.annualEur,
}))

export type ChurchKind = 'EV' | 'RK'

/** Kappung: church tax on income at most this share of the zvE. */
export type ChurchTaxCap =
  | { readonly kind: 'automatic'; readonly share: { readonly from: number; readonly to: number }; readonly source: string }
  /** Granted by the church only on application; the Finanzamt assesses without it. */
  | { readonly kind: 'on-application'; readonly source: string }
  | { readonly kind: 'none'; readonly source: string }
  | { readonly kind: 'unknown' }

/** Besonderes Kirchgeld in glaubensverschiedener Ehe, per year range. */
export type KirchgeldRule =
  | { readonly kind: 'levied'; readonly fromYear: number; readonly toYear: number; readonly source: string }
  | { readonly kind: 'not-levied'; readonly source: string }

export interface ChurchRules {
  readonly cap: ChurchTaxCap
  /** Years not covered by any entry are `unknown`. */
  readonly kirchgeld: readonly KirchgeldRule[]
}

const NOT_IN_NOTICE = 'nicht in der amtlichen Bekanntmachung genannt'
const unknown: ChurchRules = { cap: { kind: 'unknown' }, kirchgeld: [] }

export const CHURCH_RULES: Readonly<Record<GermanState, Readonly<Record<ChurchKind, ChurchRules>>>> = {
  BW: {
    EV: {
      cap: { kind: 'on-application', source: `Bekanntmachung BW 2026 (BStBl 2026 I S. 869): ${NOT_IN_NOTICE}` },
      kirchgeld: [{ kind: 'levied', fromYear: 2026, toYear: 2026, source: 'BStBl 2026 I S. 869' }],
    },
    RK: {
      cap: { kind: 'on-application', source: `Bekanntmachung BW 2026 (BStBl 2026 I S. 869): ${NOT_IN_NOTICE}` },
      kirchgeld: [{ kind: 'not-levied', source: 'BStBl 2026 I S. 869 nennt nur die ev. Landeskirchen und den Mainzer Teil (Bad Wimpfen)' }],
    },
  },
  BY: {
    EV: {
      cap: { kind: 'none', source: 'Bayern kennt keine Kappung' },
      kirchgeld: [{ kind: 'not-levied', source: 'ELKB: Verzicht auf das besondere Kirchgeld ab 2018' }],
    },
    RK: {
      cap: { kind: 'none', source: 'Bayern kennt keine Kappung' },
      kirchgeld: [{ kind: 'not-levied', source: 'DKirchStO der Freisinger Bischofskonferenz (Pastoralblatt Eichstätt 006/2024)' }],
    },
  },
  BE: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'SenFin Berlin 16.01.2025 (BStBl 2025 I S. 300)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'BStBl 2025 I S. 300' }],
    },
    RK: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'SenFin Berlin 16.01.2025 (BStBl 2025 I S. 300)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'BStBl 2025 I S. 300' }],
    },
  },
  BB: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'EKBO, wie SenFin Berlin 16.01.2025 (BStBl 2025 I S. 300)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: '6. KiStRÄG EKBO vom 21.11.2024 (GVBl. BB I Nr. 5/2025)' }],
    },
    RK: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'KiStB Erzbistum Berlin 22.11.2024 (GVBl. BB I Nr. 1/2025), Bistum Görlitz (GVBl. BB I Nr. 2/2025)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'GVBl. BB I Nr. 1/2025 und Nr. 2/2025' }],
    },
  },
  HB: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'Bremische Evangelische Kirche, Kirchensteuerordnung (Kirchentag 2017/2018)' },
      kirchgeld: [],
    },
    RK: unknown,
  },
  HH: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'Kirchensteuerbeschluss der Nordkirche (Synode 09/2013)' },
      kirchgeld: [],
    },
    RK: unknown,
  },
  // No official notice found for Hessen and the Saarland: cap and Kirchgeld stay unknown.
  HE: { EV: unknown, RK: unknown },
  MV: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'FM MV 16.01.2025 (BStBl 2025 I S. 418)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'BStBl 2025 I S. 418 („ab dem Kalenderjahr 2025“)' }],
    },
    RK: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'FM MV 16.01.2025 (BStBl 2025 I S. 418)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'BStBl 2025 I S. 418 („ab dem Kalenderjahr 2025“)' }],
    },
  },
  NI: {
    // 3 % in the Nordkirche part, 3,5 % elsewhere: a range, since the PLZ does not tell the Landeskirche.
    EV: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.035 }, source: 'NFM 30.04.2025 (BStBl 2025 I S. 1172)' },
      kirchgeld: [
        { kind: 'levied', fromYear: 2024, toYear: 2024, source: 'BStBl 2024 I S. 706' },
        { kind: 'levied', fromYear: 2025, toYear: 2025, source: 'BStBl 2025 I S. 1172' },
      ],
    },
    // 3,5 %, in the Paderborn part 4 %.
    RK: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.04 }, source: 'NFM 30.04.2025 (BStBl 2025 I S. 1172)' },
      kirchgeld: [
        { kind: 'levied', fromYear: 2024, toYear: 2024, source: 'BStBl 2024 I S. 706' },
        { kind: 'levied', fromYear: 2025, toYear: 2025, source: 'BStBl 2025 I S. 1172' },
      ],
    },
  },
  NW: {
    EV: {
      cap: { kind: 'on-application', source: `FM NRW 17.11.2025 (BStBl 2025 I S. 2060): ${NOT_IN_NOTICE}` },
      kirchgeld: [
        { kind: 'levied', fromYear: 2024, toYear: 2024, source: 'BStBl 2024 I S. 720' },
        { kind: 'levied', fromYear: 2025, toYear: 2025, source: 'BStBl 2025 I S. 2060' },
      ],
    },
    RK: {
      cap: { kind: 'on-application', source: `FM NRW 17.11.2025 (BStBl 2025 I S. 2060): ${NOT_IN_NOTICE}` },
      kirchgeld: [{ kind: 'not-levied', source: 'BStBl 2024 I S. 720 und 2025 I S. 2060 nennen nur ev. Landeskirchen, jüdische Gemeinden und Alt-Katholiken' }],
    },
  },
  RP: {
    EV: {
      cap: { kind: 'on-application', source: `FM RP 13.02.2023 (BStBl 2023 I S. 343): ${NOT_IN_NOTICE}` },
      kirchgeld: [{ kind: 'levied', fromYear: 2023, toYear: 2023, source: 'BStBl 2023 I S. 343' }],
    },
    RK: {
      cap: { kind: 'on-application', source: `FM RP 13.02.2023 (BStBl 2023 I S. 343): ${NOT_IN_NOTICE}` },
      kirchgeld: [{ kind: 'levied', fromYear: 2023, toYear: 2023, source: 'BStBl 2023 I S. 343 (Diözesen Limburg, Mainz, Speyer)' }],
    },
  },
  SL: { EV: unknown, RK: unknown },
  SN: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'SMF 28.03.2025 und 28.04.2026 (KiStB Sachsen)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'SMF 28.03.2025, 28.04.2026' }],
    },
    RK: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'SMF 28.03.2025 und 28.04.2026 (KiStB Sachsen)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'SMF 28.03.2025, 28.04.2026' }],
    },
  },
  ST: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'Landeskirchensteuerbeschluss EKM, geändert 22.11.2024 (ABl. EKM 2025 S. 65)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2026, source: 'ABl. EKM 2025 S. 65' }],
    },
    RK: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'KiStB Erzbistum Berlin 22.11.2024: „für Sachsen-Anhalt 3,5 Prozent“' },
      kirchgeld: [],
    },
  },
  SH: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.03, to: 0.03 }, source: 'Kirchensteuerbeschluss der Nordkirche (Synode 09/2013)' },
      kirchgeld: [],
    },
    RK: unknown,
  },
  TH: {
    EV: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'TFM 13.02.2025 (1040-21-S 2442/1-4-19543/2025)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2025, source: 'TFM 13.02.2025' }],
    },
    RK: {
      cap: { kind: 'automatic', share: { from: 0.035, to: 0.035 }, source: 'TFM 13.02.2025 (1040-21-S 2442/1-4-19543/2025)' },
      kirchgeld: [{ kind: 'levied', fromYear: 2025, toYear: 2025, source: 'TFM 13.02.2025' }],
    },
  },
}

/** Catholic Bad Wimpfen (PLZ 74206) belongs to the Diözese Mainz and pays 9 % (BStBl 2026 I S. 869). */
export const NINE_PERCENT_POSTAL_CODES_RK: ReadonlySet<string> = new Set(['74206'])
