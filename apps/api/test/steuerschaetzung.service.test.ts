import { describe, expect, it } from 'vitest'
import type { CommuteInputs, CommuteRepository } from '../src/arbeitsweg/arbeitsweg.repository.js'
import type { CrossBorderSalaryStatementRecord } from '../src/ch-lohnausweis/ch-lohnausweis.repository.js'
import type { MasterDataRecord } from '../src/stammdaten/stammdaten.repository.js'
import { TaxEstimateService } from '../src/steuerschaetzung/steuerschaetzung.service.js'
import { FakeChLohnausweisRepository } from './fakes/fake-ch-lohnausweis.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeStammdatenRepository } from './fakes/fake-stammdaten.repository.js'
import { FakeKopplungRepository } from './fakes/fake-kopplung.repository.js'
import { FakeKindRepository } from './fakes/fake-kind.repository.js'
import { FakeVermietungRepository } from './fakes/fake-vermietung.repository.js'
import type { SteuerschaetzungStand } from '../src/steuerschaetzung/steuerschaetzung.service.js'

function spanne(stand: SteuerschaetzungStand) {
  if (stand.kind !== 'spanne') throw new Error(`expected a range, got ${stand.kind}`)
  return stand
}

function arbeitsweg(eingaben: CommuteInputs | null): CommuteRepository {
  return { findForUserAndYear: async () => eingaben, save: async (_u, _j, e) => e }
}

function setup(weg: CommuteInputs | null = null) {
  const lstb = new FakeLstbRepository()
  const interview = new FakeInterviewAnswerRepository()
  const ch = new FakeChLohnausweisRepository()
  const stammdaten = new FakeStammdatenRepository()
  const kopplung = new FakeKopplungRepository()
  const kinder = new FakeKindRepository()
  const vermietung = new FakeVermietungRepository()
  const service = new TaxEstimateService(lstb, interview, ch, stammdaten, arbeitsweg(weg), kopplung, kinder, vermietung)
  return { lstb, interview, ch, stammdaten, kopplung, kinder, vermietung, service }
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

  it('never estimates a married person as single — it asks for the joint return first (ADR-0054)', async () => {
    const { lstb, interview, service } = setup()
    interview.seed('u', 2025, { ...ANGESTELLT, familienstand: 'Verheiratet' })
    lstb.seed({ userId: 'u', steuerjahr: 2025, bruttoarbeitslohn: '45000', lohnsteuer: '6100', sozialversicherung: '9200' })

    expect(await service.getState('u', 2025)).toEqual({ kind: 'offen', fehlt: ['veranlagungsart'] })
  })

  it("estimates a couple with the splitting tariff from both spouses' certificates and the rental surplus", async () => {
    const { lstb, interview, stammdaten, kopplung, vermietung, service } = setup()
    interview.seed('a', 2025, ANGESTELLT)
    await stammdaten.speichere('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
    await kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', veranlagungsart: 'zusammen' })
    lstb.seed({ userId: 'a', steuerjahr: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
    lstb.seed({ userId: 'spouse_a_2025', steuerjahr: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '10420', sozialversicherung: '10008' })
    vermietung.seed({
      id: 'o1', userId: 'a', steuerjahr: 2025, mieteinnahmen: '14400', anschaffungskosten: '280000', baujahr: '1995', werbungskosten: '3200',
    } as never)

    const stand = spanne(await service.getState('a', 2025))
    expect(stand.zusammenveranlagung).toBe(true)
    expect(stand.anrechnung).toBe(9890 + 10420)
    const ohneMiete = spanne(await (async () => {
      const second = setup()
      second.interview.seed('a', 2025, ANGESTELLT)
      await second.stammdaten.speichere('a', { familienstand: 'verheiratet', religion: 'VD' } as MasterDataRecord)
      await second.kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', veranlagungsart: 'zusammen' })
      second.lstb.seed({ userId: 'a', steuerjahr: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
      second.lstb.seed({ userId: 'spouse_a_2025', steuerjahr: 2025, bruttoarbeitslohn: '48000', lohnsteuer: '10420', sozialversicherung: '10008' })
      return second.service.getState('a', 2025)
    })())
    // 14.400 rent − 3.200 costs − 5.600 AfA = 5.600 more income → more tax.
    expect(stand.einkommensteuer.von).toBeGreaterThan(ohneMiete.einkommensteuer.von)
  })

  it("names what is missing in Person B's figures", async () => {
    const { lstb, interview, stammdaten, kopplung, service } = setup()
    interview.seed('a', 2025, ANGESTELLT)
    await stammdaten.speichere('a', { familienstand: 'verheiratet' } as MasterDataRecord)
    await kopplung.upsert('a', 2025, { personBUserId: 'spouse_a_2025', veranlagungsart: 'zusammen' })
    lstb.seed({ userId: 'a', steuerjahr: 2025, bruttoarbeitslohn: '82000', lohnsteuer: '9890', sozialversicherung: '15473' })
    lstb.seed({ userId: 'spouse_a_2025', steuerjahr: 2025, bruttoarbeitslohn: '48000', lohnsteuer: null, sozialversicherung: '10008' } as never)

    const stand = await service.getState('a', 2025)
    expect(stand).toMatchObject({ kind: 'offen' })
    expect(stand.kind === 'offen' && stand.fehlt.some((f) => f.startsWith('personB.'))).toBe(true)
  })

  it('estimates a Grenzgänger from the Lohnausweis against the Quellensteuer', async () => {
    const { interview, ch, service } = setup()
    interview.seed('u', 2025, { ...ANGESTELLT, ausland: 'Ja, in die Schweiz', 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '0' })
    ch.seed({
      userId: 'u',
      steuerjahr: 2025,
      felder: { 'bruttolohn-total': '90000', 'ahv-beitraege': '6660', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as CrossBorderSalaryStatementRecord['felder'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      wechselkursMonat: '2025-12',
      wechselkursKurs: 1.07,
      wechselkursModus: 'amtlich',
      wechselkursBelegId: null,
      nGre: { familienzulagenChf: 0, krankentaggeldChf: 0, pkArbeitnehmerChf: 4500, pkArbeitgeberChf: 4500 } as unknown as CrossBorderSalaryStatementRecord['nGre'],
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
      felder: { 'bruttolohn-total': '90000', 'berufliche-vorsorge': '4500', quellensteuer: '4050' } as CrossBorderSalaryStatementRecord['felder'],
      bemerkungen: null,
      saeule3aChf: null,
      krankenkasseChf: null,
      wechselkursMonat: '2025-12',
      wechselkursKurs: 1.07,
      wechselkursModus: 'amtlich',
      wechselkursBelegId: null,
      nGre: { pkArbeitnehmerChf: null } as CrossBorderSalaryStatementRecord['nGre'],
    })

    const stand = await service.getState('u', 2025)

    expect(stand).toEqual({ kind: 'offen', fehlt: ['pk-obligatorium'] })
  })
})
