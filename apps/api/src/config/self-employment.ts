import { declaresBusiness, type Answers, type InterviewOptions } from '@steuereule/core'

/**
 * The server switch of ADR-0101 §20: `SELBSTSTAENDIGE_ENABLED`. Off (the default, also when unset or
 * misspelt) the Gewerbe-Gate of REQ-015 stops the self-employed exactly as before; on, „Selbstständig“
 * and „Beides“ lead into the self-employment path. Read on every call, not at boot, so a test can flip
 * it and the product owner's change takes effect with the next request after a restart of the env.
 */
export function selfEmploymentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.SELBSTSTAENDIGE_ENABLED?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

/** The interview graph options every server-side caller of the gate passes (`nextStepFor`, `gatedIncomeTypes`). */
export function interviewOptions(env: NodeJS.ProcessEnv = process.env): InterviewOptions {
  return { selfEmployment: selfEmploymentEnabled(env) }
}

/**
 * How the year is filed (ADR-0101 §16): with self-employment (switch on) through Mein ELSTER with the
 * fill-in help; otherwise on paper with the printout (ADR-0050).
 */
export type FilingPath = 'papier' | 'elster-ausfuellhilfe'

export function filingPathOf(answers: Answers, env: NodeJS.ProcessEnv = process.env): FilingPath {
  return selfEmploymentEnabled(env) && declaresSelfEmployment(answers) ? 'elster-ausfuellhilfe' : 'papier'
}

/** The answers that have a business behind them: „Selbstständig“, „Beides“, or a pensioner with one (ADR-0101 §22). */
export function declaresSelfEmployment(answers: Answers): boolean {
  return declaresBusiness(answers)
}
