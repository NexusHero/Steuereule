import { describe, expect, it } from 'vitest'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import {
  appendTranscript,
  isOpeningPlaceholder,
  isStoredInterrupted,
  lastIndexOfRole,
  pastedReceiptInput,
  quickChipOf,
  sendOptionsToDto,
  shownQuickChips,
  showsPendingUser,
  slashCommandList,
  turboAppliedCount,
  visibleMessages,
  withSwitches,
  withoutQueuedFile,
} from './AdvisorChatHelpers'

const message = (id: string, role: 'user' | 'assistant', extra: Partial<AdvisorChatMessageView> = {}): AdvisorChatMessageView => ({
  id,
  role,
  content: id,
  meta: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})
const opening = message('o', 'user', { meta: { opening: { stage: 'empty' } } as unknown as AdvisorChatMessageView['meta'] })

describe('the options of a chat message', () => {
  it('sends only the fields that are set', () => {
    expect(sendOptionsToDto(undefined)).toEqual({})
    expect(sendOptionsToDto({ skill: 'grill-me' as never, turbo: true, depth: 'max', quickAction: 'savings_plan', replaceFromMessageId: 'm1' })).toEqual({
      skill: 'grill-me',
      turbo: true,
      depth: 'max',
      quickAction: 'savings_plan',
      replaceFromMessageId: 'm1',
    })
    expect(sendOptionsToDto({ turbo: false })).toEqual({})
  })

  it('adds the switches of the input, and leaves a plain message plain', () => {
    expect(withSwitches(undefined, null, false, false)).toBeUndefined()
    const options = { quickAction: 'savings_plan' as const }
    expect(withSwitches(options, null, false, false)).toBe(options)
    expect(withSwitches(options, 'grill-me' as never, true, true)).toEqual({ quickAction: 'savings_plan', skill: 'grill-me', turbo: true, depth: 'max' })
  })
})

describe('what the conversation shows', () => {
  it('hides the opening question and the answer still being written', () => {
    const streaming = message('s', 'assistant', { status: 'streaming' })
    const done = message('d', 'assistant')
    expect(isOpeningPlaceholder(opening)).toBe(true)
    expect(isOpeningPlaceholder(done)).toBe(false)
    expect(visibleMessages([opening, streaming, done])).toEqual([done])
  })

  it('shows the running question until the stored list has it', () => {
    const pending = message('p', 'user')
    expect(showsPendingUser(true, pending, [])).toBe(true)
    expect(showsPendingUser(false, pending, [])).toBe(false)
    expect(showsPendingUser(true, null, [])).toBe(false)
    expect(showsPendingUser(true, opening, [])).toBe(false)
    expect(showsPendingUser(true, pending, [pending])).toBe(false)
  })

  it('knows a stored answer that was stopped or failed', () => {
    expect(isStoredInterrupted(message('a', 'assistant', { status: 'aborted' }))).toBe(true)
    expect(isStoredInterrupted(message('f', 'assistant', { status: 'failed' }))).toBe(true)
    expect(isStoredInterrupted(message('u', 'user', { status: 'aborted' }))).toBe(false)
    expect(isStoredInterrupted(undefined)).toBe(false)
  })

  it('finds the last message of a role', () => {
    const list = [message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user')]
    expect(lastIndexOfRole(list, 'user')).toBe(2)
    expect(lastIndexOfRole(list, 'assistant')).toBe(1)
    expect(lastIndexOfRole([], 'user')).toBe(-1)
  })

  it('counts the drafts a Turbo answer applied or undid', () => {
    const draft = (status: string) => ({ actionId: status, status }) as unknown as AdvisorActionProposal
    expect(turboAppliedCount(draft('applied'), [draft('undone'), draft('pending')])).toBe(2)
    expect(turboAppliedCount(undefined, undefined)).toBe(0)
  })
})

describe('the quick starts', () => {
  it('reads a plain label as a chip without test id or quick action', () => {
    expect(quickChipOf('Spenden')).toEqual({ label: 'Spenden', testID: undefined, quickAction: undefined })
    expect(quickChipOf({ label: 'Sparplan', testID: 'chip', quickAction: 'savings_plan' })).toEqual({ label: 'Sparplan', testID: 'chip', quickAction: 'savings_plan' })
  })

  it('shows four on the page until expanded, all in the panel', () => {
    const chips = ['a', 'b', 'c', 'd', 'e']
    expect(shownQuickChips(chips, 'page', false)).toEqual(['a', 'b', 'c', 'd'])
    expect(shownQuickChips(chips, 'page', true)).toEqual(chips)
    expect(shownQuickChips(chips, 'panel', false)).toEqual(chips)
  })
})

describe('the input', () => {
  it('appends dictated text with one space', () => {
    expect(appendTranscript('', 'Hallo')).toBe('Hallo')
    expect(appendTranscript('   ', 'Hallo')).toBe('Hallo')
    expect(appendTranscript('Ich habe  ', 'Hallo')).toBe('Ich habe Hallo')
  })

  it('names the known slash commands', () => {
    expect(slashCommandList({ 'grill-me': 1, plan: 2 })).toBe('/grill-me, /plan')
  })
})

describe('the receipt attach panel', () => {
  it('needs text, and names the file beleg.pdf when no name is given', () => {
    expect(pastedReceiptInput('x.pdf', '   ')).toBeNull()
    expect(pastedReceiptInput('  ', ' Monitor 349 EUR ')).toEqual({ fileName: 'beleg.pdf', rawText: 'Monitor 349 EUR' })
    expect(pastedReceiptInput(' r.pdf ', 'a')).toEqual({ fileName: 'r.pdf', rawText: 'a' })
  })

  it('removes a waiting file but never the one being read', () => {
    expect(withoutQueuedFile(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
    expect(withoutQueuedFile(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })
})
