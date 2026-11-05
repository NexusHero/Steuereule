// ADR-0050 — the Formular-Ausdruck: field values from stored facts, and the renderer
// against the real checked-in templates. Positions come from felder-2025.json, measured
// by scripts/vordrucke/vermessen.mjs — never typed by hand.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { formatGermanDate } from '@steuereule/core'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { ausdruckWerte, type AusdruckFakten, type ChLohnausweisFakten } from '../src/ausdruck/ausdruck-werte.js'
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
    expect(formatGermanDate('2025-12-31')).toBe('31.12.2025')
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

  describe('Anlage N — Entfernungspauschale (Zeilen 27–31)', () => {
    const ARBEITSWEG = {
      arbeitstageJeWoche: 5,
      freieTage: 55,
      pendlertage: 206,
      einfacheKm: 23,
      mitPkw: true,
      taetigkeitsstaette: '79539 Lörrach, Hauptstraße 1',
    }

    it('fills workplace, days and distance; the tax office computes the Pauschale itself', () => {
      const { werte } = ausdruckWerte({ ...FAKTEN, arbeitsweg: ARBEITSWEG })

      expect(werte).toMatchObject({
        'anlN.wegArt': '1',
        'anlN.wegOrt': '79539 Lörrach, Hauptstraße 1',
        'anlN.wegTageJeWoche': '5',
        'anlN.wegFreieTage': '55',
        'anlN.kz110Tage': '206',
        'anlN.kz111': '23',
        'anlN.kz112': '23',
      })
    })

    it('leaves the car line empty without an own car', () => {
      const { werte } = ausdruckWerte({ ...FAKTEN, arbeitsweg: { ...ARBEITSWEG, mitPkw: false } })

      expect(werte['anlN.kz111']).toBe('23')
      expect(werte['anlN.kz112']).toBeUndefined()
    })

    it('prints no commute lines while the distance is unknown', () => {
      const { werte } = ausdruckWerte({ ...FAKTEN, arbeitsweg: { ...ARBEITSWEG, einfacheKm: null } })

      expect(werte['anlN.kz110Tage']).toBeUndefined()
      expect(werte['anlN.kz111']).toBeUndefined()
    })
  })

  describe('Anlage V — typical lines (S6)', () => {
    const OBJEKT = {
      strasse: 'Mühlstraße 21', plz: '73728', ort: 'Esslingen', wohnflaeche: '240', mieteinnahmen: '38400',
      anschaffungskosten: '620000', baujahr: '1978', werbungskosten: '9800', afaWieVorjahr: true,
      umlagen: '4200', schuldzinsen: '6100', einheiten: '3',
    }

    it('prints Umlagen (Z. 20), Schuldzinsen (Z. 46/48) and several flats in Z. 13, and nets them in the result', () => {
      const v = ausdruckWerte({ ...FAKTEN, vermietung: [OBJEKT] }).instanzen?.['anlage-v']?.[0]
      expect(v).toMatchObject({
        'anlV.z13Bezeichnung': '3 Wohneinheiten',
        'anlV.kz04': '4200',
        'anlV.z32Einnahmen': String(38400 + 4200),
        'anlV.kz33': '6100',
        'anlV.werbungskostenSumme': String(9800 + 6100 + 12400),
        'anlV.ueberschuss': String(38400 + 4200 - 9800 - 6100 - 12400),
        'anlV.kz20': String(38400 + 4200 - 9800 - 6100 - 12400),
      })
      expect(v?.['anlV.kz21']).toBeUndefined()
    })

    it('attributes the result to both spouses in a joint return — half and half unless a share is given (Z. 86)', () => {
      const kopplung = { veranlagungsart: 'zusammen' as const, personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: null, geburtsdatum: null } }
      const haelftig = ausdruckWerte({ ...FAKTEN, kopplung, vermietung: [OBJEKT] }).instanzen?.['anlage-v']?.[0]
      expect(haelftig).toMatchObject({ 'anlV.kz20': '7150', 'anlV.kz21': '7150' })
      const siebzigProzent = ausdruckWerte({ ...FAKTEN, kopplung, vermietung: [{ ...OBJEKT, anteilA: '70' }] }).instanzen?.['anlage-v']?.[0]
      expect(siebzigProzent).toMatchObject({ 'anlV.kz20': '10010', 'anlV.kz21': '4290' })
    })
  })

  describe('Anlage KAP', () => {
    const DEUTSCH = {
      depot: 'deutscher-broker',
      kapitalertraege: '20000',
      sparerPauschbetrag: '1000',
      kapitalertragsteuer: '4750',
      solidaritaetszuschlag: '261',
      kirchensteuer: '0',
    }
    const kap = (kapital: Record<string, string | null>) => ausdruckWerte({ ...FAKTEN, kapital: kapital as never })

    it('a German broker: Zeile 7, the used allowance and the withheld taxes to be credited (Zeilen 37–39)', () => {
      const { werte, fehlend } = kap(DEUTSCH)
      expect(fehlend).toEqual([])
      expect(werte).toMatchObject({
        'anlKap.personA': true,
        'anlKap.guenstigerpruefung': '1',
        'anlKap.kz210': '20000',
        'anlKap.kz217': '1000',
        'anlKap.kz280': '4750,00',
        'anlKap.kz281': '261,00',
        'anlKap.kz282': '0,00',
      })
      expect(werte['anlKap.kz234']).toBeUndefined()
    })

    it('a foreign broker: Zeile 19, nothing used in KAP (Zeile 16 = 0) and the allowance used elsewhere in Zeile 17', () => {
      const { werte, fehlend } = kap({ depot: 'auslaendischer-broker', kapitalertraege: '800', sparerPauschbetrag: '200' })
      expect(fehlend).toEqual([])
      expect(werte).toMatchObject({ 'anlKap.kz234': '800', 'anlKap.kz217': '0', 'anlKap.kz218': '200' })
      expect(werte['anlKap.kz210']).toBeUndefined()
      expect(werte['anlKap.kz280']).toBeUndefined()
    })

    const EHEPAAR = {
      veranlagungsart: 'zusammen' as const,
      personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: '51234567891', geburtsdatum: '1975-04-30' },
    }

    it('a joint account in a joint return: an Anlage KAP for each spouse with half of every amount (ADR-0054)', () => {
      const { werte, instanzen, fehlend } = ausdruckWerte({
        ...FAKTEN,
        kopplung: EHEPAAR,
        kapital: { ...DEUTSCH, kapitalertraege: '50001', sparerPauschbetrag: '2000', kapitalertragsteuer: '12000', solidaritaetszuschlag: '660', inhaber: 'gemeinsam' } as never,
      })
      expect(fehlend).toEqual([])
      expect(werte['anlKap.kz210']).toBeUndefined()
      const [a, b] = instanzen?.['anlage-kap'] ?? []
      expect(a).toMatchObject({ 'anlKap.personA': true, 'anlKap.vorname': 'Anna', 'anlKap.kz210': '25001', 'anlKap.kz217': '1000', 'anlKap.kz280': '6000,00', 'anlKap.kz281': '330,00' })
      expect(b).toMatchObject({ 'anlKap.personB': true, 'anlKap.vorname': 'Sabine', 'anlKap.kz210': '25000', 'anlKap.kz217': '1000', 'anlKap.kz280': '6000,00' })
    })

    it("Person B's own depot goes onto B's Anlage KAP; outside a joint return the owner is ignored", () => {
      const nurB = ausdruckWerte({ ...FAKTEN, kopplung: EHEPAAR, kapital: { ...DEUTSCH, inhaber: 'B' } as never })
      expect(nurB.instanzen?.['anlage-kap']).toHaveLength(1)
      expect(nurB.instanzen?.['anlage-kap']?.[0]).toMatchObject({ 'anlKap.personB': true, 'anlKap.kz210': '20000' })
      const einzeln = ausdruckWerte({ ...FAKTEN, kapital: { ...DEUTSCH, inhaber: 'gemeinsam' } as never })
      expect(einzeln.werte).toMatchObject({ 'anlKap.personA': true, 'anlKap.kz210': '20000' })
    })

    it('missing facts or an unanswered depot block as "kapital"; Krypto is named as not printable', () => {
      expect(kap({ ...DEUTSCH, kapitalertragsteuer: null }).fehlend).toEqual(['kapital'])
      expect(kap({ ...DEUTSCH, sparerPauschbetrag: 'unklar' }).fehlend).toEqual(['kapital'])
      expect(kap({ ...DEUTSCH, depot: 'unbekannt' }).fehlend).toEqual(['kapital'])
      expect(kap({ ...DEUTSCH, depot: 'krypto' }).fehlend).toEqual(['anlageKapKrypto'])
      expect(Object.keys(kap({ ...DEUTSCH, kapitalertraege: null }).werte).some((id) => id.startsWith('anlKap.'))).toBe(false)
    })
  })

  describe('Anlage N-Gre', () => {
    const CH: ChLohnausweisFakten = {
      status: 'echter-grenzgaenger',
      kurs: 1.065,
      bruttolohnChf: '100000',
      ahvBeitraegeChf: '6600',
      quellensteuerChf: '4500',
      arbeitgeberName: 'Muster AG',
      arbeitgeberStrasse: 'Bahnhofstrasse 1',
      arbeitgeberPlzOrt: '4051 Basel',
      familienzulagenChf: '2400',
      krankentaggeldChf: '300',
      pkArbeitnehmerChf: '5000',
      pkArbeitgeberChf: '6000',
      krankentaggeldArbeitgeberProzent: '0',
      krankentaggeldArbeitgeberChf: null,
      nbuvArbeitgeberProzent: '0',
      nbuvArbeitgeberChf: null,
      sonderfaelle: false,
    }
    const ngre = (ch: Partial<ChLohnausweisFakten>) => ausdruckWerte({ ...FAKTEN, chLohnausweis: { ...CH, ...ch } })

    it('prints Kz 117, the wage in CHF and EUR, Kz 116, the Abzugssteuer and the employer', () => {
      const { werte, fehlend } = ngre({})
      expect(fehlend).toEqual([])
      expect(werte).toMatchObject({
        'anlNGre.personA': true,
        'anlNGre.kz117': '3',
        'anlNGre.beruf': 'Ingenieurin',
        'anlNGre.z6Chf': '100000',
        'anlNGre.z6Eur': '106500',
        'anlNGre.z8Chf': '2400',
        'anlNGre.z15Chf': '97600',
        'anlNGre.z23Chf': '97600',
        'anlNGre.z23Eur': String(106500 - 2556),
        'anlNGre.z25Chf': '4500',
        'anlNGre.arbeitgeberName': 'Muster AG',
        'anlNGre.arbeitgeberPlzOrt': '4051 Basel',
      })
    })

    it('prints the split of the Swiss social contributions (Zeilen 75–88, Kz 300 / 304)', () => {
      expect(ngre({}).werte).toMatchObject({
        'anlNGre.z77Chf': '97600',
        'anlNGre.z82Chf': String(244 + 1074 + 300 + 177),
        'anlNGre.z85Chf': '9929',
        'anlNGre.z88Chf': '10929',
      })
    })

    it('missing facts block as "grenzgaenger"; cases the printout cannot cover are named', () => {
      expect(ngre({ kurs: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ pkArbeitgeberChf: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ arbeitgeberName: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ sonderfaelle: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ status: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ sonderfaelle: true }).fehlend).toEqual(['anlageNGreSonderfall'])
      expect(ngre({ status: 'kein-grenzgaenger' }).fehlend).toEqual(['anlageNGreKeinGrenzgaenger'])
      expect(Object.keys(ngre({ kurs: null }).werte).some((id) => id.startsWith('anlNGre.'))).toBe(false)
    })

    it('a couple of two Grenzgänger files one return with an Anlage N-Gre for each (ADR-0054)', () => {
      const { werte, instanzen, fehlend } = ausdruckWerte({
        ...FAKTEN,
        chLohnausweis: CH,
        kopplung: {
          veranlagungsart: 'zusammen',
          personB: {
            firstName: 'Julia', lastName: 'Brenner', steuerId: '21234567891', geburtsdatum: '1986-07-21', beruf: 'Treuhänderin',
            chLohnausweis: { ...CH, bruttolohnChf: '110000', familienzulagenChf: '0', arbeitgeberName: 'Basler Treuhand AG' },
            arbeitsweg: { arbeitstageJeWoche: 5, freieTage: 33, pendlertage: 228, einfacheKm: 20, mitPkw: true, taetigkeitsstaette: '4051 Basel' },
            krankenversicherung: [{ art: 'gesetzlich', kvBasis: 2520, mitKrankengeld: false, pv: 480, wahlleistungen: 0 }],
          },
        },
      })
      expect(fehlend).toEqual([])
      const nGre = instanzen?.['anlage-n-gre'] ?? []
      expect(nGre).toHaveLength(2)
      expect(nGre[0]).toMatchObject({ 'anlNGre.personA': true, 'anlNGre.z6Chf': '100000' })
      expect(nGre[1]).toMatchObject({
        'anlNGre.personB': true,
        'anlNGre.vorname': 'Julia',
        'anlNGre.beruf': 'Treuhänderin',
        'anlNGre.z6Chf': '110000',
        'anlNGre.arbeitgeberName': 'Basler Treuhand AG',
        'anlNGre.kz111': '20',
      })
      expect(werte['anlNGre.z6Chf']).toBeUndefined()
      expect(werte).toMatchObject({ 'anlVor.kz426': '2520', 'anlVor.kz429': '480' })
    })

    it("names Person B's incomplete Lohnausweis separately", () => {
      const { fehlend } = ausdruckWerte({
        ...FAKTEN,
        chLohnausweis: CH,
        kopplung: {
          veranlagungsart: 'zusammen',
          personB: { firstName: 'Julia', lastName: 'Brenner', steuerId: null, geburtsdatum: null, chLohnausweis: { ...CH, kurs: null } },
        },
      })
      expect(fehlend).toContain('grenzgaengerPersonB')
    })

    it('asks who pays a premium the employee contributes to, and the CHF when the employer pays everything', () => {
      expect(ngre({ krankentaggeldArbeitgeberProzent: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ nbuvArbeitgeberProzent: null }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ krankentaggeldChf: '0', krankentaggeldArbeitgeberProzent: null }).fehlend).toEqual([])
      expect(ngre({ krankentaggeldChf: '0', krankentaggeldArbeitgeberProzent: '100' }).fehlend).toEqual(['grenzgaenger'])
      expect(ngre({ krankentaggeldChf: '0', krankentaggeldArbeitgeberProzent: '100', krankentaggeldArbeitgeberChf: '1200' }).fehlend).toEqual([])
    })

    it('prints an employer share of the Krankentaggeld as wage (Z. 18) and in Z. 95/96 — 10 % / 90 %', () => {
      const { werte, fehlend } = ngre({ krankentaggeldChf: '900', krankentaggeldArbeitgeberProzent: '10' })
      expect(fehlend).toEqual([])
      expect(werte).toMatchObject({
        'anlNGre.z18Chf': '100',
        'anlNGre.z23Chf': '97700',
        'anlNGre.z80Chf': '1000',
        'anlNGre.z95Arbeitgeber': '10',
        'anlNGre.z95Arbeitnehmer': '90',
        'anlNGre.z96Arbeitgeber': '100',
        'anlNGre.z96Arbeitnehmer': '900',
      })
      expect(werte['anlNGre.z19Chf']).toBeUndefined()
    })

    it('prints the commute in the Anlage N-Gre (Z. 32–36), not only in the Anlage N', () => {
      const { werte } = ausdruckWerte({
        ...FAKTEN,
        bruttoarbeitslohn: null,
        chLohnausweis: CH,
        arbeitsweg: { arbeitstageJeWoche: 5, freieTage: 35, pendlertage: 226, einfacheKm: 80, mitPkw: true, taetigkeitsstaette: '4058 Basel' },
      })
      expect(werte).toMatchObject({
        'anlNGre.wegArt': '1',
        'anlNGre.wegOrt': '4058 Basel',
        'anlNGre.kz110Tage': '226',
        'anlNGre.kz111': '80',
        'anlNGre.kz112': '80',
      })
    })
  })

  it("prints the child's KV/PV paid by the parents in Anlage Kind Z. 27/28", () => {
    const kind = { lfdNr: '1', vorname: 'Mia', nachname: 'Beispiel', geburtsdatum: '2016-03-14', idnr: '41234567890', kvBasisEur: '1080', pvEur: '0' }
    const { instanzen } = ausdruckWerte({ ...FAKTEN, kinder: [kind] })
    expect(instanzen?.['anlage-kind']?.[0]).toMatchObject({ 'anlKind.kz66': '1080' })
    expect(instanzen?.['anlage-kind']?.[0]?.['anlKind.kz67']).toBeUndefined()
  })

  describe('Anlage Vorsorgeaufwand', () => {
    it('prints voluntary statutory KV with Krankengeld, PV and extras in Z. 16, 17, 18 and 22', () => {
      const { werte } = ausdruckWerte({
        ...FAKTEN,
        krankenversicherung: [{ art: 'gesetzlich', kvBasis: 2340, mitKrankengeld: true, pv: 660, wahlleistungen: 120 }],
      })
      expect(werte).toMatchObject({
        'anlVor.name': 'Beispiel',
        'anlVor.kz326': '2340',
        'anlVor.kz328': '2340',
        'anlVor.kz329': '660',
        'anlVor.kz338': '120',
      })
    })

    it('prints private insurance in Z. 23, 24 and 27, and leaves empty lines empty', () => {
      const { werte } = ausdruckWerte({
        ...FAKTEN,
        krankenversicherung: [{ art: 'privat', kvBasis: 4800, mitKrankengeld: false, pv: 400, wahlleistungen: 0 }],
      })
      expect(werte).toMatchObject({ 'anlVor.kz350': '4800', 'anlVor.kz351': '400' })
      expect(werte['anlVor.kz354']).toBeUndefined()
      expect(werte['anlVor.kz326']).toBeUndefined()
    })

    it('adds foreign insurances up in Z. 28–30 — a Swiss Krankenkasse has no Krankengeld claim (Z. 29)', () => {
      const { werte } = ausdruckWerte({
        ...FAKTEN,
        krankenversicherung: [
          { art: 'ausland', kvBasis: 3000, mitKrankengeld: false, pv: 0, wahlleistungen: 0 },
          { art: 'ausland', kvBasis: 500, mitKrankengeld: false, pv: 0, wahlleistungen: 0 },
        ],
      })
      expect(werte).toMatchObject({ 'anlVor.kz333': '3500', 'anlVor.kz334': '3500' })
    })

    it('prints no Anlage Vorsorgeaufwand without self-paid insurance', () => {
      const { werte } = ausdruckWerte({ ...FAKTEN, krankenversicherung: [] })
      expect(Object.keys(werte).some((id) => id.startsWith('anlVor.'))).toBe(false)
    })
  })

  it('fills Anlage Sonderausgaben and AV', () => {
    const { werte } = ausdruckWerte({
      ...FAKTEN,
      sonderausgaben: { spenden: '450' },
      riester: { art: 'Unmittelbar', einnahmenVorjahr: '48000' },
    })
    expect(werte).toMatchObject({
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

    it('prints Swiss family allowance plus Differenzkindergeld in Zeile 6 (Kz 15, ADR-0054, #414)', () => {
      const { instanzen, fehlend } = ausdruckWerte({
        ...ZUSAMMEN,
        kinder: [{ ...KIND, schweizerKinderzulageEur: '2748' }],
      })
      expect(fehlend).toEqual([])
      // 2025: 255 * 12 = 3060 total claim
      expect(instanzen!['anlage-kind']![0]).toMatchObject({
        'anlKind.kindergeld': '3060',
      })
    })

    it('prints higher Swiss family allowance in Zeile 6 when exceeding German Kindergeld', () => {
      const { instanzen } = ausdruckWerte({
        ...ZUSAMMEN,
        kinder: [{ ...KIND, schweizerKinderzulageEur: '3500' }],
      })
      expect(instanzen!['anlage-kind']![0]).toMatchObject({
        'anlKind.kindergeld': '3500',
      })
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

  it('the printout carries no form field — the values are fixed page content', async () => {
    const pdf = await rendereVordrucke(FELDSAETZE[2025]!, ausdruckWerte(FAKTEN).werte, { vorlagenVerzeichnis: VORLAGEN })
    expect((await PDFDocument.load(pdf)).getForm().getFields()).toHaveLength(0)
  })

  it('the editable variant keeps one named AcroForm field per value, instances numbered', async () => {
    const res = ausdruckWerte({
      ...FAKTEN,
      kinder: [
        { vorname: 'Lina', nachname: 'Beispiel', geburtsdatum: '2016-01-01', idnr: '12345678901' },
        { vorname: 'Noah', nachname: 'Beispiel', geburtsdatum: '2018-01-01', idnr: '22222222222' },
      ],
    })
    const pdf = await rendereVordrucke(FELDSAETZE[2025]!, res.werte, { vorlagenVerzeichnis: VORLAGEN, instanzen: res.instanzen, bearbeitbar: true })
    const form = (await PDFDocument.load(pdf)).getForm()
    expect(form.getTextField('est1a.name').getText()).toBe('Beispiel')
    expect(form.getTextField('anlN.kz110').getText()).toBe('42000')
    expect(form.getTextField('anlKind.vorname').getText()).toBe('Lina')
    expect(form.getTextField('anlKind.vorname#2').getText()).toBe('Noah')
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

  // Every fact the printout knows, filled to the last optional detail, in both household shapes:
  // a field id the mapping writes but nobody measured would only surface as a 500 after payment.
  const KIND_VOLL = {
    vorname: 'Lina', nachname: 'Muster', geburtsdatum: '2016-01-01', idnr: '12345678901', kindergeldAnspruchEur: '3060',
    kindschaftsverhaeltnis: '1', kindschaftsverhaeltnisB: '1', familienkasse: 'Familienkasse Sachsen', wohnsitzInlandGanzjaehrig: true,
    andererElternteil: 'Verstorben', andererElternteilName: 'Muster, Max', andererElternteilGeburtsdatum: '1984-02-11',
    andererElternteilAdresse: 'Hauptstraße 3, 01067 Dresden', andererElternteilArt: '1', andererElternteilVerstorbenAm: '2025-06-30',
    gemeldetBeiMirGanzjaehrig: true, kindergeldAnMichGanzjaehrig: true,
  }
  const ALLE_FAKTEN: AusdruckFakten = {
    ...FAKTEN,
    rente: { rentenart: 'GesetzlicheRente', jahresbetrag: '12000' },
    kapital: { depot: 'deutscher-broker', kapitalertraege: '1000', sparerPauschbetrag: '1000', kapitalertragsteuer: '0', solidaritaetszuschlag: '0', kirchensteuer: '0' },
    chLohnausweis: {
      status: 'echter-grenzgaenger', kurs: 1.065, bruttolohnChf: '50000', ahvBeitraegeChf: '3300', quellensteuerChf: '2250',
      arbeitgeberName: 'Muster AG', arbeitgeberStrasse: 'Bahnhofstrasse 1', arbeitgeberPlzOrt: '4051 Basel',
      familienzulagenChf: '0', krankentaggeldChf: '150', pkArbeitnehmerChf: '2500', pkArbeitgeberChf: '3000', sonderfaelle: false,
      krankentaggeldArbeitgeberProzent: '0', krankentaggeldArbeitgeberChf: null, nbuvArbeitgeberProzent: '0', nbuvArbeitgeberChf: null,
    },
    sonderausgaben: { spenden: '200' },
    riester: { art: 'Unmittelbar', einnahmenVorjahr: '40000' },
    alleinerziehend: { weiterePerson: 'Nein', haushaltsgemeinschaft: 'Nein' },
    kinder: [KIND_VOLL, { ...KIND_VOLL, andererElternteil: 'Unbekannt' }],
    vermietung: [
      { strasse: 'Musterweg 1', plz: '10115', ort: 'Berlin', wohnflaeche: '60', mieteinnahmen: '8000', anschaffungskosten: '100000', baujahr: '2000', werbungskosten: '500', afaWieVorjahr: true },
    ],
  }
  const VERHEIRATET: AusdruckFakten = {
    ...ALLE_FAKTEN,
    stammdaten: { ...FAKTEN.stammdaten!, familienstand: 'verheiratet', familienstandSeit: '2015-05-15' },
    kopplung: {
      veranlagungsart: 'zusammen',
      personB: {
        firstName: 'Bernd', lastName: 'Beispiel', steuerId: '12345678902', geburtsdatum: '1988-11-20', religion: 'VD', beruf: 'Lehrer',
        bruttoarbeitslohn: '54000', rente: { rentenart: 'GesetzlicheRente', jahresbetrag: '9000' },
      },
    },
    kapital: { depot: 'auslaendischer-broker', kapitalertraege: '800', sparerPauschbetrag: '200' },
    riester: { art: 'Mittelbar', einnahmenVorjahr: null },
  }

  for (const [fall, fakten] of [['single parent', ALLE_FAKTEN], ['joint return', VERHEIRATET]] as const) {
    it(`renders every field the mapping writes — ${fall}, all facts`, async () => {
      const res = ausdruckWerte(fakten)
      const pdf = await rendereVordrucke(FELDSAETZE[2025]!, res.werte, { vorlagenVerzeichnis: VORLAGEN, instanzen: res.instanzen })
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(15)
    })
  }
})
