// ADR-0091 end to end through the AdvisorService on fakes: masking, the consent card, drafts for
// personal fields, new children and rental objects, and the revocation with immediate effect.
// C3: two drafts of one answer on the same record do not block each other.
import type { AdvisorActionProposal, AdvisorStreamEvent } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { buildAdvisorTestKit, collect, doneEvent, ScriptedAdvisorEngine, type ScriptStep } from './fakes/advisor-test-kit.js'

const USER = 'user-personal'
const YEAR = 2025
const token = (text: string): AdvisorStreamEvent => ({ event: 'token', data: { text } })

const draft = (over: Partial<AdvisorActionProposal> & Pick<AdvisorActionProposal, 'actionId' | 'screen' | 'field' | 'newValue'>): AdvisorActionProposal => ({
  status: 'pending',
  instance: null,
  label: 'Eintrag',
  previousValue: null,
  expectedPreviousValue: null,
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: 'Vom Nutzer genannt',
  sourceId: 'estg-9-1',
  paragraph: '§ 9 EStG',
  ...over,
})

function build(script: readonly ScriptStep[] = [token('Gut.'), doneEvent({ replyText: 'Gut.' })]) {
  const engine = new ScriptedAdvisorEngine(script)
  return { ...buildAdvisorTestKit(engine), engine }
}

const answerWith = (actions: AdvisorActionProposal[], meta: object = {}): ScriptStep[] => [token('Vorbereitet.'), doneEvent({ replyText: 'Vorbereitet.', meta: { actions, ...meta } })]

async function lastAnswer(kit: ReturnType<typeof build>) {
  const session = await kit.service.getSession(USER, YEAR)
  return session.messages.filter((m) => m.role === 'assistant').at(-1)!
}

describe('personal data with the owl (ADR-0091)', () => {
  it('masks personal data without consent and offers the consent card', async () => {
    const kit = build()
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Meine Steuer-ID ist 12345678901' }))
    expect(kit.engine.requests[0]!.message).toContain('[STEUER-ID-GESCHÜTZT]')
    expect(kit.engine.requests[0]!.personalDataConsent).toBe(false)
    expect((await lastAnswer(kit)).meta?.personalDataConsentRequest).toBe(true)
  })

  it('offers no card when nothing personal was written', async () => {
    const kit = build()
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Lohnt sich mein Arbeitsweg?' }))
    expect((await lastAnswer(kit)).meta?.personalDataConsentRequest).toBeUndefined()
  })

  it('passes the words unmasked with consent, and masks again once it is revoked', async () => {
    const kit = build()
    await kit.consent.set(USER, true)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Meine Steuer-ID ist 12345678901' }))
    expect(kit.engine.requests[0]!.message).toBe('Meine Steuer-ID ist 12345678901')
    expect(kit.engine.requests[0]!.personalDataConsent).toBe(true)
    expect((await lastAnswer(kit)).meta?.personalDataConsentRequest).toBeUndefined()

    await kit.consent.set(USER, false)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Und weiter?' }))
    const history = kit.engine.requests[1]!.history ?? []
    expect(JSON.stringify(history)).not.toContain('12345678901')
    expect(kit.engine.requests[1]!.personalDataConsent).toBe(false)
  })

  it('applies a draft of the Steuer-ID with consent, and refuses it after the revocation', async () => {
    const kit = build(answerWith([draft({ actionId: 'a-id', screen: 'profil', field: 'steuerId', newValue: '12345678901' }), draft({ actionId: 'a-name', screen: 'profil', field: 'firstName', newValue: 'Lena' })]))
    await kit.consent.set(USER, true)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Steuer-ID 12345678901, ich heiße Lena' }))
    await kit.service.applyAction(USER, YEAR, 'a-id')
    expect((await kit.profileRepo.findByUserId(USER))?.steuerId).toBe('12345678901')
    await kit.consent.set(USER, false)
    await expect(kit.service.applyAction(USER, YEAR, 'a-name')).rejects.toThrow(/Einwilligung/)
  })

  it('creates a new child from its draft, and the second draft of the same answer fills the same child', async () => {
    const kit = build(
      answerWith([
        draft({ actionId: 'k-1', screen: 'kind', instance: 'neu:1', field: 'firstName', newValue: 'Felix', companionFields: { geburtsdatum: '2019-05-12', lastName: 'Richter' } }),
        draft({ actionId: 'k-2', screen: 'kind', instance: 'neu:1', field: 'childcareEur', newValue: '1200' }),
      ]),
    )
    await kit.consent.set(USER, true)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Mein Sohn Felix, geboren 12.05.2019, Kita 1200 €' }))
    await kit.service.applyAction(USER, YEAR, 'k-1')
    await kit.service.applyAction(USER, YEAR, 'k-2')
    const children = await kit.childRepo.listForUserAndYear(USER, YEAR)
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({ firstName: 'Felix', lastName: 'Richter', geburtsdatum: '2019-05-12', childcareEur: '1200' })
  })

  it('creates the child once when both drafts are applied together', async () => {
    const kit = build(
      answerWith([
        draft({ actionId: 'k-2', screen: 'kind', instance: 'neu:1', field: 'childcareEur', newValue: '1200' }),
        draft({ actionId: 'k-1', screen: 'kind', instance: 'neu:1', field: 'firstName', newValue: 'Felix', companionFields: { geburtsdatum: '2019-05-12' } }),
      ]),
    )
    await kit.consent.set(USER, true)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Felix, 12.05.2019, Kita 1200 €' }))
    await kit.service.applyBatch(USER, YEAR, { drafts: [{ actionId: 'k-2' }, { actionId: 'k-1' }] })
    const children = await kit.childRepo.listForUserAndYear(USER, YEAR)
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({ firstName: 'Felix', childcareEur: '1200' })
  })

  it('removes the child it created when that draft is undone', async () => {
    const kit = build(answerWith([draft({ actionId: 'k-1', screen: 'kind', instance: 'neu:1', field: 'firstName', newValue: 'Felix', companionFields: { geburtsdatum: '2019-05-12' } })]))
    await kit.consent.set(USER, true)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Felix, 12.05.2019' }))
    await kit.service.applyAction(USER, YEAR, 'k-1')
    await kit.service.undoAction(USER, YEAR, 'k-1')
    expect(await kit.childRepo.listForUserAndYear(USER, YEAR)).toHaveLength(0)
  })

  it('creates a rental object without consent', async () => {
    const kit = build(answerWith([draft({ actionId: 'v-1', screen: 'vermietung', instance: 'neu:1', field: 'mieteinnahmen', newValue: '9600', companionFields: { livingArea: '85', einheiten: '1' } })]))
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Ich vermiete eine Wohnung, 85 m², 9.600 € Miete' }))
    await kit.service.applyAction(USER, YEAR, 'v-1')
    const objects = await kit.rentalRepo.listForUserAndYear(USER, YEAR)
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({ mieteinnahmen: '9600', livingArea: '85', einheiten: '1' })
  })

  it('sets up Person B through the joint return, so B\'s drafts have a place', async () => {
    const kit = build(answerWith([draft({ actionId: 'p-1', screen: 'kopplung', field: 'filingType', newValue: 'zusammen' })]))
    await kit.consent.set(USER, true)
    await collect(kit.service.streamMessage(USER, YEAR, { message: 'Ich bin verheiratet, wir wollen zusammen veranlagt werden' }))
    await kit.service.applyAction(USER, YEAR, 'p-1')
    expect((await kit.service.advisorHousehold(USER, YEAR)).personB).toMatchObject({ recordable: true })
  })
})

