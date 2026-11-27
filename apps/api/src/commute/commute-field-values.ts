import { fitsPrintBox, GERMAN_DATE_PATTERN, WORKPLACE_WIDTH_PT, type IsoWeekday } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { MEANS_OF_TRANSPORT, WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS, type CommuteInputs, type MeansOfTransport } from './commute.repository.js'

/** Turns the text the confirmation path hands over into the value the commute record stores for one field, or refuses it. */
type FieldParser = (value: string | null, field: string) => unknown

const INTEGER_RE = /^-?\d+$/
const MAX_WORKPLACE_LENGTH = 120
const MAX_NOTE_LENGTH = 100
const MAX_REGION_LENGTH = 8

function parseBoundedInt(raw: string | null, min: number, max: number, label: string): number | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  const n = Number(trimmed)
  if (!INTEGER_RE.test(trimmed) || !Number.isInteger(n) || n < min || n > max) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${label}" must be an integer between ${min} and ${max}.`)
  }
  return n
}

const integerBetween = (min: number, max: number): FieldParser => (value, field) => parseBoundedInt(value, min, max, field)

/** Days of the year that count as none when taken back. */
const dayCount: FieldParser = (value, field) => parseBoundedInt(value, 0, 366, field) ?? 0

/** ISO weekdays as "1,2,3": each once, in the order given. */
function parseWorkdays(value: string | null): IsoWeekday[] {
  if (value === null) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', '"workdays" cannot be null.')
  }
  const parts = [...new Set(value.split(',').map((part) => part.trim()).filter((part) => part !== ''))]
  const weekdays = parts.map((part) => parseBoundedInt(part, 1, 7, 'workdays') as IsoWeekday)
  if (weekdays.length === 0) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', '"workdays" must contain at least one ISO weekday (1-7).')
  }
  return weekdays
}

const parseTransport: FieldParser = (value, field) => {
  if (value !== null && !MEANS_OF_TRANSPORT.includes(value as MeansOfTransport)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" must be one of: ${MEANS_OF_TRANSPORT.join(', ')}.`)
  }
  return value as MeansOfTransport | null
}

const parseBoolean: FieldParser = (value) => {
  if (value !== null && value !== 'true' && value !== 'false') throw new InvalidInputError('FIELD_VALUE_INVALID', `"${value}" is not "true" or "false".`)
  return value === null ? null : value === 'true'
}

/** Trimmed text, with nothing left counting as no value; longer than `maxLength` is refused. */
const textUpTo = (maxLength: number): FieldParser => (value, field) => {
  const trimmed = value === null ? null : value.trim()
  if (trimmed !== null && trimmed.length > maxLength) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" must be at most ${maxLength} characters.`)
  }
  return trimmed === '' ? null : trimmed
}

/**
 * The Arbeitsort takes only what its box on Anlage N / N-Gre prints: a full address would be stored and
 * then block the printout after payment (real-data run). Refused here, with a message the user can act on.
 */
export function assertWorkplaceFitsFormLine(workplace: string | null | undefined): void {
  if (workplace == null || (workplace.trim().length <= MAX_WORKPLACE_LENGTH && fitsPrintBox(workplace.trim(), WORKPLACE_WIDTH_PT))) return
  throw new InvalidInputError('ARBEITSORT_ZU_LANG', 'Der Arbeitsort ist zu lang für die Zeile im Formular. Bitte nur Ort oder Firma und Ort eintragen, z. B. „Lörrach“ statt der ganzen Anschrift.')
}

const parseWorkplace: FieldParser = (value) => {
  const trimmed = value === null ? '' : value.trim()
  assertWorkplaceFitsFormLine(trimmed)
  return trimmed === '' ? null : trimmed
}

const parseGermanDate: FieldParser = (value, field) => {
  const trimmed = value === null ? null : value.trim()
  if (trimmed !== null && trimmed !== '' && !GERMAN_DATE_PATTERN.test(trimmed)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `"${field}" must be a date DD.MM.YYYY.`)
  }
  return trimmed === '' ? null : trimmed
}

const each = (fields: readonly string[], parser: FieldParser): [string, FieldParser][] => fields.map((field) => [field, parser])

/** A Map, not an object: a field name such as "constructor" must find no parser. */
const FIELD_PARSERS: ReadonlyMap<string, FieldParser> = new Map<string, FieldParser>([
  ['workdays', parseWorkdays],
  ...each(['vacationDays', 'sickDays', 'homeOfficeDays'], dayCount),
  ...each(['oneWayKm', 'secondOneWayKm'], integerBetween(0, 999)),
  ...each(['transport', 'secondTransport'], parseTransport),
  ['publicHolidays', integerBetween(0, 30)],
  ['publicHolidayRegion', textUpTo(MAX_REGION_LENGTH)],
  ...each(['travelDays', 'secondTravelDays'], integerBetween(0, 366)),
  ...each(['shortestRouteConfirmed', 'secondShortestRouteConfirmed'], parseBoolean),
  ...each(['workplace', 'secondWorkplace'], parseWorkplace),
  ...each(['periodFrom', 'periodTo', 'secondFrom', 'secondTo'], parseGermanDate),
  ...each(WORK_EXPENSE_AMOUNT_FIELDS, integerBetween(0, 1_000_000)),
  ...each(WORK_EXPENSE_NOTE_FIELDS, textUpTo(MAX_NOTE_LENGTH)),
])

/** The inputs with one field replaced by the parsed value; `null` when the commute screen has no such field. */
export function commuteInputsWith(current: CommuteInputs, field: string, value: string | null): CommuteInputs | null {
  const parse = FIELD_PARSERS.get(field)
  if (parse === undefined) return null
  return { ...current, [field]: parse(value, field) }
}
