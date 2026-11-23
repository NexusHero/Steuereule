import type { AssessmentExplanation, AssessmentPositionId } from './assessment'

/**
 * The Einkommensteuerbescheid as a document (ADR-0098 §4): told apart from the LStB it quotes, and its
 * Besteuerungsgrundlagen read deterministically, line by line. Whatever no line gives stays absent, so
 * it is `not_read` downstream — never 0. A Bescheid prints joint figures in two columns (A, B).
 */

const NOTICE_TITLE = /bescheid\s+f(?:ü|ue|u)r\s+(?:das\s+jahr\s+)?20\d\d\s+(?:über|ueber)\s+einkommensteuer|einkommensteuerbescheid/i
const NOTICE_MARKERS = [/zu\s+versteuerndes\s+einkommen/i, /festgesetzt/i, /besteuerungsgrundlagen/i, /einspruch/i]

/** A tax notice, told by its title and one of what every notice prints. */
export function looksLikeAssessmentNotice(text: string): boolean {
  if (!text) return false
  return NOTICE_TITLE.test(text) && NOTICE_MARKERS.some((re) => re.test(text))
}

export interface AssessmentNoticeRead {
  readonly taxYear: number | null
  /** The date printed on the notice (ISO); the Einspruchsfrist runs from it. */
  readonly assessmentDate: string | null
  readonly positions: Partial<Record<AssessmentPositionId, number>>
  /** The Finanzamt's explanations as printed, one per paragraph. */
  readonly explanations: readonly string[]
}

// A number token is one run of digits, dots and commas: a single character class, so the search is
// linear (Sonar S8786). Each token is then checked whole against the two forms a Bescheid prints.
const NUMBER_TOKEN = /-?\d[\d.,]*/g
const GROUPED_AMOUNT = /^-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/
// No basis on a Bescheid has more than nine digits; a longer run is a reference number, not an amount.
const PLAIN_AMOUNT = /^-?\d{1,9}(?:,\d{2})?$/

/** The euro amounts on a line, cents dropped as the Bescheid's whole-euro bases are; dates, years and § numbers skipped. */
function amountsOf(line: string): number[] {
  const withoutRefs = line
    .replace(/§\s*\d+[a-z]?(?:\s+abs\.?\s*\d+)?/gi, '')
    .replace(/\d{2}\.\d{2}\.\d{4}/g, '')
    .replace(/\b(?:f(?:ü|ue|u)r|jahr|veranlagungszeitraum)\s+20\d\d\b/gi, '')
  return [...withoutRefs.matchAll(NUMBER_TOKEN)]
    .map((m) => m[0].replace(/[.,]$/, ''))
    .filter((token) => GROUPED_AMOUNT.test(token) || PLAIN_AMOUNT.test(token))
    .map((token) => Math.trunc(Number(token.replace(/\./g, '').replace(',', '.'))))
}

type Rule = {
  readonly match: RegExp
  /** Two columns (A, B) or the one household amount. */
  readonly columns: readonly AssessmentPositionId[]
}

/** In form order; the first rule that matches a line reads it. */
const RULES: readonly Rule[] = [
  { match: /bruttoarbeitslohn/i, columns: ['bruttoarbeitslohnA', 'bruttoarbeitslohnB'] },
  { match: /entfernungspauschale|erste\s+t(?:ä|ae)tigkeitsst(?:ä|ae)tte/i, columns: ['fahrtwegA', 'fahrtwegB'] },
  { match: /homeoffice|h(?:ä|ae)usliche[nr]?\s+(?:wohnung|arbeitszimmer)|tagespauschale/i, columns: ['homeofficeA', 'homeofficeB'] },
  { match: /arbeitsmittel/i, columns: ['arbeitsmittelA', 'arbeitsmittelB'] },
  { match: /(?:sonstige|weitere|(?:ü|ue)brige)\s+werbungskosten/i, columns: ['sonstigeWerbungskostenA', 'sonstigeWerbungskostenB'] },
  { match: /werbungskosten|arbeitnehmer-?pauschbetrag/i, columns: ['werbungskostenA', 'werbungskostenB'] },
  { match: /vorsorgeaufwendungen/i, columns: ['vorsorgeaufwand'] },
  { match: /au(?:ß|ss)ergew(?:ö|oe)hnliche\s+belastung/i, columns: ['aussergewoehnlicheBelastungen'] },
  { match: /sonderausgaben/i, columns: ['sonderausgaben'] },
  { match: /zu\s+versteuerndes\s+einkommen/i, columns: ['zuVersteuerndesEinkommen'] },
  { match: /§\s*35a|haushaltsnahe|handwerkerleistung/i, columns: ['steuerermaessigung35a'] },
  { match: /(?:anzurechnen|einbehalten|abzüglich|abzgl).{0,40}lohnsteuer|lohnsteuer.{0,40}(?:anzurechnen|einbehalten)/i, columns: ['anrechnung'] },
]

