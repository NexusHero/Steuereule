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

describe('a full conversation is summarised (#481)', () => {
  const LONG = 'x'.repeat(2400)
  const longAnswer = answer(`Antwort ${LONG}`)

  /** A scripted engine that can also summarise; `summaries` records what it was asked to condense. */
  function buildWithSummary(reply: string | null) {
    const engine = new ScriptedAdvisorEngine(longAnswer)
    const asked: Array<{ transcript: string; previousSummary: string | null }> = []
    const summarising = Object.assign(engine, {
      summarize: async (input: { transcript: string; previousSummary: string | null }) => {
        asked.push(input)
        return reply
      },
    })
    const kit = buildAdvisorTestKit(summarising)
    const runs = new AdvisorRunService(kit.service, new InMemoryAdvisorRunLog(), kit.advisorRepo)
    return { ...kit, engine, asked, runs }
  }

  async function fill(service: ReturnType<typeof build>['service'], turns: number) {
    for (let i = 1; i <= turns; i += 1) await collect(service.streamMessage(USER, YEAR, { message: `Frage ${i} ${LONG}` }))
  }

  it('reports how full the context is, and that a short conversation cannot be summarised', async () => {
    const { service } = buildWithSummary('Zusammenfassung.')
    expect((await service.getSession(USER, YEAR)).context).toMatchObject({ percent: 0, level: 'ok', canSummarize: false })
    await fill(service, 2)
    const { context } = await service.getSession(USER, YEAR)
    expect(context.percent).toBeGreaterThan(30)
    expect(context.level).toBe('ok')
  })

  it('summarises on its own before the answer once the context is full, and says so', async () => {
    const { service, engine, asked } = buildWithSummary('Der Nutzer hat mehrere lange Fragen gestellt.')
    await fill(service, 5)
    expect((await service.getSession(USER, YEAR)).context.level).toBe('full')
    expect(asked).toHaveLength(0)

    const events = await collect(service.streamMessage(USER, YEAR, { message: 'Und jetzt?' }))
    expect(events.some((e) => e.event === 'status' && e.data.text.includes('fasst den älteren Verlauf zusammen'))).toBe(true)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.transcript).toContain('Nutzer: Frage 1')
    // The model gets the summary instead of the old turns, and still the newest ones verbatim.
    const history = engine.requests.at(-1)!.history!
    expect(history[0]!.content).toContain('Der Nutzer hat mehrere lange Fragen gestellt.')
    expect(JSON.stringify(history)).not.toContain('Frage 1 ')
    expect(JSON.stringify(history)).toContain('Frage 5 ')

    const { context, messages } = await service.getSession(USER, YEAR)
    expect(context.level).not.toBe('full')
    expect(context.summary).toBe('Der Nutzer hat mehrere lange Fragen gestellt.')
    // The user still sees every message; the dividing line sits after the last summarised one.
    expect(messages).toHaveLength(12)
    expect(messages.map((m) => m.id)).toContain(context.summarizedUntilMessageId)
  })

  it('carries an earlier summary on instead of starting over', async () => {
    const { service, asked } = buildWithSummary('Stand der Dinge.')
    await fill(service, 6)
    await fill(service, 6)
    expect(asked.length).toBeGreaterThanOrEqual(2)
    expect(asked.at(-1)!.previousSummary).toBe('Stand der Dinge.')
  })

  it('summarises on request before the context is full', async () => {
    const { service, runs, asked } = buildWithSummary('Kurzfassung.')
    await fill(service, 3)
    const id = (await service.getSession(USER, YEAR)).conversationId
    const context = await runs.summarizeConversation(USER, YEAR, id)
    expect(asked).toHaveLength(1)
    expect(context.summary).toBe('Kurzfassung.')
    expect(context.percent).toBeLessThan(60)
  })

  it('refuses to summarise what is too short', async () => {
    const { service, runs } = buildWithSummary('Kurzfassung.')
    await collect(service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    const id = (await service.getSession(USER, YEAR)).conversationId
    await expect(runs.summarizeConversation(USER, YEAR, id)).rejects.toMatchObject({ code: 'ADVISOR_NOTHING_TO_SUMMARIZE' })
  })

  it('never blocks without a model: the summary then lists the questions', async () => {
    const { service } = buildWithSummary(null)
    await fill(service, 5)
    await collect(service.streamMessage(USER, YEAR, { message: 'Und jetzt?' }))
    const { context } = await service.getSession(USER, YEAR)
    expect(context.level).not.toBe('full')
    expect(context.summary).toContain('Frage: Frage 1')
  })

  it('keeps identifiers out of a summary, whatever the model wrote', async () => {
    const { service } = buildWithSummary('Konto DE89370400440532013000 genannt.')
    await fill(service, 5)
    await collect(service.streamMessage(USER, YEAR, { message: 'Und jetzt?' }))
    expect((await service.getSession(USER, YEAR)).context.summary).not.toContain('DE89370400440532013000')
  })

  it('forgets the summary when the conversation is emptied', async () => {
    const { service, runs } = buildWithSummary('Kurzfassung.')
    await fill(service, 3)
    const id = (await service.getSession(USER, YEAR)).conversationId
    await runs.summarizeConversation(USER, YEAR, id)
    await runs.clearConversation(USER, YEAR, id)
    expect((await service.getSession(USER, YEAR, id)).context).toMatchObject({ percent: 0, canSummarize: false })
    expect((await service.getSession(USER, YEAR, id)).context.summary).toBeUndefined()
  })
})

