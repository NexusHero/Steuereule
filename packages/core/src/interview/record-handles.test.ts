import { describe, expect, it } from 'vitest'
import { buildRecordHandles, describeRecordHandles, resolveRecordHandle } from './record-handles'

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
