import { describe, expect, it } from 'vitest'
import {
  anlageVon,
  bestaetigeAnlage,
  entscheideSchreibung,
  fehlendeBestaetigungen,
  herkunftText,
  kennzeichnungsKey,
  nimmVorschlagAn,
  verwirfVorschlag,
  zerlegeKennzeichnungsKey,
  type Kennzeichnung,
} from './kennzeichnung'

const CLAUDE = { art: 'assistent', name: 'Claude' } as const

function unbestaetigt(key: string, wert: string | null): Kennzeichnung {
  return { key, herkunft: { art: 'uebernahme', vorjahr: 2024 }, bestaetigt: false, vorschlag: null, wert }
}

describe('kennzeichnungsKey / zerlegeKennzeichnungsKey', () => {
  it('builds field keys with and without an instance and parses them back', () => {
    expect(kennzeichnungsKey('lstb', 'bruttoarbeitslohn')).toBe('lstb.bruttoarbeitslohn')
    expect(kennzeichnungsKey('vermietung', 'mieteinnahmen', 'obj-1')).toBe('vermietung:obj-1.mieteinnahmen')
    expect(zerlegeKennzeichnungsKey('vermietung:obj-1.mieteinnahmen')).toEqual({ maske: 'vermietung', instanz: 'obj-1', feld: 'mieteinnahmen' })
    expect(zerlegeKennzeichnungsKey('lstb.lohnsteuer')).toEqual({ maske: 'lstb', instanz: null, feld: 'lohnsteuer' })
  })

  it('rejects an unknown mask or a key without a field instead of guessing', () => {
    expect(() => zerlegeKennzeichnungsKey('lstb')).toThrow()
    expect(() => zerlegeKennzeichnungsKey('gewerbe.gewinn')).toThrow()
  })
})

describe('anlageVon — every mask belongs to exactly one Anlage', () => {
  it.each([
    ['profil.steuerId', 'hauptvordruck'],
    ['stammdaten.iban', 'hauptvordruck'],
    ['kopplung.personB', 'hauptvordruck'],
    ['interview.kirchensteuer', 'hauptvordruck'],
    ['lstb.bruttoarbeitslohn', 'anlageN'],
    ['chLohnausweis.lohn', 'anlageNGre'],
    ['rente.jahresbetrag', 'anlageR'],
    ['kapital.kapitalertraege', 'anlageKap'],
    ['vermietung:o1.mieteinnahmen', 'anlageV'],
    ['kind:k1.vorname', 'anlageKind'],
  ])('%s → %s', (key, anlage) => {
    expect(anlageVon(key)).toBe(anlage)
  })
})

describe('entscheideSchreibung — der Nutzer gewinnt (ADR-0052 §7)', () => {
  it('a user write always writes and drops the marker (the value is now the user\'s)', () => {
    expect(entscheideSchreibung({ key: 'lstb.lohnsteuer', bestehend: unbestaetigt('lstb.lohnsteuer', '700'), aktuellerWert: '700', neuerWert: '650', herkunft: { art: 'nutzer' } })).toEqual({ art: 'schreiben', kennzeichnung: null })
  })

  it('a non-user write into an empty field writes and stays unconfirmed with its Herkunft', () => {
    expect(entscheideSchreibung({ key: 'lstb.lohnsteuer', bestehend: null, aktuellerWert: null, neuerWert: '700', herkunft: CLAUDE })).toEqual({
      art: 'schreiben',
      kennzeichnung: { key: 'lstb.lohnsteuer', herkunft: CLAUDE, bestaetigt: false, vorschlag: null, wert: '700' },
    })
  })

  it('a non-user write over a value the user typed becomes a proposal and never overwrites it', () => {
    expect(entscheideSchreibung({ key: 'lstb.bruttoarbeitslohn', bestehend: null, aktuellerWert: '4750', neuerWert: '4800', herkunft: CLAUDE })).toEqual({
      art: 'vorschlag',
      kennzeichnung: { key: 'lstb.bruttoarbeitslohn', herkunft: { art: 'nutzer' }, bestaetigt: true, wert: '4750', vorschlag: { wert: '4800', herkunft: CLAUDE } },
    })
  })

  it('a value the user marked "unklar" is the user\'s too — proposal, not overwrite', () => {
    expect(entscheideSchreibung({ key: 'lstb.lohnsteuer', bestehend: null, aktuellerWert: 'unklar', neuerWert: '700', herkunft: CLAUDE }).art).toBe('vorschlag')
  })

  it('a confirmed value is protected like a typed one; the newest proposal replaces the older', () => {
    const bestaetigt: Kennzeichnung = { ...unbestaetigt('rente.jahresbetrag', '12000'), bestaetigt: true, vorschlag: { wert: '12100', herkunft: CLAUDE } }
    const gemini = { art: 'assistent', name: 'Gemini' } as const
    expect(entscheideSchreibung({ key: 'rente.jahresbetrag', bestehend: bestaetigt, aktuellerWert: '12000', neuerWert: '12200', herkunft: gemini })).toEqual({
      art: 'vorschlag',
      kennzeichnung: { ...bestaetigt, vorschlag: { wert: '12200', herkunft: gemini } },
    })
  })

  it('an unconfirmed value from someone else is replaced (nobody has vouched for it yet)', () => {
    expect(entscheideSchreibung({ key: 'kapital.kapitalertraege', bestehend: unbestaetigt('kapital.kapitalertraege', '300'), aktuellerWert: '300', neuerWert: '320', herkunft: CLAUDE })).toEqual({
      art: 'schreiben',
      kennzeichnung: { key: 'kapital.kapitalertraege', herkunft: CLAUDE, bestaetigt: false, vorschlag: null, wert: '320' },
    })
  })

  it('writing what is already there changes nothing', () => {
    expect(entscheideSchreibung({ key: 'lstb.lohnsteuer', bestehend: null, aktuellerWert: '700', neuerWert: '700', herkunft: CLAUDE })).toEqual({ art: 'unveraendert' })
    expect(entscheideSchreibung({ key: 'lstb.lohnsteuer', bestehend: null, aktuellerWert: null, neuerWert: null, herkunft: CLAUDE })).toEqual({ art: 'unveraendert' })
  })
})

