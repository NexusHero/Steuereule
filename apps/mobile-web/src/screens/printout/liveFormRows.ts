// Rows of the structured preview that are read off what the printout fills (`ausdruck/werte`): the same
// values as the official form, with the Zeile the API names for the year. Nothing is calculated a second
// time here, except the Entfernungspauschale of one printed way (the form carries only its days and
// kilometres; the core function is the one the commute mask uses).
import { commuterAllowance, formatEuro } from '@steuereule/core'
import type { Screen } from '@steuereule/core'
import type { LiveFormDto, LiveFormInstanceDto } from '@steuereule/api-client'
import { maskTargetForAcroField } from '../shared/formLineMapping'
import type { GlassFormRow } from './GlassFormPreview'

type Person = 'A' | 'B'
type Translate = (key: string, options?: Record<string, unknown>) => string
type WorkForm = 'anlN' | 'anlNGre'

export interface LiveRowContext {
  readonly year: number
  readonly person: Person
  readonly tr: Translate
  /** The provenance badge of the mask field a row leads to. */
  readonly prov: (screen: Screen, field?: string) => string
}

const KEY = 'ausdruck.glasErklaerung.zeilen'

/** The copy of a Vordruck that belongs to a person; a form printed once for the household has `person` null. */
export function copyOf(forms: readonly LiveFormDto[], formular: string, person: Person | null): LiveFormInstanceDto | null {
  return forms.find((form) => form.formular === formular)?.instances.find((instance) => instance.person === person) ?? null
}

function text(copy: LiveFormInstanceDto, id: string): string | null {
  const value = copy.values[id]
  return typeof value === 'string' && value !== '' ? value : null
}