describe('two drafts of one answer on the commute (C3)', () => {
  it('does not count the first draft\'s new record as a manual change against the second', async () => {
    const kit = build(
      answerWith([
        draft({ actionId: 'c-1', screen: 'commute', field: 'oneWayKm', newValue: '25', companionFields: { vacationDays: '30' } }),
        draft({ actionId: 'c-2', screen: 'commute', field: 'sickDays', newValue: '3', companionFields: { publicHolidayRegion: 'NW' } }),
      ]),
    )
    await collect(kit.service.streamMessage(USER, YEAR, { message: '25 km, 30 Tage Urlaub, 3 Tage krank, NRW' }))
    await kit.service.applyAction(USER, YEAR, 'c-1')
    await kit.service.applyAction(USER, YEAR, 'c-2')
    expect(await kit.commuteRepo.findForUserAndYear(USER, YEAR)).toMatchObject({ oneWayKm: 25, vacationDays: 30, sickDays: 3, publicHolidayRegion: 'NW' })
  })

  it('still stops a draft when the user changed its field in between', async () => {
    const kit = build(
      answerWith([
        draft({ actionId: 'c-1', screen: 'commute', field: 'oneWayKm', newValue: '25' }),
        draft({ actionId: 'c-2', screen: 'commute', field: 'sickDays', newValue: '3' }),
      ]),
    )
    await collect(kit.service.streamMessage(USER, YEAR, { message: '25 km, 3 Tage krank' }))
    await kit.service.applyAction(USER, YEAR, 'c-1')
    const stored = (await kit.commuteRepo.findForUserAndYear(USER, YEAR))!
    await kit.commuteRepo.save(USER, YEAR, { ...stored, sickDays: 7 })
    await expect(kit.service.applyAction(USER, YEAR, 'c-2')).rejects.toThrow(/manuell geändert/)
  })
})
