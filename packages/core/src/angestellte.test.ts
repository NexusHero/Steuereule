import { describe, expect, it } from 'vitest'
import { angestellteAusAntworten, angestellteAusDaten, angestelltenStand, type AngestellteEingaben } from './angestellte'
import { ENTRIES, entryForStep, isReachableFor, nextStepFor, remainingStepsFor, type Answers } from './interview'
import { LEERES_LSTB, type LstbDaten } from './lstb'

const EINGABEN: AngestellteEingaben = {
  einnahmen: 50000,
  werbungskosten: 1200,
  sonderausgaben: 3000,
  offenePosten: 0,
  konflikte: 0,
  gegated: [],
}

describe('angestellteAusAntworten — the catalogue answers feed the Rechenkern', () => {
  it('empty answers parse to all-zero figures', () => {
    expect(angestellteAusAntworten({})).toEqual({
      nebenjobBrutto: 0,
      umzugKosten: 0,
      spenden: 0,
      kvPvBeitraege: 0,
      riester: 0,
      dhfMiete: 0,
      abfindungBetrag: 0,
      lohnersatzBetrag: 0,
    })
  })

  it('"Ja" opens the integer follow-up, "Nein" closes it', () => {
    const answers: Answers = {
      umzug: 'Ja',
      'umzug-kosten': '800',
      spenden: 'Nein',
      dhf: 'Ja',
      'dhf-miete': '650',
      abfindung: 'Ja',
      'abfindung-betrag': '20000',
      lohnersatz: 'Ja',
      'lohnersatz-betrag': '4000',
    }
    expect(angestellteAusAntworten(answers)).toEqual({
      nebenjobBrutto: 0,
      umzugKosten: 800,
      spenden: 0,
      kvPvBeitraege: 0,
      riester: 0,
      dhfMiete: 650,
      abfindungBetrag: 20000,
      lohnersatzBetrag: 4000,
    })
  })

  it('Minijob carries no amount (steuerfrei), Midijob/Nebenjob read the Brutto', () => {
    expect(angestellteAusAntworten({ nebenjob: 'Minijob', 'nebenjob-brutto': '500' }).nebenjobBrutto).toBe(0)
    expect(angestellteAusAntworten({ nebenjob: 'Nebenjob', 'nebenjob-brutto': '6000' }).nebenjobBrutto).toBe(6000)
  })
})

describe('angestelltenStand — the deterministic fold', () => {
  it('nothing open/conflicting/gated → bestimmt, einkuenfte = einnahmen − werbungskosten', () => {
    expect(angestelltenStand(EINGABEN)).toEqual({
      kind: 'bestimmt',
      einnahmen: 50000,
      werbungskosten: 1200,
      sonderausgaben: 3000,
      einkuenfte: 48800,
    })
  })

  it('sonderausgaben are reported, never subtracted (the aggregation is a later slice)', () => {
    const r = angestelltenStand(EINGABEN)
    expect(r.kind === 'bestimmt' ? r.einkuenfte : 0).toBe(48800) // 50000 − 1200, NOT − 3000
  })

  it('open inputs → offen, naming the count', () => {
    const r = angestelltenStand({ ...EINGABEN, offenePosten: 2 })
    expect(r.kind).toBe('offen')
    expect((r as { offenePosten: number }).offenePosten).toBe(2)
  })

  it('a gated Einkunftsart → offen, naming it', () => {
    const r = angestelltenStand({ ...EINGABEN, gegated: ['Gewerbe'] })
    expect(r).toMatchObject({ kind: 'offen', gegated: ['Gewerbe'] })
  })

  it('werbungskosten exceeding einnahmen floors einkuenfte at 0, never negative', () => {
    const r = angestelltenStand({ ...EINGABEN, werbungskosten: 99999 })
    expect(r.kind === 'bestimmt' ? r.einkuenfte : null).toBe(0)
  })

  it('rejects negative or non-integer inputs', () => {
    expect(() => angestelltenStand({ ...EINGABEN, einnahmen: -1 })).toThrow(RangeError)
    expect(() => angestelltenStand({ ...EINGABEN, sonderausgaben: 1.5 })).toThrow(RangeError)
  })
})

