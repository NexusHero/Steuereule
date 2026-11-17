/**
 * Reads a Swiss health insurer's statement for the tax return (ADR-0080): the basic-insurance (KVG)
 * premiums per insured person, and the costs they bore themselves. Insurers print one statement per
 * person (Helsana: „Auszug für die Steuererklärung“, name, birth date, insured number) or one for the
 * family (SWICA: „Kostenzusammenstellung“ per person after a family overview). OCR drops umlauts.
 */
import { foldName } from './ch-salary-certificate-parser'

export interface InsuredPremium {
  /** The name as printed, for matching to a person of the household; never sent to a model. */
  readonly name: string
  readonly insuredNo: string | null
  /** Basic insurance (KVG) premiums of the year in CHF cents. */
  readonly premiumCents: number
  /** Costs the person bore (Franchise, Selbstbehalt, not insured) in CHF cents. */
  readonly selfBorneCents: number
  /** Period of the premiums as printed („01.01.2025 - 30.06.2025“), when there is one. */
  readonly period: string | null
}

export interface ChHealthStatementRead {
  readonly insurer: string
  readonly taxYear: number | null
  readonly insured: readonly InsuredPremium[]
}

const STATEMENT = /(?:auszug|zusammenstellung|bescheinigung)\s+f(?:ü|u|ii)r\s+(?:die\s+|ihre\s+)?steuererkl|kostenzusammenstellung\s+f(?:ü|u|ii)r/i
const PREMIUM = /pr(?:ä|a|ä)m/i

export function looksLikeChHealthStatement(text: string): boolean {
  return STATEMENT.test(text ?? '') && /grundversicherung|\bKVG\b/i.test(text ?? '') && PREMIUM.test(text ?? '')
}

