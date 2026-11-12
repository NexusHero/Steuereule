// #481: the tax return of a year is the project; it holds several conversations. They share the
// return (and with it every draft), not each other's messages.
import type { AdvisorStreamEvent } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { MAX_CONVERSATIONS_PER_YEAR, titleFrom } from '../src/advisor/advisor.service.js'
import { InMemoryAdvisorRunLog } from '../src/advisor/run/advisor-run-log.js'
import { AdvisorRunService } from '../src/advisor/run/advisor-run.service.js'
import { buildAdvisorTestKit, collect, doneEvent, ScriptedAdvisorEngine, type ScriptStep } from './fakes/advisor-test-kit.js'

const USER = 'user-conversations'
const YEAR = 2025
const token = (text: string): AdvisorStreamEvent => ({ event: 'token', data: { text } })
const answer = (text: string): ScriptStep[] => [token(text), doneEvent({ replyText: text })]

function build(script: readonly ScriptStep[] = answer('Antwort.')) {
  const engine = new ScriptedAdvisorEngine(script)
  const kit = buildAdvisorTestKit(engine)
  const runs = new AdvisorRunService(kit.service, new InMemoryAdvisorRunLog(), kit.advisorRepo)
  return { ...kit, engine, runs }
}

describe('conversations of a tax year (#481)', () => {
  it('has a conversation as soon as the year is opened, without anyone creating it', async () => {
    const { service } = build()
    const session = await service.getSession(USER, YEAR)
    expect(session.conversations).toHaveLength(1)
    expect(session.conversationId).toBe(session.conversations[0]!.id)
    expect(session.messages).toEqual([])
    // Opening it again does not make a second one.
    expect((await service.getSession(USER, YEAR)).conversations).toHaveLength(1)
  })

  it('names a conversation after its first question', async () => {
    const { service } = build()
    await collect(service.streamMessage(USER, YEAR, { message: 'Lohnt sich mein Arbeitsweg von 38 km?' }))
    await collect(service.streamMessage(USER, YEAR, { message: 'Und das Homeoffice?' }))
    const [conversation] = await service.listConversations(USER, YEAR)
    expect(conversation!.title).toBe('Lohnt sich mein Arbeitsweg von 38 km?')
  })

  it('keeps the messages of two conversations apart', async () => {
    const { service } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    await collect(service.streamMessage(USER, YEAR, { message: 'Frage zum Arbeitsweg', conversationId: first }))
    const second = await service.createConversation(USER, YEAR)
    await collect(service.streamMessage(USER, YEAR, { message: 'Frage zur Vermietung', conversationId: second.id }))

    const a = await service.getSession(USER, YEAR, first)
    const b = await service.getSession(USER, YEAR, second.id)
    expect(a.messages.map((m) => m.content)).toEqual(['Frage zum Arbeitsweg', 'Antwort.'])
    expect(b.messages.map((m) => m.content)).toEqual(['Frage zur Vermietung', 'Antwort.'])
  })

  it('shows the model the conversation it is in, not the other one', async () => {
    const { service, engine } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    await collect(service.streamMessage(USER, YEAR, { message: 'Mein Arbeitsweg sind 38 km', conversationId: first }))
    const second = await service.createConversation(USER, YEAR)
    await collect(service.streamMessage(USER, YEAR, { message: 'Was weißt du über meinen Arbeitsweg?', conversationId: second.id }))
    expect(engine.requests[1]!.history ?? []).toEqual([])

    await collect(service.streamMessage(USER, YEAR, { message: 'Und zurück?', conversationId: first }))
    expect(JSON.stringify(engine.requests[2]!.history)).toContain('38 km')
  })

  it('opens the conversation used last when none is named', async () => {
    const { service } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    await collect(service.streamMessage(USER, YEAR, { message: 'Erstes', conversationId: first }))
    const second = await service.createConversation(USER, YEAR)
    await collect(service.streamMessage(USER, YEAR, { message: 'Zweites', conversationId: second.id }))
    expect((await service.getSession(USER, YEAR)).conversationId).toBe(second.id)

    await collect(service.streamMessage(USER, YEAR, { message: 'Wieder im ersten', conversationId: first }))
    const session = await service.getSession(USER, YEAR)
    expect(session.conversationId).toBe(first)
    expect(session.conversations.map((c) => c.id)).toEqual([first, second.id])
  })

  it('does not pile up empty conversations', async () => {
    const { service } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    // The year\'s first conversation is still empty: "new conversation" is that one.
    expect((await service.createConversation(USER, YEAR)).id).toBe(first)
    await collect(service.streamMessage(USER, YEAR, { message: 'Hallo', conversationId: first }))
    const second = await service.createConversation(USER, YEAR)
    expect(second.id).not.toBe(first)
    expect((await service.createConversation(USER, YEAR)).id).toBe(second.id)
    expect(await service.listConversations(USER, YEAR)).toHaveLength(2)
  })

  it('finds a draft from another conversation: drafts belong to the return', async () => {
    const draft = {
      actionId: 'act-1', status: 'pending' as const, screen: 'interview' as const, field: 'spenden-betrag', instance: null,
      companionFields: { spenden: 'Ja' }, label: 'Spenden', previousValue: null, expectedPreviousValue: null, newValue: '300',
      beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'genannt', sourceId: 'estg-10b' as const,
    }
    const { service, interviewRepo } = build([token('Vorbereitet.'), doneEvent({ replyText: 'Vorbereitet.', meta: { action: draft } })])
    const first = (await service.getSession(USER, YEAR)).conversationId
    await collect(service.streamMessage(USER, YEAR, { message: '300 Euro gespendet', conversationId: first }))
    const second = await service.createConversation(USER, YEAR)
    expect((await service.getSession(USER, YEAR, second.id)).messages).toEqual([])

    // Applied while the other conversation is the open one.
    await service.applyAction(USER, YEAR, 'act-1')
    const answers = await interviewRepo.findAllForUserAndYear(USER, YEAR)
    expect(answers.find((a) => a.questionId === 'spenden-betrag')?.value).toBe('300')
  })

  it('refuses a conversation of another user or another year', async () => {
    const { service } = build()
    const mine = (await service.getSession(USER, YEAR)).conversationId
    await expect(service.getSession('someone-else', YEAR, mine)).rejects.toMatchObject({ code: 'ADVISOR_CONVERSATION_NOT_FOUND' })
    await expect(service.getSession(USER, YEAR - 1, mine)).rejects.toMatchObject({ code: 'ADVISOR_CONVERSATION_NOT_FOUND' })
    await expect(collect(service.streamMessage(USER, YEAR, { message: 'Hi', conversationId: 'nope' }))).rejects.toMatchObject({ code: 'ADVISOR_CONVERSATION_NOT_FOUND' })
  })

  it('empties one conversation and leaves the other alone', async () => {
    const { service, runs } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    await collect(service.streamMessage(USER, YEAR, { message: 'Erstes', conversationId: first }))
    const second = await service.createConversation(USER, YEAR)
    await collect(service.streamMessage(USER, YEAR, { message: 'Zweites', conversationId: second.id }))

    expect(await runs.clearConversation(USER, YEAR, first)).toEqual({ deletedMessages: 2 })
    expect((await service.getSession(USER, YEAR, first)).messages).toEqual([])
    expect((await service.getSession(USER, YEAR, second.id)).messages).toHaveLength(2)
    // An emptied conversation gets its name from the next first question.
    expect((await service.listConversations(USER, YEAR)).find((c) => c.id === first)?.title).toBeNull()
  })

  it('deletes a conversation with its messages; the year always keeps one', async () => {
    const { service, runs } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    await collect(service.streamMessage(USER, YEAR, { message: 'Erstes', conversationId: first }))
    expect(await runs.deleteConversation(USER, YEAR, first)).toEqual({ deletedMessages: 2 })

    const session = await service.getSession(USER, YEAR)
    expect(session.conversations).toHaveLength(1)
    expect(session.conversationId).not.toBe(first)
    expect(session.messages).toEqual([])
  })

  it('renames a conversation, without names or identifiers in the title', async () => {
    const { service } = build()
    const id = (await service.getSession(USER, YEAR)).conversationId
    const renamed = await service.renameConversation(USER, YEAR, id, '  Vermietung   IBAN DE89370400440532013000 ')
    expect(renamed.title).toContain('Vermietung')
    expect(renamed.title).not.toContain('DE89370400440532013000')
  })

  it('stops at a number of conversations nobody could keep apart', async () => {
    const { service, advisorRepo } = build()
    for (let i = 0; i < MAX_CONVERSATIONS_PER_YEAR; i += 1) {
      const conversation = await advisorRepo.createConversation(USER, YEAR, `Gespräch ${i}`)
      await advisorRepo.createMessage({ userId: USER, taxYear: YEAR, conversationId: conversation.id, role: 'user', content: 'q', meta: null })
    }
    await expect(service.createConversation(USER, YEAR)).rejects.toMatchObject({ code: 'ADVISOR_CONVERSATION_LIMIT' })
  })

  it('counts the daily quota per user, not per conversation', async () => {
    const { service, advisorRepo } = build()
    const first = (await service.getSession(USER, YEAR)).conversationId
    for (let i = 0; i < 50; i += 1) await advisorRepo.createMessage({ userId: USER, taxYear: YEAR, conversationId: first, role: 'user', content: 'q', meta: null })
    await collect(service.streamMessage(USER, YEAR, { message: 'x', conversationId: first })).catch(() => undefined)
    const second = await advisorRepo.createConversation(USER, YEAR, 'Zweites')
    await expect(collect(service.streamMessage(USER, YEAR, { message: 'Hi', conversationId: second.id }))).rejects.toMatchObject({ kind: 'rate-limited' })
  })
})

describe('titleFrom', () => {
  it('keeps a short question as it is, on one line', () => {
    expect(titleFrom('  Lohnt sich\n mein Arbeitsweg? ')).toBe('Lohnt sich mein Arbeitsweg?')
  })

  it('cuts a long one at a word', () => {
    const title = titleFrom('Ich habe im vergangenen Jahr eine Wohnung vermietet und möchte wissen, was ich absetzen kann')!
    expect(title.length).toBeLessThanOrEqual(61)
    expect(title.endsWith('…')).toBe(true)
    expect(title).not.toMatch(/ …$/)
  })

  it('has no title for nothing', () => {
    expect(titleFrom('   ')).toBeNull()
  })
})
