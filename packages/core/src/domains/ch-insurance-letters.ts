/**
 * The Swiss letters a cross-border commuter needs beside the Lohnausweis for Anlage N-Gre:
 * - the pension fund's statement of mandatory (BVG, Säule 2a) and supplementary contributions,
 *   employee and employer (Zeilen 20, 84, 87);
 * - the employer's letter on the premiums it paid for sickness pay (Krankentaggeld) and
 *   non-occupational accident insurance (NBU) (Zeilen 18, 19, 95–98).
 *
 * Neither is a standard form: every fund and employer writes its own. The rules read the layouts
 * that occur (rows with an employee and an employer column, or a table per side) and leave open what
 * they cannot read; a model may fill gaps only from the amount lines (`selectChInsuranceLetterAmountLines`).
 */

export type ChInsuranceLetterKind = 'chPensionskasse' | 'chPraemien'

export interface PensionSide {
  /** All contributions of this side in CHF; null when the letter does not give all of them. */
  readonly total: number | null
  /** The BVG-Obligatorium (Säule 2a). */
  readonly mandatory: number | null
  /** Above the Obligatorium (Säule 2b). */
  readonly supplementary: number | null
}

export interface ChPensionStatement {
  readonly taxYear: number | null
  readonly employee: PensionSide
  readonly employer: PensionSide
  /** Mandatory + supplementary = total on both sides, where the letter prints all three. */
  readonly checks: { readonly split: 'ok' | 'conflict' | 'unknown' }
}

export interface ChPremiumLetter {
  readonly taxYear: number | null
  /** Krankentaggeld premium the employer paid, CHF. */
  readonly sicknessPayChf: number | null
  /** NBU premium the employer paid, CHF. */
  readonly accidentChf: number | null
  /** The letter says the employer pays the whole premium and charges the staff nothing. */
  readonly employerPaysFull: boolean
}

const PENSION_LETTER = /obligatorisch/i
const PENSION_SENDER = /pensionskasse|pension\s+fund|vorsorge|2\.\s*s(?:ä|a)ule|\bBVG\b/i
const SICKNESS = /krankentaggeld/i
const ACCIDENT = /nicht\s*-?\s*be(?:rufs|triebs)\s*-?\s*unfall|\bNBU/i

export function classifyChInsuranceLetter(text: string): ChInsuranceLetterKind | null {
  if (!text) return null
  if (PENSION_LETTER.test(text) && PENSION_SENDER.test(text)) return 'chPensionskasse'
  if (SICKNESS.test(text) && ACCIDENT.test(text) && /pr(?:ä|a)mie|beitr(?:ä|a)g/i.test(text)) return 'chPraemien'
  return null
}