/** „festgesetzt werden“: Einkommensteuer, Solidaritätszuschlag, Kirchensteuer in that order. */
const ASSESSED_LINE = /festgesetzt\s+werden|^\s*festgesetzte?\s/i
const REFUND_LINE = /(?:zu\s+)?erstatten|erstattung|guthaben/i
const BACK_PAYMENT_LINE = /nachzahlung|nachzuzahlen|bitte\s+zahlen|zu\s+zahlen|abschlusszahlung/i
const EXPLANATIONS_HEAD = /^\s*erl(?:ä|ae)uterungen\b/i
const TAX_YEAR = /(?:bescheid\s+f(?:ü|ue|u)r\s+(?:das\s+jahr\s+)?|einkommensteuer(?:bescheid)?\s+)(20\d\d)/i
const DATE = /(\d{2})\.(\d{2})\.(20\d\d)/

export function parseAssessmentNotice(text: string): AssessmentNoticeRead {
  const lines = (text ?? '').split(/\r?\n/)
  const head = lines.findIndex((l) => EXPLANATIONS_HEAD.test(l))
  const body = head === -1 ? lines : lines.slice(0, head)
  const positions: Partial<Record<AssessmentPositionId, number>> = {}
  const take = (id: AssessmentPositionId, value: number | undefined) => {
    if (value !== undefined && positions[id] === undefined) positions[id] = value
  }

  for (const line of body) {
    const amounts = amountsOf(line)
    if (amounts.length === 0) continue
    if (ASSESSED_LINE.test(line)) {
      take('festgesetzteSteuer', amounts[0])
      take('solidaritaetszuschlag', amounts[1])
      take('kirchensteuer', amounts[2])
      continue
    }
    if (BACK_PAYMENT_LINE.test(line)) {
      take('erstattung', -Math.abs(amounts[amounts.length - 1]!))
      continue
    }
    if (REFUND_LINE.test(line) && !/lohnsteuer/i.test(line)) {
      take('erstattung', Math.abs(amounts[amounts.length - 1]!))
      continue
    }
    const rule = RULES.find((r) => r.match.test(line))
    if (rule === undefined) continue
    if (rule.columns.length === 2) {
      take(rule.columns[0]!, amounts[0])
      take(rule.columns[1]!, amounts[1])
    } else {
      take(rule.columns[0]!, amounts[amounts.length - 1])
    }
  }

  const year = TAX_YEAR.exec(text ?? '')?.[1]
  const date = lines.slice(0, 15).map((l) => DATE.exec(l)).find((m) => m !== null)
  return {
    taxYear: year === undefined ? null : Number(year),
    assessmentDate: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
    positions,
    explanations: head === -1 ? [] : paragraphs(lines.slice(head + 1)),
  }
}

/** Paragraphs of the Erläuterungen: separated by a blank line or a new bullet. */
function paragraphs(lines: readonly string[]): string[] {
  const out: string[] = []
  let current: string[] = []
  const flush = () => {
    const joined = current.join(' ').replace(/\s+/g, ' ').trim()
    if (joined) out.push(joined)
    current = []
  }
  for (const line of lines) {
    if (line.trim() === '' || /^\s*(?:[-•*]|\d+\.)\s+/.test(line)) flush()
    if (line.trim() !== '') current.push(line.replace(/^\s*(?:[-•*]|\d+\.)\s+/, ''))
  }
  flush()
  return out
}

const EXPLANATION_POSITIONS: ReadonlyArray<{ readonly match: RegExp; readonly position: AssessmentPositionId }> = [
  { match: /homeoffice|h(?:ä|ae)usliche[nr]?\s+wohnung|tagespauschale/i, position: 'homeofficeA' },
  { match: /arbeitsmittel|mobiltelefon|telefon|computer|laptop/i, position: 'arbeitsmittelA' },
  { match: /entfernungspauschale|fahrten|arbeitsweg|kilometer/i, position: 'fahrtwegA' },
  { match: /vorsorgeaufwendungen|versicherung/i, position: 'vorsorgeaufwand' },
  { match: /spende|zuwendung|sonderausgaben/i, position: 'sonderausgaben' },
  { match: /au(?:ß|ss)ergew(?:ö|oe)hnliche|krankheitskosten/i, position: 'aussergewoehnlicheBelastungen' },
  { match: /§\s*35a|haushaltsnah|handwerker/i, position: 'steuerermaessigung35a' },
]

/**
 * The stored Erläuterungen tied to the position they explain, by what they talk about. Person B is
 * named where the text says so; otherwise a Werbungskosten explanation is A's.
 */
export function assessmentExplanations(text: string | null): AssessmentExplanation[] {
  if (!text) return []
  return text
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const found = EXPLANATION_POSITIONS.find((e) => e.match.test(t))?.position ?? null
      const forB = found !== null && found.endsWith('A') && /ehefrau|person\s*b|ehegatt/i.test(t)
      return { position: forB ? (found.replace(/A$/, 'B') as AssessmentPositionId) : found, text: t }
    })
}
