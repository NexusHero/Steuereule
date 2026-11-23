import { describe, expect, it } from 'vitest'
import type { AdvisorActionProposal } from '@steuereule/core'
import {
  IDLE_STREAM,
  PENDING_CONVERSATION,
  abortPlan,
  acknowledgedValuesFor,
  answeringIds,
  bestProvenance,
  extractStaleConflicts,
  parsePlanSteps,
  patchedStreams,
  provenanceAfterApply,
  streamMessageBody,
  streamsMovedFromPending,
  upgradeProvenance,
  upsertReceiptResult,
} from './CopilotBridgeHelpers'
import type { ChatReceiptResult } from './CopilotBridge.types'

describe('the streams of the conversations', () => {
  it('patches one field of one conversation, and keeps the same object when nothing changed', () => {
    const empty = {}
    const once = patchedStreams(empty, 'c1', 'streaming', true)
    expect(once).toEqual({ c1: { ...IDLE_STREAM, streaming: true } })
    expect(patchedStreams(once, 'c1', 'streaming', true)).toBe(once)
    expect(patchedStreams(once, 'c1', 'streamedText', (prev) => `${prev}Hallo`).c1!.streamedText).toBe('Hallo')
    expect(patchedStreams(empty, 'c1', 'streaming', false)).toBe(empty)
  })

  it('moves the pending answer to the conversation the server opened', () => {
    const pending = { ...IDLE_STREAM, streaming: true }
    expect(streamsMovedFromPending({ [PENDING_CONVERSATION]: pending, c2: IDLE_STREAM }, 'c1')).toEqual({ c1: pending, c2: IDLE_STREAM })
    const none = { c2: IDLE_STREAM }
    expect(streamsMovedFromPending(none, 'c1')).toBe(none)
  })

  it('lists the conversations that are answering, never the pending one', () => {
    const on = { ...IDLE_STREAM, streaming: true }
    expect(answeringIds({ a: on, b: IDLE_STREAM, [PENDING_CONVERSATION]: on })).toEqual(['a'])
  })
})

describe('the plan of an answer', () => {
  it('marks the running step of a stopped plan as aborted', () => {
    expect(abortPlan(null)).toBeNull()
    expect(
      abortPlan({ finished: false, steps: [{ text: 'a', status: 'erledigt' }, { text: 'b', status: 'laeuft' }, { text: 'c', status: 'offen' }] }),
    ).toEqual({ finished: true, steps: [{ text: 'a', status: 'erledigt' }, { text: 'b', status: 'abgebrochen' }, { text: 'c', status: 'offen' }] })
  })

  it('reads only well-formed steps of a plan frame', () => {
    expect(parsePlanSteps(null)).toBeNull()
    expect(parsePlanSteps({ steps: 'x' })).toBeNull()
    expect(parsePlanSteps({ steps: [{ text: 'a', status: 'offen' }, { text: 'b', status: 'abgebrochen' }, null, { text: 3, status: 'offen' }] })).toEqual([{ text: 'a', status: 'offen' }])
  })
})

describe('the body of a streamed message', () => {
  it('sends only what is set, the conversation last', () => {
    expect(streamMessageBody('Hallo', undefined, undefined, null)).toEqual({ message: 'Hallo' })
    const body = streamMessageBody('Hallo', 'lstb' as never, { quickAction: 'savings_plan', replaceFromMessageId: 'm1', skill: 'grill-me' as never, turbo: true, depth: 'max' }, 'c1')
    expect(Object.keys(body)).toEqual(['message', 'activeScreen', 'quickAction', 'replaceFromMessageId', 'skill', 'turbo', 'depth', 'conversationId'])
    expect(body.depth).toBe('max')
  })
})

describe('the provenance of tiles', () => {
  it('only ever upgrades', () => {
    expect(upgradeProvenance(undefined, 'nutzer')).toBe('nutzer')
    expect(upgradeProvenance('eule', 'beleg+eule')).toBe('beleg+eule')
    expect(upgradeProvenance('beleg+eule', 'eule')).toBe('beleg+eule')
  })

  it('marks applied drafts from a receipt as receipt plus owl', () => {
    const draft = (actionId: string, screen: string) => ({ actionId, screen }) as unknown as AdvisorActionProposal
    expect(provenanceAfterApply({}, [draft('a1', 'lstb'), draft('a2', 'commute')], new Set(['a1']))).toEqual({ lstb: 'beleg+eule', commute: 'eule' })
  })

  it('picks the strongest provenance of a tile', () => {
    expect(bestProvenance({ lstb: 'eule', commute: 'beleg+eule' } as never, ['lstb', 'commute'] as never)).toBe('beleg+eule')
    expect(bestProvenance({}, ['lstb'] as never)).toBeNull()
  })
})

describe('a stale-value conflict', () => {
  it('reads the conflicts of a 409 body', () => {
    expect(extractStaleConflicts(null)).toEqual([])
    expect(extractStaleConflicts({ details: { conflicts: [{ actionId: 'a1', key: 'k', currentValue: '5' }, { key: 'j', currentValue: null }, { key: 1 }] } })).toEqual([
      { actionId: 'a1', key: 'k', currentValue: '5' },
      { key: 'j', currentValue: null },
    ])
  })

  it('acknowledges the fields of one draft, and those without a draft', () => {
    const conflict = { actionIds: ['a1', 'a2'], message: 'x', conflicts: [{ actionId: 'a1', key: 'k', currentValue: '5' }, { key: 'j', currentValue: null }] }
    expect(acknowledgedValuesFor('a1', undefined)).toBeUndefined()
    expect(acknowledgedValuesFor('a1', conflict)).toEqual({ k: '5', j: null })
    expect(acknowledgedValuesFor('a2', conflict)).toEqual({ j: null })
    expect(acknowledgedValuesFor('a2', { ...conflict, conflicts: [conflict.conflicts[0]!] })).toBeUndefined()
  })
})

describe('the lines of a receipt selection', () => {
  it('replaces the line of a file read again, and adds a new one', () => {
    const line = (key: string, asking: boolean) => ({ key, fileName: key, outcome: {} as never, asking }) as ChatReceiptResult
    const first = [line('r1', true)]
    expect(upsertReceiptResult(first, line('r1', false))).toEqual([line('r1', false)])
    expect(upsertReceiptResult(first, line('r2', false))).toEqual([line('r1', true), line('r2', false)])
  })
})
