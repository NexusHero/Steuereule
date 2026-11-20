import zeilen2022 from './felder-2022.zeilen.json' with { type: 'json' }
import zeilen2023 from './felder-2023.zeilen.json' with { type: 'json' }
import zeilen2024 from './felder-2024.zeilen.json' with { type: 'json' }
import zeilen2025 from './felder-2025.zeilen.json' with { type: 'json' }
import { FORM_ORDER, type FieldValues } from './form-renderer.js'
import { splitIntoForms, type EntityIds, type FormMembership, type LiveForm } from './live-values.js'

/** One field of a year's Vordruck as scripts/vordrucke/lagebericht.mjs reads it off the template. */
export interface FormLine {
  readonly id: string
  readonly formular: string
  readonly seite: number
  /** The Zeile printed beside the box; null for a box in the page head. */
  readonly zeile: string | null
  readonly kennzahlen: readonly string[]
  /** The line's official label. */
  readonly label: string
  /** The column heading when the line holds several boxes (vom / bis, CHF / EUR), else null. */
  readonly spalte: string | null
}

interface LinesFile {
  readonly jahr: number
  readonly felder: readonly FormLine[]
}

const LINES: Readonly<Record<number, LinesFile>> = { 2022: zeilen2022, 2023: zeilen2023, 2024: zeilen2024, 2025: zeilen2025 }

/** The last year whose income-tax forms are published; a later year has no lines yet (no est26 in the FMS). */
export const LATEST_LINES_YEAR = 2025

/** The income-tax forms the fill-in help covers: what the paper printout fills (ADR-0050), in its order. */
export const INCOME_TAX_FORMS: readonly string[] = FORM_ORDER

const BY_ID: ReadonlyMap<number, ReadonlyMap<string, FormLine>> = new Map(
  Object.entries(LINES).map(([year, file]) => [Number(year), new Map(file.felder.map((line) => [line.id, line]))]),
)
const NONE: ReadonlyMap<string, FormLine> = new Map()

const linesOf = (year: number): ReadonlyMap<string, FormLine> => BY_ID.get(year) ?? NONE

/** Whether the year's income-tax forms are published (and so measured). */
export function linesPublished(year: number): boolean {
  return LINES[year] !== undefined
}

/** The field's line in `year`, or null where that year's form has no such field or is not published. */
export function lineOf(year: number, id: string): FormLine | null {
  return linesOf(year).get(id) ?? null
}

/** The field ids of a form in `year`, in the order of that year's lines file. */
export function lineIdsOf(year: number, formular: string): readonly string[] {
  return [...linesOf(year).values()].filter((line) => line.formular === formular).map((line) => line.id)
}

/** The field as the latest published form names it: the label for a year without (or a field without) its own line. */
export function latestLineOf(id: string): FormLine | null {
  return linesOf(LATEST_LINES_YEAR).get(id) ?? null
}

/**
 * Splits printout values into the copies the paper printout would print. Form membership comes from the
 * year's lines, and from the latest year for a field the year's form lacks (NOT_ON_FORM): the help still
 * shows such a value, without a Zeile, instead of dropping it.
 */
export function fillInForms(
  year: number,
  values: FieldValues,
  instances: Readonly<Record<string, readonly FieldValues[]>> | undefined,
  entityIds: EntityIds,
): LiveForm[] {
  const formOf = new Map<string, string>()
  for (const line of linesOf(LATEST_LINES_YEAR).values()) formOf.set(line.id, line.formular)
  for (const line of linesOf(year).values()) formOf.set(line.id, line.formular)
  const membership: FormMembership = { formOf, order: INCOME_TAX_FORMS }
  return splitIntoForms(membership, values, instances, entityIds)
}
