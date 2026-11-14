import type { Answers } from '../interview/interview'

/**
 * Whether the user must file (Pflichtveranlagung) or may file (Antragsveranlagung).
 * - `pflicht`: § 149 Abs. 2 AO deadline applies, late filing can cost a surcharge (§ 152 AO).
 * - `freiwillig`: § 46 Abs. 2 Nr. 8 EStG, four years (§ 169 Abs. 2 Satz 1 Nr. 2 AO), no surcharge.
 * - `unklar`: the answers so far cannot decide it (or there are none yet).
 */
export type FilingObligation = 'pflicht' | 'freiwillig' | 'unklar'

/**
 * Derives the filing obligation from the interview answers. Deliberately coarse: it only says
 * `pflicht` on a reason that is mandatory on its own, and `unklar` where the outcome hinges on
 * figures or details the interview does not ask (amount thresholds, Steuerklassen).
 */
export function filingObligation(answers: Answers): FilingObligation {
  if (Object.keys(answers).length === 0) return 'unklar'
  if (hasMandatoryReason(answers)) return 'pflicht'
  if (hasUnclearReason(answers)) return 'unklar'
  return 'freiwillig'
}

function hasMandatoryReason(answers: Answers): boolean {
  return (
    // Self-employed income without wage-tax withholding: § 25 Abs. 3 EStG, § 56 EStDV;
    // alongside a job (Beides): § 46 Abs. 2 Nr. 1 EStG (other income over 410 €).
    answers.job === 'Selbstständig' ||
    answers.job === 'Beides' ||
    // Wages from abroad are not subject to German Lohnsteuer (Grenzgänger CH, Art. 15a DBA-CH),
    // so the income is assessed by return: § 25 Abs. 3 EStG, § 56 EStDV; § 46 Abs. 2 Nr. 1 EStG.
    answers.ausland === 'Ja, in die Schweiz' ||
    answers.ausland === 'In ein anderes Land' ||
    // Wage replacement benefits (Kurzarbeiter-, Eltern-, Krankengeld …) over 410 € fall under
    // the Progressionsvorbehalt: § 46 Abs. 2 Nr. 1 EStG.
    answers.lohnersatz === 'Ja' ||
    // A second employer at the same time (Steuerklasse VI): § 46 Abs. 2 Nr. 2 EStG.
    answers.nebenjob === 'Nebenjob' ||
    // A severance pay taxed with the Fünftelregelung by the employer (§ 39b Abs. 3 Satz 9 EStG):
    // § 46 Abs. 2 Nr. 5 EStG.
    answers.abfindung === 'Ja' ||
    // Income tax prepayments were set (§ 37 EStG): the tax office expects a return
    // (§ 149 Abs. 1 Satz 2 AO, § 46 Abs. 2 Nr. 8 EStG does not apply).
    answers['vorauszahlungen-gate'] === 'Ja'
  )
}

function hasUnclearReason(answers: Answers): boolean {
  return (
    // Pensions: mandatory only when the taxable share exceeds the basic allowance
    // (§ 25 Abs. 3 EStG, § 56 EStDV) — the interview has no figure for that yet.
    answers.job === 'Rente' ||
    // Married couples: mandatory with Steuerklasse III/V or IV with factor (§ 46 Abs. 2 Nr. 3a EStG),
    // or when the partner's figures decide it — the interview does not ask the Steuerklassen.
    answers.familienstand === 'Verheiratet' ||
    // Rental income (§ 46 Abs. 2 Nr. 1 EStG, over 410 €) and capital income from abroad or crypto
    // (§ 32d Abs. 3 EStG) can make it mandatory; German broker income is settled by withholding.
    answers.einkuenfte === 'Vermietung' ||
    answers.einkuenfte === 'Kapitalerträge' ||
    answers.einkuenfte === 'Beides'
  )
}
