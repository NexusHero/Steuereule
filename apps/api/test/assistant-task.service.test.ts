// Fast, no-DB unit tier (ADR-0004): the tasks an assistant leaves for the user (#547).
import { beforeEach, describe, expect, it } from 'vitest'
import { AssistantTaskService, MAX_OPEN_TASKS, MAX_TASK_TEXT } from '../src/assistant-task/assistant-task.service.js'
import { NotFoundError } from '../src/common/domain-error.js'
import { FakeAssistantTaskRepository } from './fakes/fake-assistant-task.repository.js'

const USER = 'user-1'
const YEAR = 2025
const CONFESSION = { kind: 'konfession', text: 'Bitte trage deine Konfession in den Stammdaten ein.', assistant: 'Claude' } as const

describe('AssistantTaskService', () => {
  let service: AssistantTaskService

  beforeEach(() => {
    service = new AssistantTaskService(new FakeAssistantTaskRepository())
  })

  it('stores a task that is open for the user and listed for its assistant', async () => {
    const result = await service.create(USER, YEAR, CONFESSION)
    expect(result).toMatchObject({ ok: true, existing: false, task: { kind: 'konfession', status: 'offen', assistant: 'Claude' } })
    expect((await service.listOpen(USER, YEAR)).map((t) => t.text)).toEqual([CONFESSION.text])
    expect(await service.listForAssistant(USER, YEAR, 'Claude')).toHaveLength(1)
  })

  it('keeps tasks apart per user, per year and per assistant', async () => {
    await service.create(USER, YEAR, CONFESSION)
    expect(await service.listOpen('user-2', YEAR)).toEqual([])
    expect(await service.listOpen(USER, YEAR - 1)).toEqual([])
    expect(await service.listForAssistant(USER, YEAR, 'Another')).toEqual([])
  })

  it('trims the text and refuses an empty or too long one', async () => {
    const stored = await service.create(USER, YEAR, { ...CONFESSION, text: '  Bitte  die Einwilligung\ngeben. ' })
    expect(stored).toMatchObject({ ok: true, task: { text: 'Bitte die Einwilligung geben.' } })
    expect(await service.create(USER, YEAR, { ...CONFESSION, text: '   ' })).toMatchObject({ ok: false, code: 'TEXT_INVALID' })
    expect(await service.create(USER, YEAR, { ...CONFESSION, text: 'a'.repeat(MAX_TASK_TEXT + 1) })).toMatchObject({ ok: false, code: 'TEXT_INVALID' })
    expect(await service.create(USER, YEAR, { ...CONFESSION, text: 'a'.repeat(MAX_TASK_TEXT) })).toMatchObject({ ok: true })
  })

  it('refuses a kind outside the fixed list', async () => {
    expect(await service.create(USER, YEAR, { ...CONFESSION, kind: 'ueberweisen' as never })).toMatchObject({ ok: false, code: 'KIND_UNKNOWN' })
  })

  it('refuses a text that carries an identifier, in German, and stores nothing', async () => {
    const iban = await service.create(USER, YEAR, { ...CONFESSION, text: 'Bitte prüfe die IBAN DE89370400440532013000.' })
    expect(iban).toMatchObject({ ok: false, code: 'TEXT_HAS_IDENTIFIER' })
    expect(iban.ok === false && iban.reason).toContain('Kennung')
    expect(await service.create(USER, YEAR, { ...CONFESSION, text: 'Steuer-ID 12345678901 fehlt.' })).toMatchObject({ ok: false, code: 'TEXT_HAS_IDENTIFIER' })
    expect(await service.listOpen(USER, YEAR)).toEqual([])
  })

  it('returns the open task instead of storing the same kind and text twice', async () => {
    const first = await service.create(USER, YEAR, CONFESSION)
    const second = await service.create(USER, YEAR, { ...CONFESSION, text: ` ${CONFESSION.text} ` })
    expect(second).toMatchObject({ ok: true, existing: true })
    expect(second.ok && first.ok && second.task.id === first.task.id).toBe(true)
    expect(await service.listOpen(USER, YEAR)).toHaveLength(1)
  })

  it(`stops at ${MAX_OPEN_TASKS} open tasks per year`, async () => {
    for (let i = 0; i < MAX_OPEN_TASKS; i += 1) await service.create(USER, YEAR, { ...CONFESSION, text: `Aufgabe ${i}` })
    expect(await service.create(USER, YEAR, { ...CONFESSION, text: 'Eine mehr' })).toMatchObject({ ok: false, code: 'TOO_MANY_TASKS' })
    // A decided task frees a place.
    const [first] = await service.listOpen(USER, YEAR)
    await service.decide(USER, YEAR, first!.id, 'erledigt')
    expect(await service.create(USER, YEAR, { ...CONFESSION, text: 'Eine mehr' })).toMatchObject({ ok: true })
  })

  it('lets the user settle or discard a task, and the assistant sees the state', async () => {
    const a = await service.create(USER, YEAR, CONFESSION)
    const b = await service.create(USER, YEAR, { ...CONFESSION, kind: 'bestaetigen', text: 'Bitte bestätige die Einträge der Anlage N.' })
    if (!a.ok || !b.ok) throw new Error('setup')
    await service.decide(USER, YEAR, a.task.id, 'erledigt')
    await service.decide(USER, YEAR, b.task.id, 'verworfen')
    expect(await service.listOpen(USER, YEAR)).toEqual([])
    expect((await service.listForAssistant(USER, YEAR, 'Claude')).map((t) => t.status)).toEqual(['erledigt', 'verworfen'])
  })

  it('does not decide a task of another user, an unknown one, or one already decided', async () => {
    const created = await service.create(USER, YEAR, CONFESSION)
    if (!created.ok) throw new Error('setup')
    await expect(service.decide('user-2', YEAR, created.task.id, 'erledigt')).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.decide(USER, YEAR, 'nope', 'erledigt')).rejects.toBeInstanceOf(NotFoundError)
    await service.decide(USER, YEAR, created.task.id, 'verworfen')
    await expect(service.decide(USER, YEAR, created.task.id, 'erledigt')).rejects.toBeInstanceOf(NotFoundError)
    expect((await service.listForAssistant(USER, YEAR, 'Claude'))[0]?.status).toBe('verworfen')
  })

  it('refuses a text with a link or a web address', async () => {
    const fresh = new AssistantTaskService(new FakeAssistantTaskRepository())
    for (const text of ['Bitte bestätige unter https://example.com', 'Siehe www.beispiel.de', 'Melde dich bei konto-pruefung.com an']) {
      expect(await fresh.create('u1', 2025, { kind: 'sonstiges', text, assistant: 'Claude' })).toMatchObject({ ok: false, code: 'TEXT_HAS_LINK' })
    }
    expect(await fresh.create('u1', 2025, { kind: 'beleg_nachreichen', text: 'Bitte die Prämienbescheinigung für Juli bis Dezember nachreichen (z.B. als PDF).', assistant: 'Claude' })).toMatchObject({ ok: true })
  })
})
