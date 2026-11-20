import { amountFromAnswer, declaresBusiness, paysOwnProvision, type Answers } from '../interview/interview'
import { healthInsuranceFromAnswers } from './health-insurance'
import type { PersonProvision } from './provision'

export { declaresBusiness, paysOwnProvision }

/**
 * The provision of someone whose wage tax certificate does not carry it (ADR-0101 §22): the
 * self-employed and the pensioner with a business. The lines go into `deductibleProvision` as they
 * are entered: the KV unreduced (the 4 % for a Krankengeld claim is cut there, once, on the KV only),
 * the care insurance on its own line, the extras and the other insurance under the cap of
 * § 10 Abs. 4 EStG, the pension contributions under the Höchstbetrag of § 10 Abs. 3.
 */
export function selfPaidProvisionFromAnswers(answers: Answers): PersonProvision {
  const amount = (value: string | undefined) => Math.max(0, amountFromAnswer(value) ?? 0)
  const kv = healthInsuranceFromAnswers(answers)
  const pension = answers.altersvorsorge === 'Ja'
  return {
    pensionOwnEur: pension ? amount(answers['av-rv-betrag']) + amount(answers['av-versorgungswerk-betrag']) + amount(answers['av-basisrente-betrag']) : 0,
    pensionEmployerEur: 0,
    healthBasicEur: kv?.basicHealthAmount ?? 0,
    healthWithSickPayEur: kv?.withSickPay ? kv.basicHealthAmount : 0,
    careEur: kv?.careInsuranceAmount ?? 0,
    employerSubsidyEur: 0,
    otherEur: (kv?.optionalExtrasAmount ?? 0) + (answers.versicherungen === 'Ja' ? amount(answers['versicherungen-betrag']) : 0),
    // The Künstlersozialkasse carries half of the KV like an employer (§ 10 Abs. 4 Satz 2 EStG).
    reducedOtherCap: pension && answers['av-ksk'] === 'Ja',
  }
}
