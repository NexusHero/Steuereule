import { SCREENS } from '@steuereule/core'
import { z } from 'zod'

/** The argument schemas the tools share; every argument is bounded, the gate refuses a tool with one that is not (MCP-23). */

export const MIN_TAX_YEAR = 2000
/** As `ParseTaxYearPipe`: up to next year, so a return can be started before the year ends. */
export const maxTaxYear = (now: Date = new Date()): number => now.getFullYear() + 1

/** A tax year: the same range the REST routes accept (MCP-2). No year 0 and no year 9999. */
export function taxYearArg(now: Date = new Date()) {
  const max = maxTaxYear(now)
  return z.number().int().min(MIN_TAX_YEAR).max(max).describe(`Das Steuerjahr, ${MIN_TAX_YEAR} bis ${max}; welche Jahre der Nutzer hat, nennt steuerjahre_auflisten`)
}

export const MAX_ID_LENGTH = 64
export const MAX_FIELD_LENGTH = 100
/** The longest value a field of the catalogue holds (free text such as remarks) with room to spare. */
export const MAX_VALUE_LENGTH = 2000

export const screenArg = (description = 'Die Erfassungsmaske; ihre Felder nennt maske_felder') => z.enum(SCREENS).describe(description)
export const instanceArg = (description: string) => z.string().trim().min(1).max(MAX_ID_LENGTH).describe(description)
export const fieldArg = (description = 'Der Feldbezeichner, wie maske_felder ihn nennt') => z.string().max(MAX_FIELD_LENGTH).describe(description)
export const valueArg = (description: string) => z.string().max(MAX_VALUE_LENGTH).describe(description)
export const receiptIdArg = () => z.string().trim().min(1).max(MAX_ID_LENGTH).describe('Die belegId eines eigenen Belegs aus belege_auflisten oder beleg_hochladen, als Herkunftsnachweis')
export const monthArg = (description: string) => z.string().length(7).regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe(description)
export const PERSON_HINT = 'Bei Zusammenveranlagung: A der Nutzer, B Ehegatte oder Ehegattin. Pflicht in den Masken lstb, chLohnausweis, commute, rente, profil, stammdaten, sobald es Person B gibt.'
export const personArg = (description: string = PERSON_HINT) => z.enum(['A', 'B']).describe(description)

/** A map of field → value with at most `max` entries; the bound is published as JSON Schema `maxProperties`. */
export function boundedRecord<V extends z.ZodType>(key: z.ZodString, value: V, max: number) {
  return z
    .record(key, value)
    .refine((entries) => Object.keys(entries).length >= 1 && Object.keys(entries).length <= max, { message: `1 bis ${max} Einträge` })
    .meta({ minProperties: 1, maxProperties: max })
}

/**
 * The arguments of a tool that accept unbounded input: a string without a maximum length, a number without
 * both limits, an array or a map without a maximum size. Empty for a well-formed tool (the lock of P4).
 */
export function unboundedArguments(shape: Readonly<Record<string, z.ZodType>>): string[] {
  const out: string[] = []
  for (const [name, schema] of Object.entries(shape)) collectUnbounded(schema, name, out)
  return out
}

interface IntrospectedDef {
  readonly type: string
  readonly checks?: readonly { _zod: { def: { check: string } } }[]
  readonly innerType?: z.ZodType
  readonly element?: z.ZodType
  readonly shape?: Readonly<Record<string, z.ZodType>>
  readonly keyType?: z.ZodType
  readonly valueType?: z.ZodType
  readonly options?: readonly z.ZodType[]
  readonly in?: z.ZodType
}

function collectUnbounded(schema: z.ZodType, path: string, out: string[]): void {
  const def = (schema as unknown as { _zod: { def: IntrospectedDef } })._zod.def
  const has = (check: string) => (def.checks ?? []).some((c) => c._zod.def.check === check)
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'nonoptional':
    case 'catch':
      return collectUnbounded(def.innerType!, path, out)
    case 'pipe':
      return collectUnbounded(def.in!, path, out)
    case 'boolean':
    case 'enum':
    case 'literal':
    case 'null':
      return
    case 'string':
      if (!has('max_length') && !has('length_equals')) out.push(path)
      return
    case 'number':
      if (!has('greater_than') || !has('less_than')) out.push(path)
      return
    case 'array':
      if (!has('max_length')) out.push(path)
      return collectUnbounded(def.element!, `${path}[]`, out)
    case 'object':
      for (const [key, value] of Object.entries(def.shape ?? {})) collectUnbounded(value, `${path}.${key}`, out)
      return
    case 'record': {
      const meta = (schema as unknown as { meta(): Record<string, unknown> | undefined }).meta()
      if (typeof meta?.maxProperties !== 'number') out.push(path)
      collectUnbounded(def.keyType!, `${path}{key}`, out)
      return collectUnbounded(def.valueType!, `${path}{value}`, out)
    }
    case 'union':
      for (const option of def.options ?? []) collectUnbounded(option, path, out)
      return
    default:
      out.push(`${path} (${def.type})`)
  }
}
