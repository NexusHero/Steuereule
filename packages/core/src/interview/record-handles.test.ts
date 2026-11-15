import { describe, expect, it } from 'vitest'
import { buildRecordHandles, describeRecordHandles, isNewRecordId, resolveRecordHandle } from './record-handles'

const two = buildRecordHandles('vermietung', ['id-a', 'id-b'])

describe('record handles', () => {
  it('names records in their stored order, without anything from the record itself', () => {
    expect(two).toEqual([{ handle: 'Objekt 1', id: 'id-a' }, { handle: 'Objekt 2', id: 'id-b' }])
    expect(buildRecordHandles('kind', ['k'])[0]!.handle).toBe('Kind 1')
  })

  it('needs no name when there is one record', () => {
    expect(resolveRecordHandle('kind', buildRecordHandles('kind', ['k']), null)).toEqual({ ok: true, id: 'k', handle: 'Kind 1' })
  })

  it.each(['Objekt 2', 'objekt 2', '2', 'Objekt2', 'das Objekt 2'])('understands „%s“', (raw) => {
    expect(resolveRecordHandle('vermietung', two, raw)).toMatchObject({ ok: true, id: 'id-b', handle: 'Objekt 2' })
  })

  it('asks which one when there are several and none was named', () => {
    const result = resolveRecordHandle('vermietung', two, '')
    expect(result).toMatchObject({ ok: false, code: 'RECORD_REQUIRED' })
    expect(!result.ok && result.reason).toContain('Objekt 1, Objekt 2')
  })

  it('refuses a record that does not exist, naming the ones that do', () => {
    expect(resolveRecordHandle('vermietung', two, 'Objekt 3')).toMatchObject({ ok: false, code: 'UNKNOWN_RECORD' })
    expect(resolveRecordHandle('vermietung', two, 'Ferienwohnung')).toMatchObject({ ok: false, code: 'UNKNOWN_RECORD' })
  })

  it('sends the user to the mask when nothing is created yet', () => {
    const result = resolveRecordHandle('vermietung', [], 'Objekt 1')
    expect(result).toMatchObject({ ok: false, code: 'NO_RECORD' })
    expect(!result.ok && result.reason).toContain('Maske Vermietung')
  })

  it('tells the model names only', () => {
    const text = describeRecordHandles({ vermietung: two })
    expect(text).toContain('Objekt 1, Objekt 2')
    expect(text).toContain('Kinder (Maske kind): keine angelegt')
    expect(text).not.toContain('id-a')
  })
})

describe('a new record the owl prepares (ADR-0091)', () => {
  const objects = buildRecordHandles('vermietung', ['o1'])

  it('names a new record „neu“, numbered when there are several in one answer', () => {
    expect(resolveRecordHandle('kind', [], 'neu', { allowNew: true })).toEqual({ ok: true, id: 'neu:1', handle: 'neues Kind 1' })
    expect(resolveRecordHandle('vermietung', objects, 'neues Objekt 2', { allowNew: true })).toEqual({ ok: true, id: 'neu:2', handle: 'neues Objekt 2' })
    expect(resolveRecordHandle('kind', [], 'Neu 3', { allowNew: true })).toEqual({ ok: true, id: 'neu:3', handle: 'neues Kind 3' })
    expect(isNewRecordId('neu:3')).toBe(true)
    expect(isNewRecordId('o1')).toBe(false)
  })

  it('does not create where it is not allowed, and tells the model how when it is', () => {
    expect(resolveRecordHandle('kind', buildRecordHandles('kind', ['k1']), 'neu')).toMatchObject({ ok: false, code: 'UNKNOWN_RECORD' })
    expect(resolveRecordHandle('kind', [], null)).toMatchObject({ ok: false, code: 'NO_RECORD' })
    const allowed = resolveRecordHandle('vermietung', [], null, { allowNew: true })
    expect(allowed).toMatchObject({ ok: false, code: 'NO_RECORD' })
    expect(allowed.ok ? '' : allowed.reason).toContain('„neu“')
  })

  it('still finds existing records by name when new ones are allowed', () => {
    expect(resolveRecordHandle('vermietung', objects, 'Objekt 1', { allowNew: true })).toEqual({ ok: true, id: 'o1', handle: 'Objekt 1' })
  })
})
