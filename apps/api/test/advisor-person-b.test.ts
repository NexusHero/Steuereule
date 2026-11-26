// ADR-0073: in a joint return the owl drafts Person B's figures for B, through the same write path
// the masks use for B (LinkService.dataUser), and never as the user's own.
import { describe, expect, it } from 'vitest'
import { AIMessageChunk } from '@langchain/core/messages'
import type { AdvisorMessageMeta, AdvisorStreamEvent } from '@steuereule/core'
import { LangGraphAdvisorEngine } from '../src/ki/langgraph-advisor.engine.js'
import { buildAdvisorTestKit, collect, type AdvisorTestKit } from './fakes/advisor-test-kit.js'
import { runtime, ScriptedModel } from './fakes/scripted-model.js'

/** The mask's call on a session that passed the step-up (a new invitation code grants a third party access). */
const STEPPED_UP = async (): Promise<void> => {}

const USER = 'user-a'
const YEAR = 2025

const stage = (...calls: Array<Record<string, unknown>>): AIMessageChunk =>
  new AIMessageChunk({
    content: '',
    tool_call_chunks: calls.map((args, index) => ({ name: 'stage_field_draft', args: JSON.stringify(args), index, id: `c${index}` })),
  } as never)

const metaOf = (events: readonly AdvisorStreamEvent[]): AdvisorMessageMeta => {
  const done = events.find((e) => e.event === 'done')
  if (!done) throw new Error('the turn did not finish')
  return (done.data as { assistantMessage: { meta: AdvisorMessageMeta } }).assistantMessage.meta
}

function kitWith(rounds: AIMessageChunk[]): { kit: AdvisorTestKit; model: ScriptedModel } {
  const model = new ScriptedModel(rounds)
  return { kit: buildAdvisorTestKit(new LangGraphAdvisorEngine(runtime, () => model)), model }
}

const commute = (oneWayKm: number) => ({ workdays: [1, 2, 3, 4, 5] as const, vacationDays: 0, sickDays: 0, homeOfficeDays: 0, oneWayKm, transport: null, workplace: null })

/** A joint return in which A records B's figures; B is called Gülay. */
async function jointReturn(kit: AdvisorTestKit): Promise<string> {
  await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' }, new Date(), STEPPED_UP)
  await kit.linkService.updatePersonB(USER, YEAR, { firstName: 'Gülay', lastName: 'Yilmaz' })
  return kit.linkService.dataUser(USER, YEAR, 'B')
}