/** CHF amounts: „1'234.50“, „456.70“, OCR „0:00“. */
const CHF = /\d{1,3}(?:['’]\d{3})*[.:]\d{2}(?!\d)/g

function centsOf(token: string): number {
  return Number(token.replace(/\D/g, ''))
}

function lastAmount(line: string): number | null {
  const all = [...line.matchAll(CHF)]
  return all.length > 0 ? centsOf(all.at(-1)![0]) : null
}

function insurerOf(text: string): string {
  const known = /\b(helsana|swica|css|sanitas|visana|concordia|assura|groupe mutuel|kpt|sympany|atupri|egk|ökk|okk)\b/i.exec(text)?.[1]
  return (known ?? text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** One block per person: from the person's header to the next one. */
function blocks(lines: readonly string[], isHeader: (line: string, next: string) => boolean): string[][] {
  const out: string[][] = []
  lines.forEach((line, i) => {
    if (isHeader(line, lines[i + 1] ?? '')) out.push([line])
    else out.at(-1)?.push(line)
  })
  return out
}

// Helsana: „Max Beispiel, 01.02.1990, Versicherten Nr. 100 000 001“.
const NAME_CHARS = /^[A-Za-zÀ-ÿ' -]*$/i
const AFTER_NAME = /^,\s*\d{2}\.\d{2}\.\d{4},\s*versicherten[\s-]*nr\.?/i
// SWICA: „MAX BEISPIEL“ above „VERSICHERTEN-NR. 1000001“.
const INSURED_NO_LABEL = /^\s*versicherten[\s-]*nr\.?/i
const UPPERCASE_NAME_LINE = /^\s*[A-ZÀ-Ý][A-ZÀ-Ý' -]{2,}(?:[^\S ]\s*)?$/

/** The number printed after its label: its digits and inner spaces, or one space when only blanks follow. */
function numberAfterLabel(rest: string, toLineEnd: boolean): string | null {
  const body = rest.trimStart()
  const digits = /^\d[\d ]*/.exec(body)?.[0]
  if (digits !== undefined) return !toLineEnd || body.slice(digits.length).trim() === '' ? digits : null
  const gap = rest.slice(0, rest.length - body.length)
  return gap.includes(' ') && (!toLineEnd || body === '') ? ' ' : null
}

function insuredNoLine(line: string): string | null {
  const label = INSURED_NO_LABEL.exec(line)
  return label ? numberAfterLabel(line.slice(label[0].length), true) : null
}

/** The name before the first comma (at least three characters, blanks before it counted in) and the number after the label. */
function personLine(line: string): { readonly name: string; readonly insuredNo: string } | null {
  const comma = line.indexOf(',')
  if (comma === -1) return null
  const lead = line.length - line.trimStart().length
  if (lead > comma) return null
  const printed = line.slice(lead, comma)
  if (!NAME_CHARS.test(printed)) return null
  const borrowed = Math.max(0, 3 - printed.length)
  const padding = line.slice(lead - borrowed, lead)
  if (borrowed > lead || padding !== ' '.repeat(borrowed)) return null
  const rest = line.slice(comma)
  const label = AFTER_NAME.exec(rest)
  if (!label) return null
  const insuredNo = numberAfterLabel(rest.slice(label[0].length), false)
  return insuredNo === null ? null : { name: padding + printed, insuredNo }
}

function readBlock(block: readonly string[], name: string, insuredNo: string | null): InsuredPremium {
  const premiumLines = block.filter((l) => PREMIUM.test(l) && /grundversicherung|\bKVG\b/i.test(l) && lastAmount(l) !== null)
  const total = block.find((l) => /(?:total\s+versicherungspr|pr(?:ä|a)mientotal)/i.test(l) && lastAmount(l) !== null)
  const premiumCents = premiumLines.length > 0 ? premiumLines.reduce((s, l) => s + lastAmount(l)!, 0) : total ? lastAmount(total)! : 0
  const selfLine = block.find((l) => /total\s+selbstgetragene|total\s+ihres\s+kostenanteils/i.test(l) && lastAmount(l) !== null)
  const period = premiumLines.map((l) => /\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}/.exec(l)?.[0]).find(Boolean) ?? null
  return { name: name.trim(), insuredNo: insuredNo?.replace(/\s/g, '') || null, premiumCents, selfBorneCents: selfLine ? lastAmount(selfLine)! : 0, period }
}

export function parseChHealthStatement(text: string): ChHealthStatementRead {
  const lines = (text ?? '').split(/\r?\n/)
  const year = /steuererkl(?:ä|a)rung\s+(20\d{2})|zusammenstellung\s+f(?:ü|u|ii)r\s+(20\d{2})/i.exec(text ?? '')
  const taxYear = year ? Number(year[1] ?? year[2]) : null
  const insured: InsuredPremium[] = []

  for (const block of blocks(lines, (l) => personLine(l) !== null)) {
    const person = personLine(block[0]!)!
    insured.push(readBlock(block, person.name, person.insuredNo))
  }
  if (insured.length === 0) {
    for (const block of blocks(lines, (l, next) => insuredNoLine(next) !== null && UPPERCASE_NAME_LINE.test(l))) {
      insured.push(readBlock(block, block[0]!, insuredNoLine(block[1] ?? '')))
    }
  }
  // The same person twice (a statement printed with a detail page) counts once.
  const seen = new Set<string>()
  return {
    insurer: insurerOf(text ?? ''),
    taxYear,
    insured: insured.filter((p) => {
      const key = `${p.insuredNo ?? p.name.toLowerCase()}`
      if (seen.has(key) || p.premiumCents === 0) return false
      seen.add(key)
      return true
    }),
  }
}

export interface HouseholdMember {
  /** Who it is for the caller: „A“, „B“, or a child's id. */
  readonly key: string
  readonly firstName: string | null
  readonly lastName: string | null
}

/**
 * Whose premiums these are: the member whose first and last names all appear in the insured name. When
 * several fit, the one with the most names wins (a child named after a parent); a tie stays open.
 */
export function insuredMember(name: string, members: readonly HouseholdMember[]): string | null {
  const printed = new Set(foldName(name))
  const fits = members
    .map((m) => ({ key: m.key, names: [...foldName(m.firstName ?? ''), ...foldName(m.lastName ?? '')] }))
    .filter((m) => m.names.length >= 2 && m.names.every((n) => printed.has(n)))
    .sort((a, b) => b.names.length - a.names.length)
  if (fits.length === 0) return null
  return fits.length === 1 || fits[0]!.names.length > fits[1]!.names.length ? fits[0]!.key : null
}