describe('bestaetigeAnlage / fehlendeBestaetigungen — unbestätigt wirkt wie offen', () => {
  const liste: Kennzeichnung[] = [
    unbestaetigt('lstb.bruttoarbeitslohn', '50000'),
    unbestaetigt('rente.jahresbetrag', '12000'),
    unbestaetigt('vermietung:o1.mieteinnahmen', '9000'),
  ]

  it('names every Anlage with an unconfirmed value once, in a stable order', () => {
    expect(fehlendeBestaetigungen(liste)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageR', 'unbestaetigt.anlageV'])
  })

  it('confirming one Anlage confirms all of its values and keeps their Herkunft', () => {
    const danach = bestaetigeAnlage(liste, 'anlageR')
    expect(danach.find((k) => k.key === 'rente.jahresbetrag')).toEqual({ ...liste[1], bestaetigt: true })
    expect(fehlendeBestaetigungen(danach)).toEqual(['unbestaetigt.anlageN', 'unbestaetigt.anlageV'])
  })

  it('an open proposal on a confirmed value does not block the printout', () => {
    const mitVorschlag: Kennzeichnung = { key: 'lstb.lohnsteuer', herkunft: { art: 'nutzer' }, bestaetigt: true, wert: '700', vorschlag: { wert: '720', herkunft: CLAUDE } }
    expect(fehlendeBestaetigungen([mitVorschlag])).toEqual([])
  })
})

describe('nimmVorschlagAn / verwirfVorschlag', () => {
  const mitVorschlag: Kennzeichnung = { key: 'lstb.bruttoarbeitslohn', herkunft: { art: 'nutzer' }, bestaetigt: true, wert: '4750', vorschlag: { wert: '4800', herkunft: CLAUDE } }

  it('accepting writes the proposed value as confirmed (the user chose it) with the proposer as Herkunft', () => {
    expect(nimmVorschlagAn(mitVorschlag)).toEqual({ key: 'lstb.bruttoarbeitslohn', herkunft: CLAUDE, bestaetigt: true, wert: '4800', vorschlag: null })
  })

  it('discarding a proposal on a user value leaves no marker behind', () => {
    expect(verwirfVorschlag(mitVorschlag)).toBeNull()
  })

  it('discarding a proposal on an unconfirmed value keeps the value unconfirmed', () => {
    const k: Kennzeichnung = { ...unbestaetigt('rente.jahresbetrag', '12000'), vorschlag: { wert: '1', herkunft: CLAUDE } }
    expect(verwirfVorschlag(k)).toEqual({ ...k, vorschlag: null })
  })

  it('there is nothing to accept without a proposal', () => {
    expect(() => nimmVorschlagAn({ ...mitVorschlag, vorschlag: null })).toThrow()
  })
})

describe('herkunftText — der Herkunfts-Chip', () => {
  it.each([
    [{ art: 'nutzer' } as const, 'Selbst eingetragen'],
    [{ art: 'uebernahme', vorjahr: 2024 } as const, 'Übernahme aus 2024'],
    [CLAUDE, 'Assistent: Claude'],
    [{ art: 'assistent', name: 'Claude', belegId: 'b1' } as const, 'Assistent: Claude, aus Beleg'],
    [{ art: 'beleg', belegId: 'b1' } as const, 'Aus Beleg'],
  ])('%j → %s', (herkunft, text) => {
    expect(herkunftText(herkunft)).toBe(text)
  })
})