describe('angestellteAusDaten — the ONE fold shared by Cockpit API + Plausibilitäts-Screen (ticket 15 review F2)', () => {
  const VOLLSTAENDIG: LstbDaten = {
    bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
    lohnsteuer: { kind: 'erfasst', wert: 8000 },
    sozialversicherung: { kind: 'erfasst', wert: 9000 },
  }

  it('empty answers + empty LStB fold to all-zero facts, nothing gated', () => {
    expect(angestellteAusDaten(LEERES_LSTB, {})).toEqual({
      einnahmen: 0,
      werbungskosten: 0,
      sonderausgaben: 0,
      offenePosten: 0,
      konflikte: 0,
      gegated: [],
      erfasstNichtGerechnet: 0,
    })
  })

  it('sums LStB Brutto (Angestellte vertical only) + declared Nebenjob-Brutto', () => {
    expect(angestellteAusDaten(VOLLSTAENDIG, { job: 'Angestellt', nebenjob: 'Nebenjob', 'nebenjob-brutto': '4000' }).einnahmen).toBe(54000)
    // A pensioner has no LStB to transcribe, so the (present) LStB must not fold into income.
    expect(angestellteAusDaten(VOLLSTAENDIG, { job: 'Rente' }).einnahmen).toBe(0)
  })

  it('counts open LStB fields only for the Angestellte vertical', () => {
    const offen: LstbDaten = { bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 }, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' } }
    expect(angestellteAusDaten(offen, { job: 'Angestellt' }).offenePosten).toBe(2)
    expect(angestellteAusDaten(offen, { job: 'Rente' }).offenePosten).toBe(0)
  })

  it('counts a declared Nebenjob without Brutto as an open Posten (never Minijob)', () => {
    expect(angestellteAusDaten(VOLLSTAENDIG, { job: 'Angestellt', nebenjob: 'Nebenjob' }).offenePosten).toBe(1)
    expect(angestellteAusDaten(VOLLSTAENDIG, { job: 'Angestellt', nebenjob: 'Minijob' }).offenePosten).toBe(0)
  })

  it('counts an LStB widerspruch as a conflict (ADR-008)', () => {
    const widerspruch: LstbDaten = { bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 }, lohnsteuer: { kind: 'erfasst', wert: 60000 }, sozialversicherung: { kind: 'erfasst', wert: 0 } }
    expect(angestellteAusDaten(widerspruch, { job: 'Angestellt' }).konflikte).toBe(1)
  })

  it('names a gated Einkunftsart and sums the captured-but-not-folded amounts', () => {
    const fakten = angestellteAusDaten(VOLLSTAENDIG, {
      job: 'Beides',
      dhf: 'Ja',
      'dhf-miete': '650',
      abfindung: 'Ja',
      'abfindung-betrag': '20000',
      lohnersatz: 'Ja',
      'lohnersatz-betrag': '4000',
    })
    expect(fakten.gegated).toEqual(['Gewerbe'])
    expect(fakten.erfasstNichtGerechnet).toBe(650 + 20000 + 4000)
  })
})

describe('Lebenslagen/Sonderausgaben catalogue entries — one walker, one registry (ADR-0031 §3)', () => {
  it('entryForStep derives the owning entry for every new step id', () => {
    expect(entryForStep('dhf')).toBe('lebenslagen')
    expect(entryForStep('dhf-miete')).toBe('lebenslagen')
    expect(entryForStep('nebenjob-brutto')).toBe('lebenslagen')
    expect(entryForStep('spenden')).toBe('sonderausgaben')
    expect(entryForStep('riester-betrag')).toBe('sonderausgaben')
  })

  it('the Lebenslagen entry walks its top-level questions, opening the integer follow-up on "Ja"', () => {
    const entry = ENTRIES.lebenslagen
    expect(nextStepFor(entry, {})).toEqual({ kind: 'question', id: 'dhf' })
    expect(nextStepFor(entry, { dhf: 'Ja' })).toEqual({ kind: 'question', id: 'dhf-miete' })
    expect(nextStepFor(entry, { dhf: 'Ja', 'dhf-miete': '650' })).toEqual({ kind: 'question', id: 'umzug' })
    expect(nextStepFor(entry, { dhf: 'Nein' })).toEqual({ kind: 'question', id: 'umzug' })
  })

  it('the Sonderausgaben entry walks its three top-level questions', () => {
    const entry = ENTRIES.sonderausgaben
    expect(nextStepFor(entry, {})).toEqual({ kind: 'question', id: 'spenden' })
    expect(nextStepFor(entry, { spenden: 'Ja' })).toEqual({ kind: 'question', id: 'spenden-betrag' })
    expect(remainingStepsFor(entry, {})).toBe(3)
    expect(remainingStepsFor(entry, { spenden: 'Ja' })).toBe(3) // the amount follow-up is the open one
  })

  it('isReachableFor admits a follow-up only after its "Ja" answer (server-side admission, REQ-015 pattern)', () => {
    const entry = ENTRIES.sonderausgaben
    expect(isReachableFor(entry, {}, 'spenden-betrag')).toBe(false)
    expect(isReachableFor(entry, { spenden: 'Ja' }, 'spenden-betrag')).toBe(true)
  })

  it('nebenjob only opens the Brutto follow-up for Midijob/Nebenjob, not Minijob/Nein', () => {
    const entry = ENTRIES.lebenslagen
    const prefix = { dhf: 'Nein', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein' } as Answers
    expect(nextStepFor(entry, prefix)).toEqual({ kind: 'question', id: 'nebenjob' })
    expect(nextStepFor(entry, { ...prefix, nebenjob: 'Minijob' })).toEqual({ kind: 'done' })
    expect(nextStepFor(entry, { ...prefix, nebenjob: 'Nebenjob' })).toEqual({ kind: 'question', id: 'nebenjob-brutto' })
  })
})