/** "2'200.10", "4°500.00", "1409.90", "412,35": CHF with cents. OCR's apostrophe variants count as thousands. */
const CHF_WITH_CENTS = /-?\d{1,3}(?:[’'`°´]\d{3})*[.,]\d{2}(?!\d)|-?\d{4,}[.,]\d{2}(?!\d)/g

function chf(token: string): number {
  return Math.abs(Number(token.replace(/[’'`°´]/g, '').replace(',', '.')))
}

function amountsIn(line: string): number[] {
  const found = [...line.matchAll(CHF_WITH_CENTS)].map((m) => chf(m[0]))
  if (found.length > 0) return found
  // Whole francs next to "CHF": "CHF 378", "378 CHF".
  return [...line.matchAll(/CHF\s*(\d{1,3}(?:[’'`°´]\d{3})*|\d+)\b|\b(\d{1,3}(?:[’'`°´]\d{3})*|\d+)\s*CHF/g)].map((m) => chf(m[1] ?? m[2]!))
}

function letterYear(text: string): number | null {
  const m = /(?:Steuerjahr|Jahr|Altersvorsorge|versicherung)\s+(20\d{2})\b/i.exec(text)
  return m?.[1] ? Number(m[1]) : null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: readonly number[]) => round2(xs.reduce((s, x) => s + x, 0))

/** "Uberobligatorisch", "Überobligatorisch", "iiberobligatorisch": OCR loses the umlaut differently. */
const SUPPLEMENTARY_ROW = /^\W*(?:ü|u|ue|ii|i)?ber\s*obligator/i
const MANDATORY_ROW = /^\W*obligator/i
const TOTAL_ROW = /^\W*total\s+a([ng])\b(?!\s*\+)/i

function readTable(lines: readonly string[]) {
  const sides = { AN: { total: null as number | null, mandatory: null as number | null, supplementary: null as number | null }, AG: { total: null as number | null, mandatory: null as number | null, supplementary: null as number | null } }
  let side: 'AN' | 'AG' | null = null
  for (const line of lines) {
    const hasEmployee = /nehmer/i.test(line)
    const hasEmployer = /geber/i.test(line)
    if (hasEmployee !== hasEmployer && !MANDATORY_ROW.test(line) && !SUPPLEMENTARY_ROW.test(line)) side = hasEmployee ? 'AN' : 'AG'
    const total = TOTAL_ROW.exec(line)
    const last = amountsIn(line).at(-1)
    if (last === undefined) continue
    if (total) sides[total[1]!.toUpperCase() === 'N' ? 'AN' : 'AG'].total = last
    else if (side && SUPPLEMENTARY_ROW.test(line)) sides[side].supplementary = last
    else if (side && MANDATORY_ROW.test(line)) sides[side].mandatory = last
  }
  return sides
}

function readRows(lines: readonly string[]) {
  const totals: { kind: string; an: number; ag: number }[] = []
  const mandatory: { kind: string; an: number; ag: number }[] = []
  for (const line of lines) {
    if (!/beitr/i.test(line)) continue
    const amounts = amountsIn(line)
    if (amounts.length < 2) continue
    const [an, ag] = amounts.slice(-2) as [number, number]
    const kind = /spar/i.test(line) ? 'spar' : /risiko/i.test(line) ? 'risiko' : 'other'
    ;(/obligator|\bBVG\b/i.test(line) ? mandatory : totals).push({ kind, an, ag })
  }
  // A total is only whole when every kind of contribution the mandatory rows show is there too:
  // OCR that lost the "Sparbeitrag" row must not turn the risk premium into the total.
  const complete = mandatory.every((m) => totals.some((t) => t.kind === m.kind))
  const side = (pick: 'an' | 'ag') => {
    const total = totals.length > 0 && complete ? sum(totals.map((t) => t[pick])) : null
    const mand = mandatory.length > 0 ? sum(mandatory.map((m) => m[pick])) : null
    return { total, mandatory: mand, supplementary: total !== null && mand !== null ? round2(total - mand) : null }
  }
  return { AN: side('an'), AG: side('ag') }
}

export function parseChPensionStatement(text: string): ChPensionStatement {
  const lines = (text ?? '').split(/\r?\n/)
  const rowsLayout = lines.some((l) => /nehmer\S*\s+arbeitgeber/i.test(l))
  const sides = rowsLayout ? readRows(lines) : readTable(lines)
  if (!rowsLayout) {
    for (const s of [sides.AN, sides.AG]) {
      if (s.total === null && s.mandatory !== null && s.supplementary !== null) s.total = round2(s.mandatory + s.supplementary)
      if (s.supplementary === null && s.mandatory !== null && s.total !== null) s.supplementary = round2(s.total - s.mandatory)
    }
  }
  const complete = !rowsLayout && [sides.AN, sides.AG].every((s) => s.total !== null && s.mandatory !== null && s.supplementary !== null)
  const split = !complete
    ? 'unknown'
    : [sides.AN, sides.AG].every((s) => Math.abs(s.mandatory! + s.supplementary! - s.total!) <= 1)
      ? 'ok'
      : 'conflict'
  return { taxYear: letterYear(text ?? ''), employee: sides.AN, employer: sides.AG, checks: { split } }
}

export function parseChPremiumLetter(text: string): ChPremiumLetter {
  const lines = (text ?? '').split(/\r?\n/)
  const amountOn = (pattern: RegExp): number | null => {
    for (const line of lines) {
      if (!pattern.test(line)) continue
      const last = amountsIn(line).at(-1)
      if (last !== undefined) return last
    }
    return null
  }
  const full = /(?:zahlt|übernimmt|uebernimmt|trägt)\s+die\s+volle(?:n)?\s+pr(?:ä|a|ae)mie/i.test(text) || /keinen\s+anteil\s+an\s+den\s+mitarbeit/i.test(text)
  return { taxYear: letterYear(text ?? ''), sicknessPayChf: amountOn(SICKNESS), accidentChf: amountOn(ACCIDENT), employerPaysFull: full }
}

/**
 * What a model may see of such a letter: the lines with contribution amounts, the column and side
 * headings and the year; never the head with name, AHV number, birth date, address or policy number.
 */
export function selectChInsuranceLetterAmountLines(text: string): string {
  const lines = (text ?? '').split(/\r?\n/)
  const year = letterYear(text ?? '')
  const kept: string[] = year !== null ? [`Jahr ${year}`] : []
  for (const raw of lines) {
    const line = raw.replace(/\s{2,}/g, ' ').trim()
    if (!line) continue
    const amountRow = amountsIn(line).length > 0 && (/beitr|obligator|total|krankentaggeld|unfall|nbu/i.test(line))
    const heading = /^(?:beitr\S*\s+arbeitnehmer|arbeitnehmer|arbeitgeber|sparbeitrag)/i.test(line) && !/\d{2}\.\d{2}\.\d{4}|756/.test(line)
    if (amountRow || heading) kept.push(line)
  }
  return kept.join('\n')
}
