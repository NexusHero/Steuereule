import { describe, expect, it } from 'vitest'
import type { ArbeitswegEingaben, ArbeitswegRepository } from '../src/arbeitsweg/arbeitsweg.repository.js'
import type { ChLohnausweisRecord } from '../src/ch-lohnausweis/ch-lohnausweis.repository.js'
import type { StammdatenRecord } from '../src/stammdaten/stammdaten.repository.js'
import { SteuerschaetzungService } from '../src/steuerschaetzung/steuerschaetzung.service.js'
import { FakeChLohnausweisRepository } from './fakes/fake-ch-lohnausweis.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeStammdatenRepository } from './fakes/fake-stammdaten.repository.js'
import type { SteuerschaetzungStand } from '../src/steuerschaetzung/steuerschaetzung.service.js'

function spanne(stand: SteuerschaetzungStand) {
  if (stand.kind !== 'spanne') throw new Error(`expected a range, got ${stand.kind}`)
  return stand
}

function arbeitsweg(eingaben: ArbeitswegEingaben | null): ArbeitswegRepository {
  return { findForUserAndYear: async () => eingaben, save: async (_u, _j, e) => e }
}

function setup(weg: ArbeitswegEingaben | null = null) {
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const ch = new FakeChLohnausweisRepository()
  const stammdaten = new FakeStammdatenRepository()
  const service = new SteuerschaetzungService(lstb, interview, ch, stammdaten, arbeitsweg(weg))
  return { lstb, interview, ch, stammdaten, service }
}

const ANGESTELLT = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' }

describe('SteuerschaetzungService', () => {
  it('estimates the refund for a complete Lohnsteuerbescheinigung', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, ANGESTELLT)
    lstb.seed({ userId: 'u', steuerjahr: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    const stand = spanne(await service.getState('u', 2025))

    expect(stand.ergebnis.von).toBeGreaterThan(0)
    expect(stand.ergebnis.von).toBeLessThan(stand.ergebnis.bis)
  })

  it('takes the Entfernungspauschale from the stored commute', async () => {
    const { lstb, interview, service } = setup({
      arbeitstage: [1, 2, 3, 4, 5],
      urlaubstage: 30,
      krankheitstage: 5,
      homeofficeTage: 20,
      einfacheKm: 30,
      verkehrsmittel: 'pkw',
      taetigkeitsstaette: null,
    })
    interview.seed('u', 2025, ANGESTELLT)
    lstb.seed({ userId: 'u', steuerjahr: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    const stand = spanne(await service.getState('u', 2025))

    expect(stand.werbungskosten).toBe(2019)
  })

  it('names what is still missing instead of estimating from an incomplete LStB', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, ANGESTELLT)
    lstb.seed({ userId: 'u', steuerjahr: 2025, bruttoarbeitslohn: '45000', lohnsteuer: null, sozialversicherung: null })

    const stand = await service.getState('u', 2025)

    expect(stand).toMatchObject({ kind: 'offen', fehlt: ['lohnsteuer', 'sozialversicherung'] })
  })

  it('does not estimate for married couples yet', async () => {
    const { lstb, interview, stammdaten, service } = setup()
    interview.seed('u', 2025, ANGESTELLT)
    lstb.seed({ userId: 'u', steuerjahr: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })
    await stammdaten.speichere('u', { familienstand: 'verheiratet' } as StammdatenRecord)

    const stand = await service.getState('u', 2025)

    expect(stand).toEqual({ kind: 'nicht-moeglich', grund: 'verheiratet' })
  })

  it('estimates a Grenzgänger from the Lohnausweis against the Quellensteuer', async () => {
    const { interview, ch, service } = setup()
    interview.seed('u', 2025, { ...ANGESTELLT, ausland: 'Ja, in die Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
    ch.seed({
      userId: 'u',
      steuerjahr: 2025,
      felder: { 'bruttolohn-total': '90000', 'ahv-beitraege': '6660', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as ChLohnausweisRecord['felder'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      wechselkursMonat: '2025-12',
      wechselkursKurs: 1.07,
      wechselkursModus: 'amtlich',
      wechselkursBelegId: null,
      nGre: { familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 4500, pkArbeitgeberChf: 4500 } as unknown as ChLohnausweisRecord['nGre'],
    })

    const stand = spanne(await service.getState('u', 2025))

    expect(stand.anrechnung).toBe(4334)
    expect(stand.ergebnis.bis).toBeLessThan(0)
  })

  it('names the missing Pensionskasse Obligatorium instead of guessing the Altersvorsorge', async () => {
    const { interview, ch, service } = setup()
    interview.seed('u', 2025, { ...ANGESTELLT, ausland: 'Ja, in die Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
    ch.seed({
      userId: 'u',
      steuerjahr: 2025,
      felder: { 'bruttolohn-total': '90000', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as ChLohnausweisRecord['felder'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      wechselkursMonat: '2025-12',
      wechselkursKurs: 1.07,
      wechselkursModus: 'amtlich',
      wechselkursBelegId: null,
      nGre: { pkArbeitnehmerChf: null } as ChLohnausweisRecord['nGre'],
    })

    const stand = await service.getState('u', 2025)

    expect(stand).toEqual({ kind: 'offen', fehlt: ['pk-obligatorium'] })
  })
})