describe('the owl drafts the spouse’s figures for Person B', () => {
  it('writes the wife’s commute and Swiss salary into B’s masks, the user’s own stay untouched', async () => {
    const { kit, model } = kitWith([
      stage(
        { screen: 'commute', field: 'oneWayKm', newValue: '24', label: 'Arbeitsweg Person B', person: 'B' },
        { screen: 'chLohnausweis', field: 'bruttolohn-total', newValue: '84.000', label: 'Bruttolohn CH Person B', person: 'B' },
      ),
      new AIMessageChunk({ content: 'Für Person B vorbereitet.' }),
    ])
    const spouse = await jointReturn(kit)
    await kit.commuteRepo.save(USER, YEAR, commute(12))

    const events = await collect(kit.service.streamMessage(USER, YEAR, { message: 'Gülay fährt 24 km zur Arbeit und verdient 84.000 CHF in der Schweiz.' }))
    const actions = metaOf(events).actions ?? [metaOf(events).action!]
    expect(actions.map((a) => [a.screen, a.field, a.person])).toEqual([
      ['commute', 'oneWayKm', 'B'],
      ['chLohnausweis', 'bruttolohn-total', 'B'],
    ])

    // The model got the handle and the household, never the name.
    const seen = model.seen.join(' ')
    expect(seen).toContain('Person B fährt 24 km')
    expect(seen).toContain('Zusammenveranlagung mit Person B')
    expect(seen).not.toContain('Gülay')
    expect(seen).not.toContain('Yilmaz')

    await kit.service.applyBatch(USER, YEAR, { drafts: actions.map((a) => ({ actionId: a.actionId })) })
    expect((await kit.commuteRepo.findForUserAndYear(spouse, YEAR))?.oneWayKm).toBe(24)
    expect((await kit.chRepo.findForUserAndYear(spouse, YEAR))?.fields['bruttolohn-total']).toBe('84000')
    expect((await kit.commuteRepo.findForUserAndYear(USER, YEAR))?.oneWayKm).toBe(12)
    expect(await kit.chRepo.findForUserAndYear(USER, YEAR)).toBeNull()

    await kit.service.undoAction(USER, YEAR, actions[0]!.actionId)
    expect((await kit.commuteRepo.findForUserAndYear(spouse, YEAR))?.oneWayKm ?? null).toBeNull()
    expect((await kit.commuteRepo.findForUserAndYear(USER, YEAR))?.oneWayKm).toBe(12)
  })

  it('reads B’s previous value as the baseline, not the user’s', async () => {
    const { kit } = kitWith([stage({ screen: 'commute', field: 'oneWayKm', newValue: '24', label: 'Arbeitsweg Person B', person: 'B' }), new AIMessageChunk({ content: 'Ok.' })])
    const spouse = await jointReturn(kit)
    await kit.commuteRepo.save(USER, YEAR, commute(12))
    await kit.commuteRepo.save(spouse, YEAR, commute(30))

    const action = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Meine Frau fährt 24 km.' }))).action!
    expect(action).toMatchObject({ person: 'B', previousValue: '30', expectedPreviousValue: '30' })
  })

  it('keeps a draft for the user and one for B on the same field side by side', async () => {
    const { kit } = kitWith([
      stage(
        { screen: 'commute', field: 'oneWayKm', newValue: '12', label: 'Arbeitsweg', person: 'A' },
        { screen: 'commute', field: 'oneWayKm', newValue: '24', label: 'Arbeitsweg Person B', person: 'B' },
      ),
      new AIMessageChunk({ content: 'Beide vorbereitet.' }),
    ])
    const spouse = await jointReturn(kit)
    const meta = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Ich fahre 12 km, meine Frau 24 km.' })))
    const actions = meta.actions ?? []
    expect(actions.map((a) => [a.newValue, a.person ?? 'A'])).toEqual([
      ['12', 'A'],
      ['24', 'B'],
    ])
    await kit.service.applyBatch(USER, YEAR, { drafts: actions.map((a) => ({ actionId: a.actionId })) })
    expect((await kit.commuteRepo.findForUserAndYear(USER, YEAR))?.oneWayKm).toBe(12)
    expect((await kit.commuteRepo.findForUserAndYear(spouse, YEAR))?.oneWayKm).toBe(24)
  })
})

