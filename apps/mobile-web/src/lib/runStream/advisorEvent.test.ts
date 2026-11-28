import { describe, expect, it } from 'vitest'
import { decodeAdvisorEvent } from './advisorEvent'

const frame = (event: string, data: unknown) => ({ id: 1, event, data })
const MESSAGE = { id: 'u1', role: 'user', content: 'Frage', meta: null, createdAt: '2026-11-14T10:00:00.000Z' }

describe('decodeAdvisorEvent', () => {
  it('reads the ids and the question of a start, each only when it is there', () => {
    expect(decodeAdvisorEvent(frame('start', { runId: 'run-1', userMessage: MESSAGE }))).toEqual({ event: 'start', data: { runId: 'run-1', userMessage: MESSAGE } })
    expect(decodeAdvisorEvent(frame('start', { runId: 7, userMessage: 'x' }))).toEqual({ event: 'start', data: {} })
    expect(decodeAdvisorEvent(frame('start', 'run-1'))).toBeNull()
  })

  it('reads the text of a status', () => {
    expect(decodeAdvisorEvent(frame('status', { text: 'Prüfe Akte …' }))).toEqual({ event: 'status', data: { text: 'Prüfe Akte …' } })
    expect(decodeAdvisorEvent(frame('status', { kein: 'text' }))).toBeNull()
  })

  it('reads the reasoning summary', () => {
    expect(decodeAdvisorEvent(frame('reasoning', { text: 'Erst prüfen.' }))).toEqual({ event: 'reasoning', data: { text: 'Erst prüfen.' } })
    expect(decodeAdvisorEvent(frame('reasoning', {}))).toBeNull()
  })

  it('reads a tool step, with an empty name when the server sent none', () => {
    expect(decodeAdvisorEvent(frame('tool', { name: 'lookup', label: 'Schlage nach …' }))).toEqual({ event: 'tool', data: { name: 'lookup', label: 'Schlage nach …' } })
    expect(decodeAdvisorEvent(frame('tool', { label: 'Ohne Namen …' }))).toEqual({ event: 'tool', data: { name: '', label: 'Ohne Namen …' } })
    expect(decodeAdvisorEvent(frame('tool', { name: 'lookup' }))).toBeNull()
  })

  it('reads what a tool found, and counts only a literal true as ok', () => {
    expect(decodeAdvisorEvent(frame('tool_result', { name: 'lookup', ok: true, result: '§ 9 EStG' }))).toEqual({ event: 'tool_result', data: { name: 'lookup', ok: true, result: '§ 9 EStG' } })
    expect(decodeAdvisorEvent(frame('tool_result', { ok: 'yes', result: 42 }))).toEqual({ event: 'tool_result', data: { name: '', ok: false, result: '42' } })
    expect(decodeAdvisorEvent(frame('tool_result', { name: 'lookup', ok: true }))).toBeNull()
  })

  it('reads a piece of the answer', () => {
    expect(decodeAdvisorEvent(frame('token', { text: 'Hallo' }))).toEqual({ event: 'token', data: { text: 'Hallo' } })
    expect(decodeAdvisorEvent(frame('token', { kein: 'text' }))).toBeNull()
  })

  it('reads only well-formed steps of a plan', () => {
    const steps = [{ text: 'a', status: 'offen' }, { text: 'b', status: 'abgebrochen' }, null, { text: 3, status: 'offen' }]
    expect(decodeAdvisorEvent(frame('plan', { steps }))).toEqual({ event: 'plan', data: { steps: [{ text: 'a', status: 'offen' }] } })
    expect(decodeAdvisorEvent(frame('plan', { steps: 'x' }))).toBeNull()
    expect(decodeAdvisorEvent(frame('plan', { nichts: true }))).toBeNull()
  })

  it('reads the mask the owl opens, with the field only when it is a string', () => {
    expect(decodeAdvisorEvent(frame('ui_command', { openMask: 'lstb', focus: 'bruttoarbeitslohn' }))).toEqual({ event: 'ui_command', data: { openMask: 'lstb', focus: 'bruttoarbeitslohn' } })
    expect(decodeAdvisorEvent(frame('ui_command', { openMask: 'rente', focus: 3 }))).toEqual({ event: 'ui_command', data: { openMask: 'rente' } })
    expect(decodeAdvisorEvent(frame('ui_command', { openMask: 'gibtEsNicht' }))).toBeNull()
    expect(decodeAdvisorEvent(frame('ui_command', { focus: 'x' }))).toBeNull()
  })

  it('hands on the payload of an error as sent', () => {
    expect(decodeAdvisorEvent(frame('error', { message: 'Nope', fields: [] }))).toEqual({ event: 'error', data: { message: 'Nope', fields: [] } })
    expect(decodeAdvisorEvent(frame('error', 'Nope'))).toBeNull()
  })

  it('reads the finished answer: its mode and the two messages', () => {
    const assistant = { ...MESSAGE, id: 'a1', role: 'assistant' }
    expect(decodeAdvisorEvent(frame('done', { mode: 'deterministic_fallback', userMessage: MESSAGE, assistantMessage: assistant }))).toEqual({
      event: 'done',
      data: { mode: 'deterministic_fallback', userMessage: MESSAGE, assistantMessage: assistant },
    })
    expect(decodeAdvisorEvent(frame('done', { mode: 3, userMessage: 'x' }))).toEqual({ event: 'done', data: {} })
    expect(decodeAdvisorEvent(frame('done', null))).toBeNull()
  })

  it('ignores events the chat does not follow here', () => {
    expect(decodeAdvisorEvent(frame('choices', { choices: ['a'] }))).toBeNull()
    expect(decodeAdvisorEvent(frame('message', { text: 'x' }))).toBeNull()
  })
})