function amount(copy: LiveFormInstanceDto, id: string): number | null {
  const raw = text(copy, id)
  if (raw === null) return null
  const number = Number(raw.replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

/** „Zeile 34“, „Zeilen 34–36“, or the form's name while the API names no Zeile for the field. */
function linePill(copy: LiveFormInstanceDto, ids: readonly string[], formName: string, tr: Translate): string {
  const lines = ids.map((id) => copy.lines?.[id]).filter((line): line is string => Boolean(line))
  const first = lines[0]
  const last = lines[lines.length - 1]
  if (first === undefined || last === undefined) return formName
  return first === last ? tr(`${KEY}.zeile`, { zeile: first }) : tr(`${KEY}.zeilenVonBis`, { von: first, bis: last })
}

interface MaskTarget {
  readonly screen: Screen
  readonly field: string
}

function row(ctx: LiveRowContext, id: string, target: MaskTarget, line: string, label: string, value: string): GlassFormRow {
  return { id, line, label, value, person: ctx.person, provenanceLabel: ctx.prov(target.screen, target.field), screen: target.screen, field: target.field }
}

/** The mask the official form view opens for this field, so both views lead to the same place. */
function maskOf(fieldId: string): MaskTarget {
  const target = maskTargetForAcroField(fieldId)
  return { screen: target.screen, field: target.field ?? '' }
}

const suffix = (person: Person): string => person.toLowerCase()

/** The wage lines (Z. 6–25) and the provision lines (Z. 78–88) of the Anlage N-Gre; an empty or zero line is no row. */
const N_GRE_WAGE_ROWS = ['z6', 'z8', 'z9', 'z10', 'z18', 'z19', 'z20', 'z23', 'z25'] as const
const N_GRE_PROVISION_ROWS = ['z78', 'z79', 'z80', 'z81', 'z82', 'z83', 'z84', 'z85', 'z87', 'z88'] as const
const N_GRE_FORM = 'Anlage N-Gre'

function nGreAmountRows(copy: LiveFormInstanceDto, ctx: LiveRowContext, rows: readonly string[]): GlassFormRow[] {
  return rows.flatMap((name) => {
    const chfId = `anlNGre.${name}Chf`
    const chf = amount(copy, chfId)
    const eur = amount(copy, `anlNGre.${name}Eur`)
    if (chf === null || chf === 0) return []
    const value = ctx.tr(`${KEY}.chfUndEur`, { chf: chf.toLocaleString('de-DE'), eur: formatEuro(eur ?? 0) })
    return [row(ctx, `ngre-${name}-${suffix(ctx.person)}`, maskOf(chfId), linePill(copy, [chfId], N_GRE_FORM, ctx.tr), ctx.tr(`${KEY}.nGre.${name}`), value)]
  })
}

const WAY_SLOTS = [
  { number: 1, place: 'wegOrt', days: 'kz110Tage', km: 'kz111', car: 'kz112' },
  { number: 2, place: 'weg2Ort', days: 'kz130Tage', km: 'kz131', car: 'kz132' },
] as const

/** The ways to work printed on this copy, each with its own distance and days; a way of 0 km produced nothing. */
function wayRows(copy: LiveFormInstanceDto, form: WorkForm, idPrefix: string, formName: string, ctx: LiveRowContext): GlassFormRow[] {
  return WAY_SLOTS.flatMap((slot) => {
    const days = amount(copy, `${form}.${slot.days}`)
    const km = amount(copy, `${form}.${slot.km}`)
    if (days === null || km === null || km === 0) return []
    const place = text(copy, `${form}.${slot.place}`)
    const label = place ? ctx.tr(`${KEY}.weg`, { ort: place, km, tage: days }) : ctx.tr(`${KEY}.wegOhneOrt`, { km, tage: days })
    const ids = [`${form}.${slot.days}`, `${form}.${slot.km}`, `${form}.${slot.car}`]
    return [row(ctx, `${idPrefix}-weg${slot.number}-${suffix(ctx.person)}`, { screen: 'commute', field: 'oneWayKm' }, linePill(copy, ids, formName, ctx.tr), label, allowanceOf(ctx.year, km, days, text(copy, `${form}.${slot.car}`) !== null))]
  })
}

function allowanceOf(year: number, oneWayKm: number, days: number, withCar: boolean): string {
  try {
    return formatEuro(commuterAllowance({ oneWayKm, days, year, withCar }))
  } catch {
    // A year without rates: the facts of the way are in the label, no amount is made up.
    return '–'
  }
}

/** Where each form asks for the further Werbungskosten: the same Kennzahlen in other lines (as printout-values.ts). */
const WORK_EXPENSE_FIELDS: Readonly<Record<WorkForm, { readonly bodiesText: string; readonly tools: string; readonly other: readonly [string, string] }>> = {
  anlN: { bodiesText: 'z53Text', tools: 'z54', other: ['z62', 'z63'] },
  anlNGre: { bodiesText: 'z48Text', tools: 'z49', other: ['z57', 'z58'] },
}

/** Professional bodies, work tools, training and the „Sonstiges“ lines (account fees among them) of this copy. */
function workExpenseRows(copy: LiveFormInstanceDto, form: WorkForm, idPrefix: string, formName: string, ctx: LiveRowContext): GlassFormRow[] {
  const fields = WORK_EXPENSE_FIELDS[form]
  const rows: GlassFormRow[] = []
  const person = suffix(ctx.person)
  const euro = (id: string): string | null => {
    const value = amount(copy, id)
    return value === null || value === 0 ? null : formatEuro(value)
  }
  const add = (id: string, fieldId: string, label: string, target: MaskTarget) => {
    const value = euro(fieldId)
    if (value !== null) rows.push(row(ctx, id, target, linePill(copy, [fieldId], formName, ctx.tr), label, value))
  }
  add(`${idPrefix}-berufsverbaende-${person}`, `${form}.kz310`, text(copy, `${form}.${fields.bodiesText}`) ?? ctx.tr(`${KEY}.berufsverbaende`), { screen: 'commute', field: 'professionalBodiesEur' })
  add(`${idPrefix}-arbeitsmittel-${person}`, `${form}.${fields.tools}Eur`, text(copy, `${form}.${fields.tools}Text`) ?? ctx.tr(`${KEY}.arbeitsmittel`), { screen: 'commute', field: 'workEquipmentEur' })
  add(`${idPrefix}-fortbildung-${person}`, `${form}.kz330`, ctx.tr(`${KEY}.fortbildung`), { screen: 'interview', field: 'fortbildung-kosten' })
  fields.other.forEach((line, index) => {
    const label = text(copy, `${form}.${line}Text`) ?? ctx.tr(`${KEY}.sonstiges`)
    // The account fees are their own field of the commute mask; any other line is its „Sonstiges“ amount.
    const field = label === 'Kontoführungsgebühren' ? 'accountFeesEur' : 'otherWorkExpensesEur'
    add(`${idPrefix}-sonstiges${index + 1}-${person}`, `${form}.${line}Eur`, label, { screen: 'commute', field })
  })
  return rows
}

/** One person's Anlage N-Gre as printed: wage lines, the way(s) to work, further Werbungskosten, provision lines. */
export function nGreRows(copy: LiveFormInstanceDto, ctx: LiveRowContext): GlassFormRow[] {
  return [
    ...nGreAmountRows(copy, ctx, N_GRE_WAGE_ROWS),
    ...wayRows(copy, 'anlNGre', 'ngre', N_GRE_FORM, ctx),
    ...workExpenseRows(copy, 'anlNGre', 'ngre', N_GRE_FORM, ctx),
    ...nGreAmountRows(copy, ctx, N_GRE_PROVISION_ROWS),
  ]
}

/** The way(s) to work and the further Werbungskosten printed on one person's Anlage N. */
export function anlageNWorkRows(copy: LiveFormInstanceDto, ctx: LiveRowContext): GlassFormRow[] {
  return [...wayRows(copy, 'anlN', 'anlageN', 'Anlage N', ctx), ...workExpenseRows(copy, 'anlN', 'anlageN', 'Anlage N', ctx)]
}

/** Anlage Vorsorgeaufwand Z. 16–33: Person A's Kennzahlen start with 3, Person B's with 4. */
const PROVISION_CODES = ['26', '28', '29', '38', '50', '51', '54', '33', '34', '35', '39'] as const

/** The self-paid health and care insurance of both persons, as the one Anlage Vorsorgeaufwand of the household prints it. */
export function provisionRows(copy: LiveFormInstanceDto, joint: boolean, ctx: Omit<LiveRowContext, 'person'>): GlassFormRow[] {
  const persons: readonly Person[] = joint ? ['A', 'B'] : ['A']
  return persons.flatMap((person) =>
    PROVISION_CODES.flatMap((code) => {
      const fieldId = `anlVor.kz${person === 'A' ? '3' : '4'}${code}`
      const value = amount(copy, fieldId)
      if (value === null || value === 0) return []
      // A foreign insurer (Kz 333–339) is the Swiss Krankenkasse of the Grenzgänger mask; the others were named in the interview.
      const target: MaskTarget = code.startsWith('3') ? { screen: 'chLohnausweis', field: 'krankenkasseChf' } : { screen: 'interview', field: 'kv-pv-betrag' }
      return [
        {
          id: `vorsorge-kz${person === 'A' ? '3' : '4'}${code}`,
          line: linePill(copy, [fieldId], 'Anlage Vorsorgeaufwand', ctx.tr),
          label: ctx.tr(`${KEY}.vorsorge.kz3${code}`),
          value: formatEuro(value),
          person,
          provenanceLabel: ctx.prov(target.screen, target.field),
          screen: target.screen,
          field: target.field,
        },
      ]
    }),
  )
}