// Real-data runs 2024/2025: drafts for the spouse without `person` landed on the user and overwrote the
// user's commute (67 → 26 km) and first name. In a joint return the person is no longer a silent default.
describe('in a joint return, every draft on a mask of one spouse says whose it is', () => {
  const withdraw = (args: Record<string, unknown>): AIMessageChunk =>
    new AIMessageChunk({ content: '', tool_call_chunks: [{ name: 'withdraw_draft', args: JSON.stringify(args), index: 0, id: 'w0' }] } as never)

  it('refuses a draft without `person`, and the owl stages it again for B', async () => {
    const { kit, model } = kitWith([
      stage({ screen: 'commute', field: 'oneWayKm', newValue: '26', label: 'Arbeitsweg Schaffhausen' }),
      stage({ screen: 'commute', field: 'oneWayKm', newValue: '26', label: 'Arbeitsweg Schaffhausen', person: 'B' }),
      new AIMessageChunk({ content: 'Für Person B vorbereitet.' }),
    ])
    await jointReturn(kit)
    await kit.commuteRepo.save(USER, YEAR, commute(67))
    const meta = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Gülay fährt 26 km nach Schaffhausen.' })))
    expect(model.seen.join(' ')).toContain('PERSON_REQUIRED')
    const actions = meta.actions ?? [meta.action!]
    expect(actions.map((a) => [a.field, a.newValue, a.person])).toEqual([['oneWayKm', '26', 'B']])
  })

  it('refuses a draft for the user whose title names the spouse by name, which the model never saw', async () => {
    const { kit } = kitWith([
      stage({ screen: 'commute', field: 'oneWayKm', newValue: '26', label: 'Gülay, Arbeitsweg Schaffhausen', person: 'A' }),
      new AIMessageChunk({ content: 'Ok.' }),
    ])
    await jointReturn(kit)
    await kit.commuteRepo.save(USER, YEAR, commute(67))
    const meta = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Gülay fährt 26 km.' })))
    expect(meta.action).toBeUndefined()
    expect(meta.notStaged?.[0]?.reason).toContain('nennt Person B')
    expect((await kit.commuteRepo.findForUserAndYear(USER, YEAR))?.oneWayKm).toBe(67)
  })

  it('lets the owl withdraw a draft of its own answer that it found wrong', async () => {
    const { kit, model } = kitWith([
      stage(
        { screen: 'commute', field: 'oneWayKm', newValue: '24', label: 'Arbeitsweg Person B', person: 'B' },
        { screen: 'chLohnausweis', field: 'bruttolohn-total', newValue: '84000', label: 'Bruttolohn CH Person B', person: 'B' },
      ),
      withdraw({ screen: 'commute', field: 'oneWayKm', person: 'B' }),
      new AIMessageChunk({ content: 'Den Arbeitsweg habe ich zurückgezogen.' }),
    ])
    await jointReturn(kit)
    const meta = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Gülay verdient 84.000 CHF.' })))
    const actions = meta.actions ?? [meta.action!]
    expect(actions.map((a) => a.field)).toEqual(['bruttolohn-total'])
    expect(model.seen.join(' ')).toMatch(/withdrawn\\?":1/)
  })

  it('answers when there is nothing to withdraw', async () => {
    const { kit, model } = kitWith([withdraw({ screen: 'commute', field: 'oneWayKm', person: 'A' }), new AIMessageChunk({ content: 'Ok.' })])
    await jointReturn(kit)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Hallo' }))
    expect(model.seen.join(' ')).toContain('NO_SUCH_DRAFT')
  })
})

describe('the owl refuses a draft for Person B where there is none to write for', () => {
  const refusedFor = async (setup: (kit: AdvisorTestKit) => Promise<unknown>, args: Record<string, unknown>) => {
    const { kit } = kitWith([stage(args), new AIMessageChunk({ content: 'Leider nicht.' })])
    await setup(kit)
    const meta = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Meine Frau fährt 24 km.' })))
    expect(meta.action).toBeUndefined()
    return { kit, notStaged: meta.notStaged ?? [] }
  }

  it('without a joint return', async () => {
    const { notStaged } = await refusedFor(async () => {}, { screen: 'commute', field: 'oneWayKm', newValue: '24', label: 'Arbeitsweg Person B', person: 'B' })
    expect(notStaged).toEqual([expect.objectContaining({ label: 'Arbeitsweg Person B', reason: expect.stringContaining('keine Zusammenveranlagung') })])
  })

  it('when B keeps an own account, as the mask does', async () => {
    const { notStaged } = await refusedFor(
      async (kit) => {
        const link = await kit.linkService.set(USER, YEAR, { filingType: 'zusammen' }, new Date(), STEPPED_UP)
        await kit.linkService.joinWithCode('user-b', YEAR, link.invitationCode!)
      },
      { screen: 'lstb', field: 'bruttoarbeitslohn', newValue: '40000', label: 'Lohn Person B', person: 'B' },
    )
    expect(notStaged[0]?.reason).toContain('eigenen Konto')
  })

  it('on a mask of the joint return', async () => {
    const { notStaged } = await refusedFor(jointReturn, { screen: 'interview', field: 'spenden-betrag', newValue: '300', label: 'Spenden Person B', person: 'B' })
    expect(notStaged[0]?.reason).toContain('gemeinsamen Erklärung')
  })

  it('on a locked field, as for the user', async () => {
    const { kit, notStaged } = await refusedFor(jointReturn, { screen: 'commute', field: 'workplace', newValue: 'Basel', label: 'Arbeitsort Person B', person: 'B' })
    expect(notStaged[0]?.label).toBe('Arbeitsort Person B')
    expect(await kit.commuteRepo.findForUserAndYear(await kit.linkService.dataUser(USER, YEAR, 'B'), YEAR)).toBeNull()
  })

  it('on apply, once B has joined with an own account since; dismissing still works', async () => {
    const { kit } = kitWith([stage({ screen: 'commute', field: 'oneWayKm', newValue: '24', label: 'Arbeitsweg Person B', person: 'B' }), new AIMessageChunk({ content: 'Ok.' })])
    await jointReturn(kit)
    const action = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Meine Frau fährt 24 km.' }))).action!
    const link = await kit.linkService.get(USER, YEAR)
    await kit.linkService.joinWithCode('user-b', YEAR, link.invitationCode!)

    await expect(kit.service.applyAction(USER, YEAR, action.actionId)).rejects.toMatchObject({ code: 'PERSON_B_OWNS_DATA' })
    expect(await kit.commuteRepo.findForUserAndYear('user-b', YEAR)).toBeNull()
    await expect(kit.service.dismissAction(USER, YEAR, action.actionId)).resolves.toMatchObject({ action: { status: 'dismissed' } })
  })
})

describe('without the model, the rules never put the spouse’s figures into the user’s fields', () => {
  it('drafts nothing for „Meine Frau … 24 km“', async () => {
    const kit = buildAdvisorTestKit()
    await jointReturn(kit)
    const meta = metaOf(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Meine Frau hat 24 km Arbeitsweg.' })))
    expect(meta.action).toBeUndefined()
    expect(meta.twoPaths).toBeUndefined()
  })
})

describe('the spouse in the history the model reads (real-case test)', () => {
  it('is „Person B“, also in the genitive, never „[MANDANT]“; the user keeps the shared last name masked', async () => {
    const { historySources } = await import('../src/advisor/advisor-shared.js')
    const records = [{ role: 'assistant', content: 'Für Gülay und Gülays Konto habe ich 16 € vorbereitet, Herr Muster.', meta: null, status: 'complete' }] as never
    const [entry] = historySources(records, ['Kemal', 'Muster', 'Gülay'], ['Gülay'])
    expect(entry!.content).toBe('Für Person B und Person B Konto habe ich 16 € vorbereitet, Herr [MANDANT].')
  })
})

describe('a scanned LStB of Person B (escalation case)', () => {
  const field = (value: number) => ({ value, status: 'ok' as const, sourceLines: ['3'], calculation: [{ line: '3', amount: value }], reason: null })
  const scan = (kit: AdvisorTestKit, person: 'A' | 'B', digestUserId: string, gross: number) =>
    kit.service.stageLstbScanBatch(USER, YEAR, {
      digestUserId,
      receiptId: null,
      stage: 'deterministic',
      taxYearOnDocument: YEAR,
      ...(person === 'B' ? { person } : {}),
      engine: { mode: 'deterministic_fallback', provider: 'deterministic' },
      summaryText: 'Lohnsteuerbescheinigung (2025) analysiert.',
      fields: [{ field: 'bruttoarbeitslohn', label: 'Bruttoarbeitslohn (Zeile 3)', extracted: field(gross) }],
    })

  it('drafts for B, leaves the user’s own LStB drafts standing, and writes into B’s record', async () => {
    const kit = buildAdvisorTestKit()
    const spouse = await jointReturn(kit)
    const own = await scan(kit, 'A', USER, 36_000)
    const partner = await scan(kit, 'B', spouse, 21_000)
    expect(partner.actions.map((a) => a.person)).toEqual(['B'])

    await kit.service.applyBatch(USER, YEAR, { drafts: [...own.actions, ...partner.actions].map((a) => ({ actionId: a.actionId })) })
    expect((await kit.lstbRepo.findForUserAndYear(USER, YEAR))?.bruttoarbeitslohn).toBe('36000')
    expect((await kit.lstbRepo.findForUserAndYear(spouse, YEAR))?.bruttoarbeitslohn).toBe('21000')
  })
})
