// The lock for input bounds (P8 of the beta review, API-14, H2-13): every request DTO's string field has an upper
// length (or a closed set or format that bounds it), every array an upper size, and every free-form object a
// bound on its keys. Without one a field took anything up to the 1 MiB body limit, and an overlong value failed
// only later, in a printout or an export. A new unbounded field fails this test.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMetadataStorage } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { BOUNDED_RECORD, isBoundedRecord } from '../src/common/bounded-record.validator.js'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

/** Validators that bound a string's length by themselves. */
const BOUNDING_STRING_VALIDATORS = new Set([
  'maxLength', 'length', 'isLength', 'isIn', 'isEnum', 'isUUID', 'isDateString', 'isISO8601', 'matches', 'isIBAN', 'isEmail', 'isNumberString', 'isSteuerId', 'isSteuernummer',
])

/** Free-form objects checked elsewhere, with the reason. */
const OBJECTS_BOUNDED_ELSEWHERE: Readonly<Record<string, string>> = {
  'ApplyBatchActionItemDto.acknowledgedCurrentValues': 'isAcknowledgedValueMap: at most 10 keys, values of at most 200 characters.',
  'BookingDraftDto.asset': 'parseBookingDraft in the core reads only the known asset fields; nothing else of the object is kept.',
}

function dtoFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return dtoFiles(full)
    return entry.name.endsWith('.dto.ts') ? [full] : []
  })
}

interface ValidationMeta {
  readonly propertyName: string
  readonly name?: string
  readonly type: string
}

async function fieldsOfAllDtos(): Promise<Map<string, string[]>> {
  const storage = getMetadataStorage() as unknown as { getTargetValidationMetadatas(target: object, schema: string, always: boolean, strictGroups: boolean): ValidationMeta[] }
  const fields = new Map<string, string[]>()
  for (const file of dtoFiles(SRC)) {
    const exported = (await import(file)) as Record<string, unknown>
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function') continue
      for (const meta of storage.getTargetValidationMetadatas(value, '', true, false)) {
        const key = `${value.name}.${meta.propertyName}`
        fields.set(key, [...(fields.get(key) ?? []), meta.name ?? meta.type])
      }
    }
  }
  return fields
}

describe('every request DTO field has an upper bound', () => {
  it('finds the DTO fields', async () => {
    expect((await fieldsOfAllDtos()).size).toBeGreaterThan(300)
  })

  it('every string has a maximum length, a closed set or a bounding format', async () => {
    const unbounded = [...(await fieldsOfAllDtos())].filter(([, names]) => names.includes('isString') && !names.some((n) => BOUNDING_STRING_VALIDATORS.has(n))).map(([key]) => key)
    expect(unbounded).toEqual([])
  })

  it('every array has a maximum size', async () => {
    const unbounded = [...(await fieldsOfAllDtos())].filter(([, names]) => names.includes('isArray') && !names.includes('arrayMaxSize')).map(([key]) => key)
    expect(unbounded).toEqual([])
  })

  it('every free-form object is a bounded record, a validated nested DTO or named with its check', async () => {
    const fields = await fieldsOfAllDtos()
    const unbounded = [...fields]
      .filter(([key, names]) => names.includes('isObject') && !names.includes(BOUNDED_RECORD) && !names.includes('nestedValidation') && OBJECTS_BOUNDED_ELSEWHERE[key] === undefined)
      .map(([key]) => key)
    expect(unbounded).toEqual([])
    expect(Object.keys(OBJECTS_BOUNDED_ELSEWHERE).filter((key) => !fields.has(key))).toEqual([])
  })
})

describe('isBoundedRecord', () => {
  const bounds = { maxKeys: 2, maxKeyLength: 4, maxValueLength: 3 }
  it('takes a flat record within the bounds', () => {
    expect(isBoundedRecord({ a: 'abc', b: 1 }, bounds)).toBe(true)
  })
  it('refuses too many keys, a long key, a long value, a nested value and a non-object', () => {
    expect(isBoundedRecord({ a: 1, b: 2, c: 3 }, bounds)).toBe(false)
    expect(isBoundedRecord({ abcde: 1 }, bounds)).toBe(false)
    expect(isBoundedRecord({ a: 'abcd' }, bounds)).toBe(false)
    expect(isBoundedRecord({ a: { b: 1 } }, bounds)).toBe(false)
    expect(isBoundedRecord(['a'], bounds)).toBe(false)
  })
})
