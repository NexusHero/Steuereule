import { registerDecorator } from 'class-validator'

/** The validator name the DTO bounds lock (test/dto-bounds.test.ts) accepts for a record field. */
export const BOUNDED_RECORD = 'boundedRecord'

export interface BoundedRecordOptions {
  readonly maxKeys: number
  readonly maxKeyLength: number
  /** For string values; numbers, booleans and null pass, nested objects do not. */
  readonly maxValueLength: number
}

/** Whether `value` is a flat record within the bounds: few short keys, short scalar values (API-14, H2-13). */
export function isBoundedRecord(value: unknown, options: BoundedRecordOptions): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > options.maxKeys) return false
  return entries.every(([key, item]) => {
    if (key.length > options.maxKeyLength) return false
    if (typeof item === 'string') return item.length <= options.maxValueLength
    return item === null || typeof item === 'number' || typeof item === 'boolean'
  })
}

/**
 * A `Record<string, …>` body field with an upper bound on keys and value length. Without it such a field took
 * any number of keys of any length up to the 1 MiB body limit.
 */
export function BoundedRecord(options: BoundedRecordOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: BOUNDED_RECORD,
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} must have at most ${options.maxKeys} keys of at most ${options.maxKeyLength} characters, each value at most ${options.maxValueLength} characters.` },
      validator: { validate: (value: unknown) => isBoundedRecord(value, options) },
    })
  }
}
