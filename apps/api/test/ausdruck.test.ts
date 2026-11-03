// ADR-0050 — the Formular-Ausdruck: field values from stored facts, and the renderer
// against the real checked-in templates. Positions come from felder-2025.json, measured
// by scripts/vordrucke/vermessen.mjs — never typed by hand.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { deutschesDatum } from '@steuereule/core'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { ausdruckWerte, type AusdruckFakten } from '../src/ausdruck/ausdruck-werte.js'
import felder2025 from '../src/ausdruck/felder-2025.json' with { type: 'json' }
import manifest from '../src/ausdruck/vordrucke-2025.json' with { type: 'json' }
import { FELDSAETZE, rendereVordrucke, UeberlaufFehler } from '../src/ausdruck/vordruck-renderer.js'

const VORLAGEN = new URL('../assets/vordrucke/2025/', import.meta.url)

const FAKTEN: AusdruckFakten = {
  steuerjahr: 2025,
  profil: { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' },
  stammdaten: {
    geburtsdatum: '1990-04-12',
    strasse: 'Musterstraße',
    hausnummer: '12',
    hausnummerZusatz: null,
    plz: '01067',
    wohnort: 'Dresden',
    beruf: 'Ingenieurin',
    religion: 'VD',
    familienstand: 'geschieden',
    familienstandSeit: '2018-06-01',
    iban: 'DE89370400440532013000',
    kontoinhaber: null,
    finanzamt: 'Dresden-Nord',
    telefon: null,
  },
  bruttoarbeitslohn: '42000',
}

describe('ausdruckWerte', () => {
  it('fills page 1 and the Bankverbindung from profile and Stammdaten, nothing missing', () => {
    const { werte, fehlend } = ausdruckWerte(FAKTEN)
    expect(fehlend).toEqual([])
    expect(werte).toMatchObject({
      'est1a.einkommensteuererklaerung': true,
      'est1a.idnr': '02476291358',
      'est1a.geburtsdatum': '12.04.1990',
      'est1a.geschiedenSeit': '01.06.2018',
      // "DE" is pre-printed in the domestic IBAN box.
      'est1a.ibanInland': '89370400440532013000',
      'est1a.kontoinhaberSelbst': true,
      'est1a.kopfSeite2': '2010304050, Beispiel, Anna',
      'anlN.kz110': '42000',
    })
    // Empty stays empty (BMF: no dashes, no zeros in unused fields).
    expect(werte['est1a.hausnummerZusatz']).toBeUndefined()
    expect(werte['est1a.telefon']).toBeUndefined()
  })

  it('a foreign IBAN goes to the foreign line, an other account holder by name', () => {
    const { werte } = ausdruckWerte({
      ...FAKTEN,
      stammdaten: { ...FAKTEN.stammdaten!, iban: 'CH9300762011623852957', kontoinhaber: 'Max Beispiel' },
    })
    expect(werte['est1a.ibanAusland']).toBe('CH9300762011623852957')
    expect(werte['est1a.ibanInland']).toBeUndefined()
    expect(werte['est1a.kontoinhaberName']).toBe('Max Beispiel')
    expect(werte['est1a.kontoinhaberSelbst']).toBeUndefined()
  })

  it('no usable LStB figure: no Anlage N entries at all (a form without entries is not handed in)', () => {
    const { werte } = ausdruckWerte({ ...FAKTEN, bruttoarbeitslohn: 'unklar' })
    expect(Object.keys(werte).filter((id) => id.startsWith('anlN.'))).toEqual([])
  })

  it('names everything the Hauptvordruck still needs', () => {
    const { fehlend } = ausdruckWerte({ ...FAKTEN, profil: { ...FAKTEN.profil, steuerId: null }, stammdaten: null })
    expect(fehlend).toEqual(['steuerId', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'])
  })

  it('married: waits for the Veranlagungsart and Person B instead of deciding Einzelveranlagung silently', () => {
    const { fehlend } = ausdruckWerte({ ...FAKTEN, stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet' } })
    expect(fehlend).toEqual(['ehegatte'])
  })

  it('a gesetzliche Rente goes to Anlage R Zeile 4 (Kz 101), a private one to Zeile 13 (Kz 131)', () => {
    const gesetzlich = ausdruckWerte({ ...FAKTEN, rente: { rentenart: 'GesetzlicheRente', jahresbetrag: '14400' } }).werte
    expect(gesetzlich).toMatchObject({ 'anlR.kz101': '14400', 'anlR.personA': true, 'anlR.lfdNr': '1', 'anlR.name': 'Beispiel' })
    expect(gesetzlich['anlR.kz131']).toBeUndefined()

    const privat = ausdruckWerte({ ...FAKTEN, rente: { rentenart: 'PrivateRentenversicherung', jahresbetrag: '2400' } }).werte
    expect(privat['anlR.kz131']).toBe('2400')
    expect(privat['anlR.kz101']).toBeUndefined()
  })

  it('a pension that belongs on another Vordruck (bAV, ausländisch) blocks instead of being dropped', () => {
    expect(ausdruckWerte({ ...FAKTEN, rente: { rentenart: 'Betriebsrente', jahresbetrag: '3000' } }).fehlend).toEqual([
      'anlageRAvBav',
    ])
    expect(ausdruckWerte({ ...FAKTEN, rente: { rentenart: 'AuslaendischeRente', jahresbetrag: '3000' } }).fehlend).toEqual([
      'anlageRAus',
    ])
  })

  it('formats dates with points, as the form asks', () => {
    expect(deutschesDatum('2025-12-31')).toBe('31.12.2025')
  })

  it('married with zusammenveranlagung fills Person B fields and checks completeness', () => {
    const { werte, instanzen, fehlend } = ausdruckWerte({
      ...FAKTEN,
      stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet', familienstandSeit: '2020-05-15' },
      kopplung: {
        veranlagungsart: 'zusammen',
        personB: {
          firstName: 'Bernd',
          lastName: 'Beispiel',
          steuerId: '12345678902',
          geburtsdatum: '1988-11-20',
          religion: 'VD',
          beruf: 'Lehrer',
          bruttoarbeitslohn: '54000',
        },
      },
    })
    expect(fehlend).toEqual([])
    expect(werte).toMatchObject({
      'est1a.zusammenveranlagung': true,
      'est1a.verheiratetSeit': '15.05.2020',
      'est1a.nameB': 'Beispiel',
      'est1a.vornameB': 'Bernd',
      'est1a.idnrB': '12345678902',
      'est1a.geburtsdatumB': '20.11.1988',
      'est1a.religionB': 'VD',
      'est1a.berufB': 'Lehrer',
    })
    expect(instanzen?.['anlage-n']).toEqual([
      { 'anlN.kz110': '42000', 'anlN.personA': true, 'anlN.name': 'Beispiel', 'anlN.vorname': 'Anna', 'anlN.steuernummer': '2010304050' },
      { 'anlN.kz110': '54000', 'anlN.personB': true, 'anlN.name': 'Beispiel', 'anlN.vorname': 'Bernd', 'anlN.steuernummer': '2010304050' },
    ])
  })

  it('married with einzelveranlagung sets einzelveranlagung box without requiring Person B', () => {
    const { werte, fehlend } = ausdruckWerte({
      ...FAKTEN,
      stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet', familienstandSeit: '2020-05-15' },
      kopplung: { veranlagungsart: 'einzel' },
    })
    expect(fehlend).toEqual([])
    expect(werte['est1a.einzelveranlagung']).toBe(true)
    expect(werte['est1a.zusammenveranlagung']).toBeUndefined()
  })

  it('fills Anlage KAP, Anlage N-Gre, Anlage Sonderausgaben and AV', () => {
    const { werte } = ausdruckWerte({
      ...FAKTEN,
      kapital: { kapitalertraege: '1500', abzugssteuer: '375' },
      chLohnausweis: { bruttolohnEur: '65000', abzugssteuerEur: '2900' },
      sonderausgaben: { spenden: '450' },
      riester: { art: 'Unmittelbar', einnahmenVorjahr: '48000' },
    })
    expect(werte).toMatchObject({
      'anlKap.personA': true,
      'anlKap.name': 'Beispiel',
      'anlKap.vorname': 'Anna',
      'anlKap.kz210': '1500',
      'anlKap.kz234': '375',
      'anlNGre.personA': true,
      'anlNGre.name': 'Beispiel',
      'anlNGre.bruttolohnEur': '65000',
      'anlNGre.abzugssteuer': '2900',
      'anlSo.spenden': '450',
      'anlAv.unmittelbar': '1',
      'anlAv.kz100': '48000',
    })
  })

  it('Anlage AV: mittelbar writes 2 in Zeile 14 and needs no earnings; a direct claim without them blocks', () => {
    const mittelbar = ausdruckWerte({ ...FAKTEN, riester: { art: 'Mittelbar', einnahmenVorjahr: null } })
    expect(mittelbar.werte['anlAv.mittelbar']).toBe('2')
    expect(mittelbar.werte['anlAv.unmittelbar']).toBeUndefined()
    expect(mittelbar.fehlend).toEqual([])

    expect(ausdruckWerte({ ...FAKTEN, riester: { art: 'Unmittelbar', einnahmenVorjahr: null } }).fehlend).toEqual(['riester'])
    expect(ausdruckWerte({ ...FAKTEN, riester: { art: null, einnahmenVorjahr: null } }).fehlend).toEqual(['riester'])
    expect(Object.keys(ausdruckWerte({ ...FAKTEN, riester: { art: null, einnahmenVorjahr: null } }).werte).some((id) => id.startsWith('anlAv.'))).toBe(false)
  })

  it('writes nothing onto Anlage Vorsorgeaufwand: its employee lines are ⓔ-Zeilen the Finanzamt already has', () => {
    const { werte } = ausdruckWerte(FAKTEN)
    expect(Object.keys(werte).filter((id) => id.startsWith('anlVor.'))).toEqual([])
  })

  describe('Anlage Kind', () => {
    const ZUSAMMEN: AusdruckFakten = {
      ...FAKTEN,
      stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet', familienstandSeit: '2015-05-15' },
      kopplung: {
        veranlagungsart: 'zusammen',
        personB: { firstName: 'Bernd', lastName: 'Beispiel', steuerId: '12345678902', geburtsdatum: '1988-11-20', religion: 'VD', beruf: 'Lehrer' },
      },
    }
    const KIND = {
      vorname: 'Lina',
      nachname: 'Beispiel',
      geburtsdatum: '2016-03-10',
      idnr: '11111111111',
      kindergeldAnspruchEur: '3060',
      kindschaftsverhaeltnis: '1',
      kindschaftsverhaeltnisB: '1',
      familienkasse: 'Familienkasse Sachsen',
      wohnsitzInlandGanzjaehrig: true,
    }

    it('prints Familienkasse, Wohnsitz im Inland and both Kindschaftsverhältnisse (Zeilen 7, 8, 10)', () => {
      const { instanzen, fehlend } = ausdruckWerte({ ...ZUSAMMEN, kinder: [KIND] })
      expect(fehlend).toEqual([])
      expect(instanzen!['anlage-kind']![0]).toMatchObject({
        'anlKind.idnr': '11111111111',
        'anlKind.vorname': 'Lina',
        'anlKind.familienkasse': 'Familienkasse Sachsen',
        'anlKind.inlandVon': '01.01.2025',
        'anlKind.inlandBis': '31.12.2025',
        'anlKind.kz02': '1',
        'anlKind.kz03': '1',
      })
      expect(instanzen!['anlage-kind']![0]!['anlKind.nachname']).toBeUndefined()
    })

    it('a different family name is printed; a child born in the year lives here from its birth', () => {
      const { instanzen } = ausdruckWerte({ ...ZUSAMMEN, kinder: [{ ...KIND, nachname: 'Muster', geburtsdatum: '2025-08-04' }] })
      expect(instanzen!['anlage-kind']![0]).toMatchObject({ 'anlKind.nachname': 'Muster', 'anlKind.inlandVon': '04.08.2025' })
    })

    it('missing details block the printout as "kinder"', () => {
      for (const luecke of [{ idnr: null }, { kindschaftsverhaeltnis: null }, { familienkasse: null }, { wohnsitzInlandGanzjaehrig: null }]) {
        expect(ausdruckWerte({ ...ZUSAMMEN, kinder: [{ ...KIND, ...luecke }] }).fehlend).toEqual(['kinder'])
      }
    })

    it('cases the printout cannot cover yet are named, never printed half', () => {
      expect(ausdruckWerte({ ...ZUSAMMEN, kinder: [{ ...KIND, wohnsitzInlandGanzjaehrig: false }] }).fehlend).toEqual(['anlageKindAusland'])
      expect(ausdruckWerte({ ...ZUSAMMEN, kinder: [{ ...KIND, geburtsdatum: '2007-02-01' }] }).fehlend).toEqual(['anlageKindVolljaehrig'])
      expect(ausdruckWerte({ ...ZUSAMMEN, kinder: [KIND, { ...KIND, wohnsitzInlandGanzjaehrig: false }, { ...KIND, wohnsitzInlandGanzjaehrig: false }] }).fehlend).toEqual(['anlageKindAusland'])
    })
  })

  describe('Anlage Kind — the other parent outside this return (Zeilen 11–15)', () => {
    const KIND_ALLEIN = {
      vorname: 'Lina',
      nachname: 'Beispiel',
      geburtsdatum: '2016-03-10',
      idnr: '11111111111',
      kindergeldAnspruchEur: '3060',
      kindschaftsverhaeltnis: '1',
      kindschaftsverhaeltnisB: null,
      familienkasse: 'Familienkasse Sachsen',
      wohnsitzInlandGanzjaehrig: true,
      andererElternteil: 'Inland',
      andererElternteilName: 'Muster, Max',
      andererElternteilGeburtsdatum: '1984-02-11',
      andererElternteilAdresse: 'Hauptstraße 3, 01067 Dresden',
      andererElternteilArt: '1',
      andererElternteilVerstorbenAm: null,
    }
    const anlage = (fakten: AusdruckFakten) => ausdruckWerte(fakten).instanzen!['anlage-kind']![0]!

    it('a single parent prints the other parent with the year as the relationship period', () => {
      expect(ausdruckWerte({ ...FAKTEN, kinder: [KIND_ALLEIN] }).fehlend).toEqual([])
      expect(anlage({ ...FAKTEN, kinder: [KIND_ALLEIN] })).toMatchObject({
        'anlKind.aeName': 'Muster, Max',
        'anlKind.aeGeburtsdatum': '11.02.1984',
        'anlKind.aeVon': '01.01.2025',
        'anlKind.aeBis': '31.12.2025',
        'anlKind.aeAdresse': 'Hauptstraße 3, 01067 Dresden',
        'anlKind.aeArt': '1',
      })
    })

    it('a deceased parent ends the period at the date of death (Zeile 14, Kz 06)', () => {
      const werte = anlage({ ...FAKTEN, kinder: [{ ...KIND_ALLEIN, andererElternteil: 'Verstorben', andererElternteilVerstorbenAm: '2025-06-30' }] })
      expect(werte).toMatchObject({ 'anlKind.kz06': '30.06.2025', 'anlKind.aeBis': '30.06.2025' })
    })

    it('a parent who cannot be ascertained is Zeile 15 alone (Kz 05 = 1)', () => {
      const fakten = { ...FAKTEN, kinder: [{ ...KIND_ALLEIN, andererElternteil: 'Unbekannt', andererElternteilName: null, andererElternteilGeburtsdatum: null, andererElternteilAdresse: null, andererElternteilArt: null }] }
      expect(ausdruckWerte(fakten).fehlend).toEqual([])
      expect(anlage(fakten)['anlKind.kz05']).toBe('1')
      expect(anlage(fakten)['anlKind.aeName']).toBeUndefined()
    })

    it('missing details block as "kinder"; a parent abroad (Zeile 13) is named as not printable yet', () => {
      expect(ausdruckWerte({ ...FAKTEN, kinder: [{ ...KIND_ALLEIN, andererElternteil: null }] }).fehlend).toEqual(['kinder'])
      expect(ausdruckWerte({ ...FAKTEN, kinder: [{ ...KIND_ALLEIN, andererElternteilAdresse: null }] }).fehlend).toEqual(['kinder'])
      expect(ausdruckWerte({ ...FAKTEN, kinder: [{ ...KIND_ALLEIN, andererElternteil: 'Verstorben' }] }).fehlend).toEqual(['kinder'])
      expect(ausdruckWerte({ ...FAKTEN, kinder: [{ ...KIND_ALLEIN, andererElternteil: 'Ausland' }] }).fehlend).toEqual(['anlageKindAndererElternteilAusland'])
    })

    it('in a joint return where both are parents, the other-parent lines stay empty', () => {
      const zusammen: AusdruckFakten = {
        ...FAKTEN,
        stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet', familienstandSeit: '2015-05-15' },
        kopplung: { veranlagungsart: 'zusammen', personB: { firstName: 'Bernd', lastName: 'Beispiel', steuerId: '12345678902', geburtsdatum: '1988-11-20', religion: 'VD', beruf: 'Lehrer' } },
        kinder: [{ ...KIND_ALLEIN, kindschaftsverhaeltnisB: '1' }],
      }
      expect(Object.keys(anlage(zusammen)).filter((id) => id.startsWith('anlKind.ae'))).toEqual([])
    })
  })

  describe('Entlastungsbetrag für Alleinerziehende (Anlage Kind Zeilen 45–48)', () => {
    const KIND = {
      vorname: 'Lina',
      nachname: 'Beispiel',
      geburtsdatum: '2016-03-10',
      idnr: '11111111111',
      kindschaftsverhaeltnis: '1',
      familienkasse: 'Familienkasse Sachsen',
      wohnsitzInlandGanzjaehrig: true,
      andererElternteil: 'Unbekannt',
      gemeldetBeiMirGanzjaehrig: true,
      kindergeldAnMichGanzjaehrig: true,
    }
    const ALLEIN: AusdruckFakten = { ...FAKTEN, alleinerziehend: { weiterePerson: 'Nein', haushaltsgemeinschaft: 'Nein' } }
    const ae = (fakten: AusdruckFakten) => {
      const werte = ausdruckWerte(fakten).instanzen!['anlage-kind']![0]!
      return Object.fromEntries(Object.entries(werte).filter(([id]) => /anlKind\.kz4[2469]/.test(id)))
    }

    it('claims it for the year when the child lived and got Kindergeld with a single parent alone', () => {
      expect(ae({ ...ALLEIN, kinder: [KIND] })).toEqual({
        'anlKind.kz42Von': '01.01.2025',
        'anlKind.kz42Bis': '31.12.2025',
        'anlKind.kz44Von': '01.01.2025',
        'anlKind.kz44Bis': '31.12.2025',
        'anlKind.kz46': '2',
        'anlKind.kz49': '2',
      })
      expect(ae({ ...ALLEIN, kinder: [{ ...KIND, geburtsdatum: '2025-05-02' }] })['anlKind.kz42Von']).toBe('02.05.2025')
    })

    it('claims nothing when a condition fails or is unanswered — never a guessed period', () => {
      expect(ae({ ...ALLEIN, alleinerziehend: { weiterePerson: 'Ja', haushaltsgemeinschaft: 'Nein' }, kinder: [KIND] })).toEqual({})
      expect(ae({ ...ALLEIN, alleinerziehend: { weiterePerson: 'Nein', haushaltsgemeinschaft: null }, kinder: [KIND] })).toEqual({})
      expect(ae({ ...FAKTEN, kinder: [KIND] })).toEqual({})
      expect(ae({ ...ALLEIN, kinder: [{ ...KIND, kindergeldAnMichGanzjaehrig: false }] })).toEqual({})
      const verheiratet = { ...ALLEIN, stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet' }, kopplung: { veranlagungsart: 'einzel' as const } }
      expect(ae({ ...verheiratet, kinder: [KIND] })).toEqual({})
    })
  })

  it('creates multi-instance values for children and rental properties', () => {
    const res = ausdruckWerte({
      ...FAKTEN,
      kinder: [
        { lfdNr: '1', vorname: 'Lina', nachname: 'Beispiel', geburtsdatum: '2015-03-10', idnr: '11111111111', kindergeldAnspruchEur: '3000' },
        { lfdNr: '2', vorname: 'Noah', nachname: 'Beispiel', geburtsdatum: '2018-07-22', idnr: '22222222222', kindergeldAnspruchEur: '3000' },
      ],
      vermietung: [
        {
          lfdNr: '1',
          strasse: 'Schulstraße 4',
          plz: '01067',
          ort: 'Dresden',
          wohnflaeche: '75',
          mieteinnahmen: '9600',
          anschaffungskosten: '150000',
          baujahr: '1995',
          werbungskosten: '1200',
          afaWieVorjahr: true,
        },
      ],
    })
    expect(res.instanzen).toBeDefined()
    const instanzen = res.instanzen!
    expect(instanzen['anlage-kind']).toHaveLength(2)
    expect(instanzen['anlage-kind']![0]).toMatchObject({
      'anlKind.vorname': 'Lina',
      'anlKind.geburtsdatum': '10.03.2015',
      'anlKind.idnr': '11111111111',
      'anlKind.kindergeld': '3000',
      'anlKind.lfdNr': '1',
    })
    expect(instanzen['anlage-kind']![1]).toMatchObject({
      'anlKind.vorname': 'Noah',
      'anlKind.geburtsdatum': '22.07.2018',
      'anlKind.idnr': '22222222222',
      'anlKind.kindergeld': '3000',
      'anlKind.lfdNr': '2',
    })
    expect(instanzen['anlage-v']).toHaveLength(1)
    expect(instanzen['anlage-v']![0]).toMatchObject({
      'anlV.strasse': 'Schulstraße 4',
      'anlV.plz': '01067',
      'anlV.ort': 'Dresden',
      'anlV.wohnflaeche': '75',
      'anlV.z13Miete': '9600',
    })
  })

  describe('Anlage V', () => {
    const OBJEKT = {
      strasse: 'Schulstraße 4',
      plz: '01067',
      ort: 'Dresden',
      wohnflaeche: '75',
      mieteinnahmen: '9600',
      anschaffungskosten: '150000',
      baujahr: '1995',
      werbungskosten: '1200',
      afaWieVorjahr: true,
    }
    const v = (objekt: Partial<typeof OBJEKT> & Record<string, unknown>) =>
      ausdruckWerte({ ...FAKTEN, vermietung: [{ ...OBJEKT, ...objekt } as never] })

    it('rents go into the amount column of Zeile 13 and the sums, never a text box', () => {
      expect(v({}).instanzen!['anlage-v']![0]).toMatchObject({
        'anlV.z13Wohnflaeche': '75',
        'anlV.z13Miete': '9600',
        'anlV.kz01': '9600',
        'anlV.z32Einnahmen': '9600',
      })
    })

    it('the AfA fills Zeile 33 (linear, rate, wie Vorjahr, amount) and Kz 30', () => {
      expect(v({}).instanzen!['anlage-v']![0]).toMatchObject({
        'anlV.z33Linear': '1',
        'anlV.z33Satz': '2',
        'anlV.z33WieVorjahr': '1',
        'anlV.z33Afa': '3000',
        'anlV.kz30': '3000',
      })
      expect(v({ baujahr: '1910', anschaffungskosten: '100000' }).instanzen!['anlage-v']![0]!['anlV.z33Satz']).toBe('2,5')
    })

    it('the sum of Werbungskosten includes the AfA; Zeilen 85/86 always carry the result', () => {
      expect(v({}).instanzen!['anlage-v']![0]).toMatchObject({
        'anlV.z80Text': 'Laufende Werbungskosten',
        'anlV.z80Betrag': '1200',
        'anlV.kz49': '1200',
        'anlV.werbungskostenSumme': '4200',
        'anlV.ueberschuss': '5400',
        'anlV.kz20': '5400',
      })
      expect(v({ mieteinnahmen: '2000' }).instanzen!['anlage-v']![0]).toMatchObject({ 'anlV.ueberschuss': '-2200', 'anlV.kz20': '-2200' })
    })

    it('without building data there is no AfA line, and no "wie Vorjahr" question', () => {
      const res = v({ anschaffungskosten: null as never, baujahr: null as never, afaWieVorjahr: null as never })
      expect(res.fehlend).toEqual([])
      expect(Object.keys(res.instanzen!['anlage-v']![0]!).filter((id) => id.startsWith('anlV.z33'))).toEqual([])
      expect(res.instanzen!['anlage-v']![0]!['anlV.werbungskostenSumme']).toBe('1200')
    })

    it('missing or unreadable facts block as "vermietung"; a changed AfA is named as not printable yet', () => {
      expect(v({ mieteinnahmen: null as never }).fehlend).toEqual(['vermietung'])
      expect(v({ werbungskosten: null as never }).fehlend).toEqual(['vermietung'])
      expect(v({ baujahr: 'unklar' }).fehlend).toEqual(['vermietung'])
      expect(v({ ort: null as never }).fehlend).toEqual(['vermietung'])
      expect(v({ afaWieVorjahr: null as never }).fehlend).toEqual(['vermietung'])
      expect(v({ afaWieVorjahr: false }).fehlend).toEqual(['anlageVAfaNeu'])
    })
  })
})

describe('rendereVordrucke (real templates)', () => {
  it('the measured positions belong to exactly the pinned templates', () => {
    for (const [formular, sha256] of Object.entries(felder2025.vorlagen)) {
      expect(sha256).toBe((manifest as Record<string, { sha256: string }>)[formular]!.sha256)
      expect(createHash('sha256').update(readFileSync(new URL(`${formular}.pdf`, VORLAGEN))).digest('hex')).toBe(sha256)
    }
  })

  it('hands out every page of each used form: ESt 1 A (2) + Anlage N (4)', async () => {
    const pdf = await rendereVordrucke(FELDSAETZE[2025]!, ausdruckWerte(FAKTEN).werte, { vorlagenVerzeichnis: VORLAGEN })
    const dokument = await PDFDocument.load(pdf)
    expect(dokument.getPageCount()).toBe(6)
    // DIN A4 portrait, unscaled (BMF: < 5 % deviation allowed, we keep 0).
    const { width, height } = dokument.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
  })

  it('with a pension, Anlage R follows Anlage N: 2 + 4 + 2 pages', async () => {
    const { werte } = ausdruckWerte({ ...FAKTEN, rente: { rentenart: 'GesetzlicheRente', jahresbetrag: '14400' } })
    const pdf = await rendereVordrucke(FELDSAETZE[2025]!, werte, { vorlagenVerzeichnis: VORLAGEN })
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(8)
  })

  it('without Anlage N entries only the Hauptvordruck is handed out', async () => {
    const { werte } = ausdruckWerte({ ...FAKTEN, bruttoarbeitslohn: null })
    const pdf = await rendereVordrucke(FELDSAETZE[2025]!, werte, { vorlagenVerzeichnis: VORLAGEN })
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2)
  })

  it('refuses a value that does not fit its box instead of shrinking below 10 pt', async () => {
    const zuLang = { 'est1a.religion': 'VIEL ZU LANG FÜR DAS FELD' }
    await expect(rendereVordrucke(FELDSAETZE[2025]!, zuLang, { vorlagenVerzeichnis: VORLAGEN })).rejects.toBeInstanceOf(
      UeberlaufFehler,
    )
  })

  it('refuses an unknown field id (a typo must not vanish silently)', async () => {
    await expect(
      rendereVordrucke(FELDSAETZE[2025]!, { 'est1a.gibtsnicht': 'x' }, { vorlagenVerzeichnis: VORLAGEN }),
    ).rejects.toThrow(/Unbekannte Feld-IDs/)
  })

  it('renders all 9 printed forms cleanly with real templates', async () => {
    const res = ausdruckWerte({
      ...FAKTEN,
      rente: { rentenart: 'GesetzlicheRente', jahresbetrag: '12000' },
      kapital: { kapitalertraege: '1000' },
      chLohnausweis: { bruttolohnEur: '50000' },
      sonderausgaben: { spenden: '200' },
      riester: { art: 'Unmittelbar', einnahmenVorjahr: '40000' },
      kinder: [
        { vorname: 'Lina', nachname: 'Beispiel', geburtsdatum: '2016-01-01', idnr: '12345678901' },
      ],
      vermietung: [
        { strasse: 'Musterweg 1', plz: '10115', ort: 'Berlin', wohnflaeche: '60', mieteinnahmen: '8000', anschaffungskosten: '100000', baujahr: '2000', werbungskosten: '500', afaWieVorjahr: true },
      ],
    })
    const pdf = await rendereVordrucke(FELDSAETZE[2025]!, res.werte, {
      vorlagenVerzeichnis: VORLAGEN,
      instanzen: res.instanzen,
    })
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBeGreaterThan(15)
  })
})