describe('project notes (#481)', () => {
  const noting = (changes: Array<{ kind: 'added' | 'replaced' | 'removed'; text: string; noteId?: string; previousText?: string }>, text = 'Gemerkt.'): ScriptStep[] => [
    token(text),
    doneEvent({ replyText: text, meta: { noteChanges: changes } }),
  ]

  it('stores what the owl notes without a click, and says so under the answer', async () => {
    const { service } = build(noting([{ kind: 'added', text: 'Arbeitszimmer geprüft: lohnt sich nicht.' }]))
    await collect(service.streamMessage(USER, YEAR, { message: 'Lohnt sich ein Arbeitszimmer?' }))
    const session = await service.getSession(USER, YEAR)
    expect(session.notes.map((n) => n.text)).toEqual(['Arbeitszimmer geprüft: lohnt sich nicht.'])
    expect(session.notes[0]!.author).toBe('owl')
    const change = session.messages.at(-1)!.meta!.noteChanges![0]!
    expect(change).toMatchObject({ kind: 'added', text: 'Arbeitszimmer geprüft: lohnt sich nicht.', noteId: session.notes[0]!.id })
  })

  it('shows the notes of the year to the model in every conversation, by name', async () => {
    const { service, engine } = build(noting([{ kind: 'added', text: 'Fahrtenbuch wird nachgereicht.' }]))
    await collect(service.streamMessage(USER, YEAR, { message: 'Erstes Gespräch' }))
    const second = await service.createConversation(USER, YEAR)
    await collect(service.streamMessage(USER, YEAR, { message: 'Zweites Gespräch', conversationId: second.id }))
    expect(engine.requests[0]!.notes).toEqual([])
    expect(engine.requests[1]!.notes).toEqual([{ handle: 'Notiz 1', id: expect.any(String), text: 'Fahrtenbuch wird nachgereicht.' }])
    // Another year starts without them.
    await collect(service.streamMessage(USER, YEAR + 1, { message: 'Neues Jahr' }))
    expect(engine.requests[2]!.notes).toEqual([])
  })

  it('takes an added note back', async () => {
    const { service } = build(noting([{ kind: 'added', text: 'Voreilig gemerkt.' }]))
    await collect(service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    const reply = (await service.getSession(USER, YEAR)).messages.at(-1)!
    const undone = await service.undoNoteChange(USER, YEAR, reply.id, 0)
    expect(undone.meta!.noteChanges![0]!.undone).toBe(true)
    expect((await service.getSession(USER, YEAR)).notes).toEqual([])
    await expect(service.undoNoteChange(USER, YEAR, reply.id, 0)).rejects.toMatchObject({ code: 'ADVISOR_NOTE_CHANGE_UNDONE' })
  })

  /** A kit whose script is filled in after the notes it refers to exist. */
  function buildLate() {
    const script: ScriptStep[] = []
    return { ...build(script), script }
  }

  it('replaces a note and can restore what it said before', async () => {
    const { service, advisorRepo, script } = buildLate()
    const note = await advisorRepo.createNote(USER, YEAR, 'Arbeitsweg 38 km.', 'owl')
    script.push(...noting([{ kind: 'replaced', noteId: note.id, text: 'Arbeitsweg 40 km.' }]))
    await collect(service.streamMessage(USER, YEAR, { message: 'Es sind doch 40 km.' }))
    expect((await service.listNotes(USER, YEAR)).map((n) => n.text)).toEqual(['Arbeitsweg 40 km.'])
    const reply = (await service.getSession(USER, YEAR)).messages.at(-1)!
    expect(reply.meta!.noteChanges![0]).toMatchObject({ kind: 'replaced', previousText: 'Arbeitsweg 38 km.' })

    await service.undoNoteChange(USER, YEAR, reply.id, 0)
    expect((await service.listNotes(USER, YEAR)).map((n) => n.text)).toEqual(['Arbeitsweg 38 km.'])
  })

  it('lets the owl forget a note, and brings it back on undo', async () => {
    const { service, advisorRepo, script } = buildLate()
    const note = await advisorRepo.createNote(USER, YEAR, 'Gilt nicht mehr.', 'owl')
    script.push(...noting([{ kind: 'removed', noteId: note.id, text: 'Gilt nicht mehr.' }]))
    await collect(service.streamMessage(USER, YEAR, { message: 'Das hat sich erledigt.' }))
    expect(await service.listNotes(USER, YEAR)).toEqual([])

    const reply = (await service.getSession(USER, YEAR)).messages.at(-1)!
    await service.undoNoteChange(USER, YEAR, reply.id, 0)
    expect((await service.listNotes(USER, YEAR)).map((n) => n.text)).toEqual(['Gilt nicht mehr.'])
  })

  it('ignores a change to a note of another year or another user', async () => {
    const { service, advisorRepo, script } = buildLate()
    const foreign = await advisorRepo.createNote('someone-else', YEAR, 'Fremde Notiz.', 'owl')
    script.push(...noting([{ kind: 'removed', noteId: foreign.id, text: 'x' }]))
    await collect(service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    expect((await service.listNotes('someone-else', YEAR)).map((n) => n.text)).toEqual(['Fremde Notiz.'])
    expect((await service.getSession(USER, YEAR)).messages.at(-1)!.meta?.noteChanges).toBeUndefined()
  })

  it('lets the user add, change and delete notes; the text loses identifiers', async () => {
    const { service } = build()
    const note = await service.createNote(USER, YEAR, '  Konto DE89370400440532013000\n für Erstattung ')
    expect(note.author).toBe('user')
    expect(note.text).not.toContain('DE89370400440532013000')
    const changed = await service.updateNote(USER, YEAR, note.id, 'Erstattung auf das Girokonto.')
    expect(changed.text).toBe('Erstattung auf das Girokonto.')
    await service.deleteNote(USER, YEAR, note.id)
    expect(await service.listNotes(USER, YEAR)).toEqual([])
    await expect(service.updateNote(USER, YEAR, note.id, 'x')).rejects.toMatchObject({ code: 'ADVISOR_NOTE_NOT_FOUND' })
  })

  it('refuses a note that is too long, and more notes than a year may hold', async () => {
    const { service } = build()
    await expect(service.createNote(USER, YEAR, 'x'.repeat(201))).rejects.toMatchObject({ code: 'ADVISOR_NOTE_INVALID' })
    for (let i = 0; i < 20; i += 1) await service.createNote(USER, YEAR, `Notiz Nummer ${i}`)
    await expect(service.createNote(USER, YEAR, 'eine zu viel')).rejects.toMatchObject({ code: 'ADVISOR_NOTE_LIMIT' })
  })
})
