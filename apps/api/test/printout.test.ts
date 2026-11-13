// ADR-0050 — the Formular-Ausdruck: field values from stored facts, and the renderer
// against the real checked-in templates. Positions come from felder-2025.json, measured
// by scripts/vordrucke/vermessen.mjs — never typed by hand.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { formatGermanDate } from '@steuereule/core'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { printoutValues, type PrintoutFacts, type ChSalaryCertificateFacts } from '../src/printout/printout-values.js'
import felder2025 from '../src/printout/felder-2025.json' with { type: 'json' }
import manifest from '../src/printout/vordrucke-2025.json' with { type: 'json' }
import { FIELD_SETS, renderForms, OverflowError } from '../src/printout/form-renderer.js'

const TEMPLATES = new URL('../assets/vordrucke/2025/', import.meta.url)

const FACTS: PrintoutFacts = {
  taxYear: 2025,
  profile: { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: '2010304050' },
  masterData: {
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
    const { values, missing } = printoutValues(FACTS)
    expect(missing).toEqual([])
    expect(values).toMatchObject({
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
    expect(values['est1a.hausnummerZusatz']).toBeUndefined()
    expect(values['est1a.telefon']).toBeUndefined()
  })

  it('a foreign IBAN goes to the foreign line, an other account holder by name', () => {
    const { values } = printoutValues({
      ...FACTS,
      masterData: { ...FACTS.masterData!, iban: 'CH9300762011623852957', kontoinhaber: 'Max Beispiel' },
    })
    expect(values['est1a.ibanAusland']).toBe('CH9300762011623852957')
    expect(values['est1a.ibanInland']).toBeUndefined()
    expect(values['est1a.kontoinhaberName']).toBe('Max Beispiel')
    expect(values['est1a.kontoinhaberSelbst']).toBeUndefined()
  })

  it('no usable LStB figure: no Anlage N entries at all (a form without entries is not handed in)', () => {
    const { values } = printoutValues({ ...FACTS, bruttoarbeitslohn: 'unklar' })
    expect(Object.keys(values).filter((id) => id.startsWith('anlN.'))).toEqual([])
  })

  it('names everything the Hauptvordruck still needs', () => {
    const { missing } = printoutValues({ ...FACTS, profile: { ...FACTS.profile, steuerId: null }, masterData: null })
    expect(missing).toEqual(['steuerId', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'])
  })

  it('married: waits for the Veranlagungsart and Person B instead of deciding Einzelveranlagung silently', () => {
    const { missing } = printoutValues({ ...FACTS, masterData: { ...FACTS.masterData!, familienstand: 'verheiratet' } })
    expect(missing).toEqual(['ehegatte'])
  })

  it('a gesetzliche Rente goes to Anlage R Zeile 4 (Kz 101), a private one to Zeile 13 (Kz 131)', () => {
    const statutory = printoutValues({ ...FACTS, pension: { rentenart: 'GesetzlicheRente', jahresbetrag: '14400' } }).values
    expect(statutory).toMatchObject({ 'anlR.kz101': '14400', 'anlR.personA': true, 'anlR.lfdNr': '1', 'anlR.name': 'Beispiel' })
    expect(statutory['anlR.kz131']).toBeUndefined()

    const privateInsurance = printoutValues({ ...FACTS, pension: { rentenart: 'PrivateRentenversicherung', jahresbetrag: '2400' } }).values
    expect(privateInsurance['anlR.kz131']).toBe('2400')
    expect(privateInsurance['anlR.kz101']).toBeUndefined()
  })

  it('a pension that belongs on another Vordruck (bAV, ausländisch) blocks instead of being dropped', () => {
    expect(printoutValues({ ...FACTS, pension: { rentenart: 'Betriebsrente', jahresbetrag: '3000' } }).missing).toEqual([
      'anlageRAvBav',
    ])
    expect(printoutValues({ ...FACTS, pension: { rentenart: 'AuslaendischeRente', jahresbetrag: '3000' } }).missing).toEqual([
      'anlageRAus',
    ])
  })

  it('formats dates with points, as the form asks', () => {
    expect(formatGermanDate('2025-12-31')).toBe('31.12.2025')
  })

  it('married with zusammenveranlagung fills Person B fields and checks completeness', () => {
    const { values, instances, missing } = printoutValues({
      ...FACTS,
      masterData: { ...FACTS.masterData!, familienstand: 'verheiratet', familienstandSeit: '2020-05-15' },
      link: {
        filingType: 'zusammen',
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
    expect(missing).toEqual([])
    expect(values).toMatchObject({
      'est1a.zusammenveranlagung': true,
      'est1a.verheiratetSeit': '15.05.2020',
      'est1a.nameB': 'Beispiel',
      'est1a.vornameB': 'Bernd',
      'est1a.idnrB': '12345678902',
      'est1a.geburtsdatumB': '20.11.1988',
      'est1a.religionB': 'VD',
      'est1a.berufB': 'Lehrer',
    })
    expect(instances?.['anlage-n']).toEqual([
      { 'anlN.kz110': '42000', 'anlN.personA': true, 'anlN.name': 'Beispiel', 'anlN.vorname': 'Anna', 'anlN.steuernummer': '2010304050' },
      { 'anlN.kz110': '54000', 'anlN.personB': true, 'anlN.name': 'Beispiel', 'anlN.vorname': 'Bernd', 'anlN.steuernummer': '2010304050' },
    ])
  })

  it('married with einzelveranlagung sets einzelveranlagung box without requiring Person B', () => {
    const { values, missing } = printoutValues({
      ...FACTS,
      masterData: { ...FACTS.masterData!, familienstand: 'verheiratet', familienstandSeit: '2020-05-15' },
      link: { filingType: 'einzel' },
    })
    expect(missing).toEqual([])
    expect(values['est1a.einzelveranlagung']).toBe(true)
    expect(values['est1a.zusammenveranlagung']).toBeUndefined()
  })

  describe('Anlage N — Entfernungspauschale (Zeilen 27–31)', () => {
    const COMMUTE = {
      workdaysPerWeek: 5,
      daysOff: 55,
      commuteDays: 206,
      oneWayKm: 23,
      withCar: true,
      workplace: '79539 Lörrach, Hauptstraße 1',
    }

    it('fills workplace, days and distance; the tax office computes the Pauschale itself', () => {
      const { values } = printoutValues({ ...FACTS, commute: COMMUTE })

      expect(values).toMatchObject({
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
      const { values } = printoutValues({ ...FACTS, commute: { ...COMMUTE, withCar: false } })

      expect(values['anlN.kz111']).toBe('23')
      expect(values['anlN.kz112']).toBeUndefined()
    })

    const WORK_EXPENSES = {
      professionalBodiesEur: 120,
      professionalBodiesNote: 'Gewerkschaft',
      workEquipmentEur: 110,
      workEquipmentNote: 'Berufskleidung',
      accountFeesEur: 16,
      otherWorkExpensesEur: 40,
      otherWorkExpensesNote: 'Bewerbungen',
    }

    it('prints the further Werbungskosten: Kz 310, 320 with what they were, and 380 with each line (ADR-0076)', () => {
      const { values } = printoutValues({ ...FACTS, commute: { ...COMMUTE, workExpenses: WORK_EXPENSES } })
      expect(values).toMatchObject({
        'anlN.z53Text': 'Gewerkschaft',
        'anlN.kz310': '120',
        'anlN.z54Text': 'Berufskleidung',
        'anlN.z54Eur': '110',
        'anlN.kz320': '110',
        'anlN.z62Text': 'Kontoführungsgebühren',
        'anlN.z62Eur': '16',
        'anlN.z63Text': 'Bewerbungen',
        'anlN.z63Eur': '40',
        'anlN.kz380': '56',
      })
    })

    it('prints the further Werbungskosten also while the distance is unknown', () => {
      const { values } = printoutValues({ ...FACTS, commute: { ...COMMUTE, oneWayKm: null, workExpenses: { ...WORK_EXPENSES, professionalBodiesEur: null, otherWorkExpensesEur: null } } })
      expect(values['anlN.kz320']).toBe('110')
      expect(values['anlN.kz380']).toBe('16')
      expect(values['anlN.kz310']).toBeUndefined()
      expect(values['anlN.kz111']).toBeUndefined()
    })

    it('prints no commute lines while the distance is unknown', () => {
      const { values } = printoutValues({ ...FACTS, commute: { ...COMMUTE, oneWayKm: null } })

      expect(values['anlN.kz110Tage']).toBeUndefined()
      expect(values['anlN.kz111']).toBeUndefined()
    })
  })

  describe('Anlage V — typical lines (S6)', () => {
    const PROPERTY = {
      strasse: 'Mühlstraße 21', plz: '73728', city: 'Esslingen', livingArea: '240', mieteinnahmen: '38400',
      anschaffungskosten: '620000', baujahr: '1978', werbungskosten: '9800', depreciationAsLastYear: true,
      umlagen: '4200', schuldzinsen: '6100', einheiten: '3',
    }

    it('prints Umlagen (Z. 20), Schuldzinsen (Z. 46/48) and several flats in Z. 13, and nets them in the result', () => {
      const v = printoutValues({ ...FACTS, rental: [PROPERTY] }).instances?.['anlage-v']?.[0]
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
      const link = { filingType: 'zusammen' as const, personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: null, geburtsdatum: null } }
      const halved = printoutValues({ ...FACTS, link, rental: [PROPERTY] }).instances?.['anlage-v']?.[0]
      expect(halved).toMatchObject({ 'anlV.kz20': '7150', 'anlV.kz21': '7150' })
      const seventyPercent = printoutValues({ ...FACTS, link, rental: [{ ...PROPERTY, anteilA: '70' }] }).instances?.['anlage-v']?.[0]
      expect(seventyPercent).toMatchObject({ 'anlV.kz20': '10010', 'anlV.kz21': '4290' })
    })
  })

  describe('Anlage KAP', () => {
    const GERMAN = {
      depot: 'deutscher-broker',
      kapitalertraege: '20000',
      sparerPauschbetrag: '1000',
      kapitalertragsteuer: '4750',
      solidaritaetszuschlag: '261',
      kirchensteuer: '0',
    }
    const kap = (capital: Record<string, string | null>) => printoutValues({ ...FACTS, capital: capital as never })

    it('a German broker: Zeile 7, the used allowance and the withheld taxes to be credited (Zeilen 37–39)', () => {
      const { values, missing } = kap(GERMAN)
      expect(missing).toEqual([])
      expect(values).toMatchObject({
        'anlKap.personA': true,
        'anlKap.guenstigerpruefung': '1',
        'anlKap.kz210': '20000',
        'anlKap.kz217': '1000',
        'anlKap.kz280': '4750,00',
        'anlKap.kz281': '261,00',
        'anlKap.kz282': '0,00',
      })
      expect(values['anlKap.kz234']).toBeUndefined()
    })

    it('a foreign broker: Zeile 19, nothing used in KAP (Zeile 16 = 0) and the allowance used elsewhere in Zeile 17', () => {
      const { values, missing } = kap({ depot: 'auslaendischer-broker', kapitalertraege: '800', sparerPauschbetrag: '200' })
      expect(missing).toEqual([])
      expect(values).toMatchObject({ 'anlKap.kz234': '800', 'anlKap.kz217': '0', 'anlKap.kz218': '200' })
      expect(values['anlKap.kz210']).toBeUndefined()
      expect(values['anlKap.kz280']).toBeUndefined()
    })

    const MARRIED_COUPLE = {
      filingType: 'zusammen' as const,
      personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: '51234567891', geburtsdatum: '1975-04-30' },
    }

    it('a joint account in a joint return: an Anlage KAP for each spouse with half of every amount (ADR-0054)', () => {
      const { values, instances, missing } = printoutValues({
        ...FACTS,
        link: MARRIED_COUPLE,
        capital: { ...GERMAN, kapitalertraege: '50001', sparerPauschbetrag: '2000', kapitalertragsteuer: '12000', solidaritaetszuschlag: '660', inhaber: 'gemeinsam' } as never,
      })
      expect(missing).toEqual([])
      expect(values['anlKap.kz210']).toBeUndefined()
      const [a, b] = instances?.['anlage-kap'] ?? []
      expect(a).toMatchObject({ 'anlKap.personA': true, 'anlKap.vorname': 'Anna', 'anlKap.kz210': '25001', 'anlKap.kz217': '1000', 'anlKap.kz280': '6000,00', 'anlKap.kz281': '330,00' })
      expect(b).toMatchObject({ 'anlKap.personB': true, 'anlKap.vorname': 'Sabine', 'anlKap.kz210': '25000', 'anlKap.kz217': '1000', 'anlKap.kz280': '6000,00' })
    })

    it("Person B's own depot goes onto B's Anlage KAP; outside a joint return the owner is ignored", () => {
      const onlyB = printoutValues({ ...FACTS, link: MARRIED_COUPLE, capital: { ...GERMAN, inhaber: 'B' } as never })
      expect(onlyB.instances?.['anlage-kap']).toHaveLength(1)
      expect(onlyB.instances?.['anlage-kap']?.[0]).toMatchObject({ 'anlKap.personB': true, 'anlKap.kz210': '20000' })
      const individual = printoutValues({ ...FACTS, capital: { ...GERMAN, inhaber: 'gemeinsam' } as never })
      expect(individual.values).toMatchObject({ 'anlKap.personA': true, 'anlKap.kz210': '20000' })
    })

    it('missing facts or an unanswered depot block as "kapital"; Krypto is named as not printable', () => {
      expect(kap({ ...GERMAN, kapitalertragsteuer: null }).missing).toEqual(['kapital'])
      expect(kap({ ...GERMAN, sparerPauschbetrag: 'unklar' }).missing).toEqual(['kapital'])
      expect(kap({ ...GERMAN, depot: 'unbekannt' }).missing).toEqual(['kapital'])
      expect(kap({ ...GERMAN, depot: 'krypto' }).missing).toEqual(['anlageKapKrypto'])
      expect(Object.keys(kap({ ...GERMAN, kapitalertraege: null }).values).some((id) => id.startsWith('anlKap.'))).toBe(false)
    })
  })

  describe('Anlage N-Gre', () => {
    const CH: ChSalaryCertificateFacts = {
      status: 'echter-grenzgaenger',
      rate: 1.065,
      grossWageChf: '100000',
      ahvContributionsChf: '6600',
      withholdingTaxChf: '4500',
      arbeitgeberName: 'Muster AG',
      arbeitgeberStrasse: 'Bahnhofstrasse 1',
      arbeitgeberPlzOrt: '4051 Basel',
      familienzulagenChf: '2400',
      krankentaggeldChf: '300',
      pkArbeitnehmerChf: '5000',
      pkArbeitgeberChf: '6000',
      pkArbeitnehmerGesamtChf: null,
      pkArbeitgeberGesamtChf: null,
      steuerfreiesKrankentaggeldChf: null,
      krankentaggeldArbeitgeberProzent: '0',
      krankentaggeldArbeitgeberChf: null,
      nbuvArbeitgeberProzent: '0',
      nbuvArbeitgeberChf: null,
      specialCases: false,
    }
    const ngre = (ch: Partial<ChSalaryCertificateFacts>) => printoutValues({ ...FACTS, chSalaryCertificate: { ...CH, ...ch } })

    it('prints Kz 117, the wage in CHF and EUR, Kz 116, the Abzugssteuer and the employer', () => {
      const { values, missing } = ngre({})
      expect(missing).toEqual([])
      expect(values).toMatchObject({
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
      expect(ngre({}).values).toMatchObject({
        'anlNGre.z77Chf': '97600',
        'anlNGre.z82Chf': String(244 + 1074 + 300 + 177),
        'anlNGre.z85Chf': '9929',
        'anlNGre.z88Chf': '10929',
      })
    })

    it('missing facts block as "grenzgaenger"; cases the printout cannot cover are named', () => {
      expect(ngre({ rate: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ pkArbeitgeberChf: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ arbeitgeberName: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ specialCases: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ status: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ specialCases: true }).missing).toEqual(['anlageNGreSonderfall'])
      expect(ngre({ status: 'kein-grenzgaenger' }).missing).toEqual(['anlageNGreKeinGrenzgaenger'])
      expect(Object.keys(ngre({ rate: null }).values).some((id) => id.startsWith('anlNGre.'))).toBe(false)
    })

    it('a couple of two Grenzgänger files one return with an Anlage N-Gre for each (ADR-0054)', () => {
      const { values, instances, missing } = printoutValues({
        ...FACTS,
        chSalaryCertificate: CH,
        link: {
          filingType: 'zusammen',
          personB: {
            firstName: 'Julia', lastName: 'Brenner', steuerId: '21234567891', geburtsdatum: '1986-07-21', beruf: 'Treuhänderin',
            chSalaryCertificate: { ...CH, grossWageChf: '110000', familienzulagenChf: '0', arbeitgeberName: 'Basler Treuhand AG' },
            commute: { workdaysPerWeek: 5, daysOff: 33, commuteDays: 228, oneWayKm: 20, withCar: true, workplace: '4051 Basel' },
            healthInsurance: [{ kind: 'gesetzlich', basicHealthAmount: 2520, withSickPay: false, careInsuranceAmount: 480, optionalExtrasAmount: 0 }],
          },
        },
      })
      expect(missing).toEqual([])
      const nGre = instances?.['anlage-n-gre'] ?? []
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
      expect(values['anlNGre.z6Chf']).toBeUndefined()
      expect(values).toMatchObject({ 'anlVor.kz426': '2520', 'anlVor.kz429': '480' })
    })

    it("names Person B's incomplete Lohnausweis separately", () => {
      const { missing } = printoutValues({
        ...FACTS,
        chSalaryCertificate: CH,
        link: {
          filingType: 'zusammen',
          personB: { firstName: 'Julia', lastName: 'Brenner', steuerId: null, geburtsdatum: null, chSalaryCertificate: { ...CH, rate: null } },
        },
      })
      expect(missing).toContain('grenzgaengerPersonB')
    })

    it('asks who pays a premium the employee contributes to, and the CHF when the employer pays everything', () => {
      expect(ngre({ krankentaggeldArbeitgeberProzent: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ nbuvArbeitgeberProzent: null }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ krankentaggeldChf: '0', krankentaggeldArbeitgeberProzent: null }).missing).toEqual([])
      expect(ngre({ krankentaggeldChf: '0', krankentaggeldArbeitgeberProzent: '100' }).missing).toEqual(['grenzgaenger'])
      expect(ngre({ krankentaggeldChf: '0', krankentaggeldArbeitgeberProzent: '100', krankentaggeldArbeitgeberChf: '1200' }).missing).toEqual([])
    })

    it('prints an employer share of the Krankentaggeld as wage (Z. 18) and in Z. 95/96 — 10 % / 90 %', () => {
      const { values, missing } = ngre({ krankentaggeldChf: '900', krankentaggeldArbeitgeberProzent: '10' })
      expect(missing).toEqual([])
      expect(values).toMatchObject({
        'anlNGre.z18Chf': '100',
        'anlNGre.z23Chf': '97700',
        'anlNGre.z80Chf': '1000',
        'anlNGre.z95Arbeitgeber': '10',
        'anlNGre.z95Arbeitnehmer': '90',
        'anlNGre.z96Arbeitgeber': '100',
        'anlNGre.z96Arbeitnehmer': '900',
      })
      expect(values['anlNGre.z19Chf']).toBeUndefined()
    })

    it("prints the adviser's case: Säule 2b as wage (Z. 20), only the Obligatorium in Z. 84/87, NBUV paid by the employer, tax-free Krankentaggeld (Z. 9/76)", () => {
      const { values, missing } = ngre({
        pkArbeitnehmerGesamtChf: '7186',
        pkArbeitnehmerChf: '2892',
        pkArbeitgeberGesamtChf: '7186',
        pkArbeitgeberChf: '2892',
        steuerfreiesKrankentaggeldChf: '3853',
        nbuvArbeitgeberProzent: '100',
        nbuvArbeitgeberChf: '540',
      })
      expect(missing).toEqual([])
      // Hand-computed, rate 1,065: Z. 15 = 100000 − 2400 − 3853 = 93747; Z. 20 = 7186 − 2892 = 4294;
      // Z. 23 = 93747 + 540 + 4294 = 98581. EUR: 106500 − 2556 − 4103 = 99841; + 575 + 4573 = 104989.
      expect(values).toMatchObject({
        'anlNGre.z9Chf': '3853',
        'anlNGre.z9Eur': '4103',
        'anlNGre.z15Chf': '93747',
        'anlNGre.z19Chf': '540',
        'anlNGre.z20Chf': '4294',
        'anlNGre.z20Eur': '4573',
        'anlNGre.z23Chf': '98581',
        'anlNGre.z23Eur': '104989',
        // Z. 76 = Familienzulagen + Krankentaggeld = 2400 + 3853; AHV/IV 5,05 % of 93747 = 4734
        'anlNGre.z76Chf': '6253',
        'anlNGre.z76Eur': '6659',
        'anlNGre.z77Chf': '93747',
        'anlNGre.z83Chf': '4734',
        'anlNGre.z84Chf': '2892',
        'anlNGre.z85Chf': String(4734 + 2892),
        'anlNGre.z87Chf': '2892',
        'anlNGre.z88Chf': String(4734 + 2892),
        'anlNGre.z97Arbeitgeber': '100',
        'anlNGre.z97Arbeitnehmer': '0',
        'anlNGre.z98Arbeitgeber': '540',
        'anlNGre.z98Arbeitnehmer': '0',
      })
    })

    it('leaves Zeilen 9 and 20 empty when there is nothing to print', () => {
      const { values } = ngre({})
      expect(values['anlNGre.z9Chf']).toBeUndefined()
      expect(values['anlNGre.z20Chf']).toBeUndefined()
    })

    it('prints the commute in the Anlage N-Gre (Z. 32–36), not only in the Anlage N', () => {
      const { values } = printoutValues({
        ...FACTS,
        bruttoarbeitslohn: null,
        chSalaryCertificate: CH,
        commute: { workdaysPerWeek: 5, daysOff: 35, commuteDays: 226, oneWayKm: 80, withCar: true, workplace: '4058 Basel' },
      })
      expect(values).toMatchObject({
        'anlNGre.wegArt': '1',
        'anlNGre.wegOrt': '4058 Basel',
        'anlNGre.kz110Tage': '226',
        'anlNGre.kz111': '80',
        'anlNGre.kz112': '80',
      })
    })

    it('prints a cross-border commuter’s further Werbungskosten in the Anlage N-Gre (Z. 48–51, 57–59)', () => {
      const { values } = printoutValues({
        ...FACTS,
        bruttoarbeitslohn: null,
        chSalaryCertificate: CH,
        commute: {
          workdaysPerWeek: 5, daysOff: 35, commuteDays: 226, oneWayKm: 80, withCar: true, workplace: '4058 Basel',
          workExpenses: { professionalBodiesEur: null, professionalBodiesNote: null, workEquipmentEur: 110, workEquipmentNote: null, accountFeesEur: 16, otherWorkExpensesEur: null, otherWorkExpensesNote: null },
        },
      })
      expect(values).toMatchObject({ 'anlNGre.z49Text': 'Arbeitsmittel', 'anlNGre.z49Eur': '110', 'anlNGre.kz320': '110', 'anlNGre.z57Text': 'Kontoführungsgebühren', 'anlNGre.kz380': '16' })
      expect(values['anlN.kz320']).toBeUndefined()
    })
  })

  it('prints childcare in Anlage Kind Z. 67 with provider and period (ADR-0076)', () => {
    const kind = { sequenceNumber: '1', firstName: 'Mia', lastName: 'Beispiel', geburtsdatum: '2021-03-14', taxId: '41234567890', childcareEur: '900', childcareProvider: 'Kindergarten, Gemeinde Musterdorf', childcareFrom: '01.01.2025', childcareTo: '31.12.2025' }
    const { instances } = printoutValues({ ...FACTS, kinder: [kind] })
    expect(instances?.['anlage-kind']?.[0]).toMatchObject({ 'anlKind.kz51': '900', 'anlKind.z67Text': 'Kindergarten, Gemeinde Musterdorf', 'anlKind.z67Von': '01.01.2025', 'anlKind.z67Bis': '31.12.2025' })
  })

  it('prints medical costs in the Anlage Außergewöhnliche Belastungen and § 35a in the Anlage Haushaltsnahe Aufwendungen (ADR-0077)', () => {
    const { values } = printoutValues({ ...FACTS, householdAndHealth: { healthCostsEur: 390, minijobEur: null, servicesEur: 240, craftsmenLabourEur: 350 } })
    expect(values).toMatchObject({
      'anlAgB.kz302': '390',
      'anlAgB.kz303': '0',
      'anlHha.kz212': '240',
      'anlHha.z6Text': 'Handwerkerleistungen',
      'anlHha.z6Lohn': '350',
      'anlHha.kz214': '350',
    })
    expect(values['anlHha.kz202']).toBeUndefined()
  })

  it('prints neither form while nothing was entered (or the switch is off)', () => {
    const { values } = printoutValues({ ...FACTS, householdAndHealth: null })
    expect(Object.keys(values).some((k) => k.startsWith('anlAgB.') || k.startsWith('anlHha.'))).toBe(false)
  })

  it("prints the child's KV/PV paid by the parents in Anlage Kind Z. 27/28", () => {
    const kind = { sequenceNumber: '1', firstName: 'Mia', lastName: 'Beispiel', geburtsdatum: '2016-03-14', taxId: '41234567890', healthBasicEur: '1080', careEur: '0' }
    const { instances } = printoutValues({ ...FACTS, kinder: [kind] })
    expect(instances?.['anlage-kind']?.[0]).toMatchObject({ 'anlKind.kz66': '1080' })
    expect(instances?.['anlage-kind']?.[0]?.['anlKind.kz67']).toBeUndefined()
  })

  describe('Anlage Vorsorgeaufwand', () => {
    it('prints voluntary statutory KV with Krankengeld, PV and extras in Z. 16, 17, 18 and 22', () => {
      const { values } = printoutValues({
        ...FACTS,
        healthInsurance: [{ kind: 'gesetzlich', basicHealthAmount: 2340, withSickPay: true, careInsuranceAmount: 660, optionalExtrasAmount: 120 }],
      })
      expect(values).toMatchObject({
        'anlVor.name': 'Beispiel',
        'anlVor.kz326': '2340',
        'anlVor.kz328': '2340',
        'anlVor.kz329': '660',
        'anlVor.kz338': '120',
      })
    })

    it('prints private insurance in Z. 23, 24 and 27, and leaves empty lines empty', () => {
      const { values } = printoutValues({
        ...FACTS,
        healthInsurance: [{ kind: 'privat', basicHealthAmount: 4800, withSickPay: false, careInsuranceAmount: 400, optionalExtrasAmount: 0 }],
      })
      expect(values).toMatchObject({ 'anlVor.kz350': '4800', 'anlVor.kz351': '400' })
      expect(values['anlVor.kz354']).toBeUndefined()
      expect(values['anlVor.kz326']).toBeUndefined()
    })

    it('adds foreign insurances up in Z. 28–30 — a Swiss Krankenkasse has no Krankengeld claim (Z. 29)', () => {
      const { values } = printoutValues({
        ...FACTS,
        healthInsurance: [
          { kind: 'ausland', basicHealthAmount: 3000, withSickPay: false, careInsuranceAmount: 0, optionalExtrasAmount: 0 },
          { kind: 'ausland', basicHealthAmount: 500, withSickPay: false, careInsuranceAmount: 0, optionalExtrasAmount: 0 },
        ],
      })
      expect(values).toMatchObject({ 'anlVor.kz333': '3500', 'anlVor.kz334': '3500' })
    })

    it('prints no Anlage Vorsorgeaufwand without self-paid insurance', () => {
      const { values } = printoutValues({ ...FACTS, healthInsurance: [] })
      expect(Object.keys(values).some((id) => id.startsWith('anlVor.'))).toBe(false)
    })
  })

  it('fills Anlage Sonderausgaben and AV', () => {
    const { values } = printoutValues({
      ...FACTS,
      specialExpenses: { donations: '450' },
      riester: { kind: 'Unmittelbar', incomeLastYear: '48000' },
    })
    expect(values).toMatchObject({
      'anlSo.spenden': '450',
      'anlAv.unmittelbar': '1',
      'anlAv.kz100': '48000',
    })
  })

  it('Anlage AV: mittelbar writes 2 in Zeile 14 and needs no earnings; a direct claim without them blocks', () => {
    const indirect = printoutValues({ ...FACTS, riester: { kind: 'Mittelbar', incomeLastYear: null } })
    expect(indirect.values['anlAv.mittelbar']).toBe('2')
    expect(indirect.values['anlAv.unmittelbar']).toBeUndefined()
    expect(indirect.missing).toEqual([])

    expect(printoutValues({ ...FACTS, riester: { kind: 'Unmittelbar', incomeLastYear: null } }).missing).toEqual(['riester'])
    expect(printoutValues({ ...FACTS, riester: { kind: null, incomeLastYear: null } }).missing).toEqual(['riester'])
    expect(Object.keys(printoutValues({ ...FACTS, riester: { kind: null, incomeLastYear: null } }).values).some((id) => id.startsWith('anlAv.'))).toBe(false)
  })

  it('writes nothing onto Anlage Vorsorgeaufwand: its employee lines are ⓔ-Zeilen the Finanzamt already has', () => {
    const { values } = printoutValues(FACTS)
    expect(Object.keys(values).filter((id) => id.startsWith('anlVor.'))).toEqual([])
  })

  describe('Anlage Kind', () => {
    const JOINT: PrintoutFacts = {
      ...FACTS,
      masterData: { ...FACTS.masterData!, familienstand: 'verheiratet', familienstandSeit: '2015-05-15' },
      link: {
        filingType: 'zusammen',
        personB: { firstName: 'Bernd', lastName: 'Beispiel', steuerId: '12345678902', geburtsdatum: '1988-11-20', religion: 'VD', beruf: 'Lehrer' },
      },
    }
    const KIND = {
      firstName: 'Lina',
      lastName: 'Beispiel',
      geburtsdatum: '2016-03-10',
      taxId: '11111111111',
      childBenefitClaimEur: '3060',
      kinship: '1',
      kinshipB: '1',
      familyBenefitsOffice: 'Familienkasse Sachsen',
      domesticResidenceAllYear: true,
    }

    it('prints Familienkasse, Wohnsitz im Inland and both Kindschaftsverhältnisse (Zeilen 7, 8, 10)', () => {
      const { instances, missing } = printoutValues({ ...JOINT, kinder: [KIND] })
      expect(missing).toEqual([])
      expect(instances!['anlage-kind']![0]).toMatchObject({
        'anlKind.idnr': '11111111111',
        'anlKind.vorname': 'Lina',
        'anlKind.familienkasse': 'Familienkasse Sachsen',
        'anlKind.inlandVon': '01.01.2025',
        'anlKind.inlandBis': '31.12.2025',
        'anlKind.kz02': '1',
        'anlKind.kz03': '1',
      })
      expect(instances!['anlage-kind']![0]!['anlKind.nachname']).toBeUndefined()
    })

    it('a different family name is printed; a child born in the year lives here from its birth', () => {
      const { instances } = printoutValues({ ...JOINT, kinder: [{ ...KIND, lastName: 'Muster', geburtsdatum: '2025-08-04' }] })
      expect(instances!['anlage-kind']![0]).toMatchObject({ 'anlKind.nachname': 'Muster', 'anlKind.inlandVon': '04.08.2025' })
    })

    it('missing details block the printout as "kinder"', () => {
      for (const gap of [{ taxId: null }, { kinship: null }, { familyBenefitsOffice: null }, { domesticResidenceAllYear: null }]) {
        expect(printoutValues({ ...JOINT, kinder: [{ ...KIND, ...gap }] }).missing).toEqual(['kinder'])
      }
    })

    it('cases the printout cannot cover yet are named, never printed half', () => {
      expect(printoutValues({ ...JOINT, kinder: [{ ...KIND, domesticResidenceAllYear: false }] }).missing).toEqual(['anlageKindAusland'])
      expect(printoutValues({ ...JOINT, kinder: [{ ...KIND, geburtsdatum: '2007-02-01' }] }).missing).toEqual(['anlageKindVolljaehrig'])
      expect(printoutValues({ ...JOINT, kinder: [KIND, { ...KIND, domesticResidenceAllYear: false }, { ...KIND, domesticResidenceAllYear: false }] }).missing).toEqual(['anlageKindAusland'])
    })

    it('prints Swiss family allowance plus Differenzkindergeld in Zeile 6 (Kz 15, ADR-0054, #414)', () => {
      const { instances, missing } = printoutValues({
        ...JOINT,
        kinder: [{ ...KIND, swissFamilyAllowanceEur: '2748' }],
      })
      expect(missing).toEqual([])
      // 2025: 255 * 12 = 3060 total claim
      expect(instances!['anlage-kind']![0]).toMatchObject({
        'anlKind.kindergeld': '3060',
      })
    })

    it('prints higher Swiss family allowance in Zeile 6 when exceeding German Kindergeld', () => {
      const { instances } = printoutValues({
        ...JOINT,
        kinder: [{ ...KIND, swissFamilyAllowanceEur: '3500' }],
      })
      expect(instances!['anlage-kind']![0]).toMatchObject({
        'anlKind.kindergeld': '3500',
      })
    })
  })

  describe('Anlage Kind — the other parent outside this return (Zeilen 11–15)', () => {
    const CHILD_SOLE = {
      firstName: 'Lina',
      lastName: 'Beispiel',
      geburtsdatum: '2016-03-10',
      taxId: '11111111111',
      childBenefitClaimEur: '3060',
      kinship: '1',
      kinshipB: null,
      familyBenefitsOffice: 'Familienkasse Sachsen',
      domesticResidenceAllYear: true,
      otherParent: 'Inland',
      otherParentName: 'Muster, Max',
      otherParentBirthDate: '1984-02-11',
      otherParentAddress: 'Hauptstraße 3, 01067 Dresden',
      otherParentKind: '1',
      otherParentDiedOn: null,
    }
    const annex = (facts: PrintoutFacts) => printoutValues(facts).instances!['anlage-kind']![0]!

    it('a single parent prints the other parent with the year as the relationship period', () => {
      expect(printoutValues({ ...FACTS, kinder: [CHILD_SOLE] }).missing).toEqual([])
      expect(annex({ ...FACTS, kinder: [CHILD_SOLE] })).toMatchObject({
        'anlKind.aeName': 'Muster, Max',
        'anlKind.aeGeburtsdatum': '11.02.1984',
        'anlKind.aeVon': '01.01.2025',
        'anlKind.aeBis': '31.12.2025',
        'anlKind.aeAdresse': 'Hauptstraße 3, 01067 Dresden',
        'anlKind.aeArt': '1',
      })
    })

    it('a deceased parent ends the period at the date of death (Zeile 14, Kz 06)', () => {
      const values = annex({ ...FACTS, kinder: [{ ...CHILD_SOLE, otherParent: 'Verstorben', otherParentDiedOn: '2025-06-30' }] })
      expect(values).toMatchObject({ 'anlKind.kz06': '30.06.2025', 'anlKind.aeBis': '30.06.2025' })
    })

    it('a parent who cannot be ascertained is Zeile 15 alone (Kz 05 = 1)', () => {
      const facts = { ...FACTS, kinder: [{ ...CHILD_SOLE, otherParent: 'Unbekannt', otherParentName: null, otherParentBirthDate: null, otherParentAddress: null, otherParentKind: null }] }
      expect(printoutValues(facts).missing).toEqual([])
      expect(annex(facts)['anlKind.kz05']).toBe('1')
      expect(annex(facts)['anlKind.aeName']).toBeUndefined()
    })

    it('missing details block as "kinder"; a parent abroad (Zeile 13) is named as not printable yet', () => {
      expect(printoutValues({ ...FACTS, kinder: [{ ...CHILD_SOLE, otherParent: null }] }).missing).toEqual(['kinder'])
      expect(printoutValues({ ...FACTS, kinder: [{ ...CHILD_SOLE, otherParentAddress: null }] }).missing).toEqual(['kinder'])
      expect(printoutValues({ ...FACTS, kinder: [{ ...CHILD_SOLE, otherParent: 'Verstorben' }] }).missing).toEqual(['kinder'])
      expect(printoutValues({ ...FACTS, kinder: [{ ...CHILD_SOLE, otherParent: 'Ausland' }] }).missing).toEqual(['anlageKindAndererElternteilAusland'])
    })

    it('in a joint return where both are parents, the other-parent lines stay empty', () => {
      const joint: PrintoutFacts = {
        ...FACTS,
        masterData: { ...FACTS.masterData!, familienstand: 'verheiratet', familienstandSeit: '2015-05-15' },
        link: { filingType: 'zusammen', personB: { firstName: 'Bernd', lastName: 'Beispiel', steuerId: '12345678902', geburtsdatum: '1988-11-20', religion: 'VD', beruf: 'Lehrer' } },
        kinder: [{ ...CHILD_SOLE, kinshipB: '1' }],
      }
      expect(Object.keys(annex(joint)).filter((id) => id.startsWith('anlKind.ae'))).toEqual([])
    })
  })

  describe('Entlastungsbetrag für Alleinerziehende (Anlage Kind Zeilen 45–48)', () => {
    const KIND = {
      firstName: 'Lina',
      lastName: 'Beispiel',
      geburtsdatum: '2016-03-10',
      taxId: '11111111111',
      kinship: '1',
      familyBenefitsOffice: 'Familienkasse Sachsen',
      domesticResidenceAllYear: true,
      otherParent: 'Unbekannt',
      registeredWithMeAllYear: true,
      childBenefitToMeAllYear: true,
    }
    const SINGLE_PARENT: PrintoutFacts = { ...FACTS, singleParent: { otherPerson: 'Nein', householdCommunity: 'Nein' } }
    const ae = (facts: PrintoutFacts) => {
      const values = printoutValues(facts).instances!['anlage-kind']![0]!
      return Object.fromEntries(Object.entries(values).filter(([id]) => /anlKind\.kz4[2469]/.test(id)))
    }

    it('claims it for the year when the child lived and got Kindergeld with a single parent alone', () => {
      expect(ae({ ...SINGLE_PARENT, kinder: [KIND] })).toEqual({
        'anlKind.kz42Von': '01.01.2025',
        'anlKind.kz42Bis': '31.12.2025',
        'anlKind.kz44Von': '01.01.2025',
        'anlKind.kz44Bis': '31.12.2025',
        'anlKind.kz46': '2',
        'anlKind.kz49': '2',
      })
      expect(ae({ ...SINGLE_PARENT, kinder: [{ ...KIND, geburtsdatum: '2025-05-02' }] })['anlKind.kz42Von']).toBe('02.05.2025')
    })

    it('claims nothing when a condition fails or is unanswered — never a guessed period', () => {
      expect(ae({ ...SINGLE_PARENT, singleParent: { otherPerson: 'Ja', householdCommunity: 'Nein' }, kinder: [KIND] })).toEqual({})
      expect(ae({ ...SINGLE_PARENT, singleParent: { otherPerson: 'Nein', householdCommunity: null }, kinder: [KIND] })).toEqual({})
      expect(ae({ ...FACTS, kinder: [KIND] })).toEqual({})
      expect(ae({ ...SINGLE_PARENT, kinder: [{ ...KIND, childBenefitToMeAllYear: false }] })).toEqual({})
      const married = { ...SINGLE_PARENT, masterData: { ...FACTS.masterData!, familienstand: 'verheiratet' }, link: { filingType: 'einzel' as const } }
      expect(ae({ ...married, kinder: [KIND] })).toEqual({})
    })
  })

  it('creates multi-instance values for children and rental properties', () => {
    const res = printoutValues({
      ...FACTS,
      kinder: [
        { sequenceNumber: '1', firstName: 'Lina', lastName: 'Beispiel', geburtsdatum: '2015-03-10', taxId: '11111111111', childBenefitClaimEur: '3000' },
        { sequenceNumber: '2', firstName: 'Noah', lastName: 'Beispiel', geburtsdatum: '2018-07-22', taxId: '22222222222', childBenefitClaimEur: '3000' },
      ],
      rental: [
        {
          sequenceNumber: '1',
          strasse: 'Schulstraße 4',
          plz: '01067',
          city: 'Dresden',
          livingArea: '75',
          mieteinnahmen: '9600',
          anschaffungskosten: '150000',
          baujahr: '1995',
          werbungskosten: '1200',
          depreciationAsLastYear: true,
        },
      ],
    })
    expect(res.instances).toBeDefined()
    const instances = res.instances!
    expect(instances['anlage-kind']).toHaveLength(2)
    expect(instances['anlage-kind']![0]).toMatchObject({
      'anlKind.vorname': 'Lina',
      'anlKind.geburtsdatum': '10.03.2015',
      'anlKind.idnr': '11111111111',
      'anlKind.kindergeld': '3000',
      'anlKind.lfdNr': '1',
    })
    expect(instances['anlage-kind']![1]).toMatchObject({
      'anlKind.vorname': 'Noah',
      'anlKind.geburtsdatum': '22.07.2018',
      'anlKind.idnr': '22222222222',
      'anlKind.kindergeld': '3000',
      'anlKind.lfdNr': '2',
    })
    expect(instances['anlage-v']).toHaveLength(1)
    expect(instances['anlage-v']![0]).toMatchObject({
      'anlV.strasse': 'Schulstraße 4',
      'anlV.plz': '01067',
      'anlV.ort': 'Dresden',
      'anlV.wohnflaeche': '75',
      'anlV.z13Miete': '9600',
    })
  })

  describe('Anlage V', () => {
    const PROPERTY = {
      strasse: 'Schulstraße 4',
      plz: '01067',
      city: 'Dresden',
      livingArea: '75',
      mieteinnahmen: '9600',
      anschaffungskosten: '150000',
      baujahr: '1995',
      werbungskosten: '1200',
      depreciationAsLastYear: true,
    }
    const v = (property: Partial<typeof PROPERTY> & Record<string, unknown>) =>
      printoutValues({ ...FACTS, rental: [{ ...PROPERTY, ...property } as never] })

    it('rents go into the amount column of Zeile 13 and the sums, never a text box', () => {
      expect(v({}).instances!['anlage-v']![0]).toMatchObject({
        'anlV.z13Wohnflaeche': '75',
        'anlV.z13Miete': '9600',
        'anlV.kz01': '9600',
        'anlV.z32Einnahmen': '9600',
      })
    })

    it('the AfA fills Zeile 33 (linear, rate, wie Vorjahr, amount) and Kz 30', () => {
      expect(v({}).instances!['anlage-v']![0]).toMatchObject({
        'anlV.z33Linear': '1',
        'anlV.z33Satz': '2',
        'anlV.z33WieVorjahr': '1',
        'anlV.z33Afa': '3000',
        'anlV.kz30': '3000',
      })
      expect(v({ baujahr: '1910', anschaffungskosten: '100000' }).instances!['anlage-v']![0]!['anlV.z33Satz']).toBe('2,5')
    })

    it('the sum of Werbungskosten includes the AfA; Zeilen 85/86 always carry the result', () => {
      expect(v({}).instances!['anlage-v']![0]).toMatchObject({
        'anlV.z80Text': 'Laufende Werbungskosten',
        'anlV.z80Betrag': '1200',
        'anlV.kz49': '1200',
        'anlV.werbungskostenSumme': '4200',
        'anlV.ueberschuss': '5400',
        'anlV.kz20': '5400',
      })
      expect(v({ mieteinnahmen: '2000' }).instances!['anlage-v']![0]).toMatchObject({ 'anlV.ueberschuss': '-2200', 'anlV.kz20': '-2200' })
    })

    it('without building data there is no AfA line, and no "wie Vorjahr" question', () => {
      const res = v({ anschaffungskosten: null as never, baujahr: null as never, depreciationAsLastYear: null as never })
      expect(res.missing).toEqual([])
      expect(Object.keys(res.instances!['anlage-v']![0]!).filter((id) => id.startsWith('anlV.z33'))).toEqual([])
      expect(res.instances!['anlage-v']![0]!['anlV.werbungskostenSumme']).toBe('1200')
    })

    it('missing or unreadable facts block as "vermietung"; a changed AfA is named as not printable yet', () => {
      expect(v({ mieteinnahmen: null as never }).missing).toEqual(['vermietung'])
      expect(v({ werbungskosten: null as never }).missing).toEqual(['vermietung'])
      expect(v({ baujahr: 'unklar' }).missing).toEqual(['vermietung'])
      expect(v({ city: null as never }).missing).toEqual(['vermietung'])
      expect(v({ depreciationAsLastYear: null as never }).missing).toEqual(['vermietung'])
      expect(v({ depreciationAsLastYear: false }).missing).toEqual(['anlageVAfaNeu'])
    })
  })
})

describe('rendereVordrucke (real templates)', () => {
  it('the measured positions belong to exactly the pinned templates', () => {
    for (const [formular, sha256] of Object.entries(felder2025.vorlagen)) {
      expect(sha256).toBe((manifest as Record<string, { sha256: string }>)[formular]!.sha256)
      expect(createHash('sha256').update(readFileSync(new URL(`${formular}.pdf`, TEMPLATES))).digest('hex')).toBe(sha256)
    }
  })

  it('the printout carries no form field — the values are fixed page content', async () => {
    const pdf = await renderForms(FIELD_SETS[2025]!, printoutValues(FACTS).values, { templatesDirectory: TEMPLATES })
    expect((await PDFDocument.load(pdf)).getForm().getFields()).toHaveLength(0)
  })

  it('the editable variant keeps one named AcroForm field per value, instances numbered', async () => {
    const res = printoutValues({
      ...FACTS,
      kinder: [
        { firstName: 'Lina', lastName: 'Beispiel', geburtsdatum: '2016-01-01', taxId: '12345678901' },
        { firstName: 'Noah', lastName: 'Beispiel', geburtsdatum: '2018-01-01', taxId: '22222222222' },
      ],
    })
    const pdf = await renderForms(FIELD_SETS[2025]!, res.values, { templatesDirectory: TEMPLATES, instances: res.instances, editable: true })
    const form = (await PDFDocument.load(pdf)).getForm()
    expect(form.getTextField('est1a.name').getText()).toBe('Beispiel')
    expect(form.getTextField('anlN.kz110').getText()).toBe('42000')
    expect(form.getTextField('anlKind.vorname').getText()).toBe('Lina')
    expect(form.getTextField('anlKind.vorname#2').getText()).toBe('Noah')
  })

  it('hands out every page of each used form: ESt 1 A (2) + Anlage N (4)', async () => {
    const pdf = await renderForms(FIELD_SETS[2025]!, printoutValues(FACTS).values, { templatesDirectory: TEMPLATES })
    const document = await PDFDocument.load(pdf)
    expect(document.getPageCount()).toBe(6)
    // DIN A4 portrait, unscaled (BMF: < 5 % deviation allowed, we keep 0).
    const { width, height } = document.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
  })

  it('with a pension, Anlage R follows Anlage N: 2 + 4 + 2 pages', async () => {
    const { values } = printoutValues({ ...FACTS, pension: { rentenart: 'GesetzlicheRente', jahresbetrag: '14400' } })
    const pdf = await renderForms(FIELD_SETS[2025]!, values, { templatesDirectory: TEMPLATES })
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(8)
  })

  it('without Anlage N entries only the Hauptvordruck is handed out', async () => {
    const { values } = printoutValues({ ...FACTS, bruttoarbeitslohn: null })
    const pdf = await renderForms(FIELD_SETS[2025]!, values, { templatesDirectory: TEMPLATES })
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2)
  })

  it('refuses a value that does not fit its box instead of shrinking below 10 pt', async () => {
    const tooLong = { 'est1a.religion': 'VIEL ZU LANG FÜR DAS FELD' }
    await expect(renderForms(FIELD_SETS[2025]!, tooLong, { templatesDirectory: TEMPLATES })).rejects.toBeInstanceOf(
      OverflowError,
    )
  })

  it('refuses an unknown field id (a typo must not vanish silently)', async () => {
    await expect(
      renderForms(FIELD_SETS[2025]!, { 'est1a.gibtsnicht': 'x' }, { templatesDirectory: TEMPLATES }),
    ).rejects.toThrow(/Unbekannte Feld-IDs/)
  })

  // Every fact the printout knows, filled to the last optional detail, in both household shapes:
  // a field id the mapping writes but nobody measured would only surface as a 500 after payment.
  const CHILD_FULL = {
    firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2016-01-01', taxId: '12345678901', childBenefitClaimEur: '3060',
    kinship: '1', kinshipB: '1', familyBenefitsOffice: 'Familienkasse Sachsen', domesticResidenceAllYear: true,
    otherParent: 'Verstorben', otherParentName: 'Muster, Max', otherParentBirthDate: '1984-02-11',
    otherParentAddress: 'Hauptstraße 3, 01067 Dresden', otherParentKind: '1', otherParentDiedOn: '2025-06-30',
    registeredWithMeAllYear: true, childBenefitToMeAllYear: true,
  }
  const ALL_FACTS: PrintoutFacts = {
    ...FACTS,
    pension: { rentenart: 'GesetzlicheRente', jahresbetrag: '12000' },
    capital: { depot: 'deutscher-broker', kapitalertraege: '1000', sparerPauschbetrag: '1000', kapitalertragsteuer: '0', solidaritaetszuschlag: '0', kirchensteuer: '0' },
    chSalaryCertificate: {
      status: 'echter-grenzgaenger', rate: 1.065, grossWageChf: '50000', ahvContributionsChf: '3300', withholdingTaxChf: '2250',
      arbeitgeberName: 'Muster AG', arbeitgeberStrasse: 'Bahnhofstrasse 1', arbeitgeberPlzOrt: '4051 Basel',
      familienzulagenChf: '0', krankentaggeldChf: '150', pkArbeitnehmerChf: '2500', pkArbeitgeberChf: '3000', specialCases: false,
      pkArbeitnehmerGesamtChf: null, pkArbeitgeberGesamtChf: null, steuerfreiesKrankentaggeldChf: null,
      krankentaggeldArbeitgeberProzent: '0', krankentaggeldArbeitgeberChf: null, nbuvArbeitgeberProzent: '0', nbuvArbeitgeberChf: null,
    },
    specialExpenses: { donations: '200' },
    riester: { kind: 'Unmittelbar', incomeLastYear: '40000' },
    singleParent: { otherPerson: 'Nein', householdCommunity: 'Nein' },
    kinder: [CHILD_FULL, { ...CHILD_FULL, otherParent: 'Unbekannt' }],
    rental: [
      { strasse: 'Musterweg 1', plz: '10115', city: 'Berlin', livingArea: '60', mieteinnahmen: '8000', anschaffungskosten: '100000', baujahr: '2000', werbungskosten: '500', depreciationAsLastYear: true },
    ],
  }
  const MARRIED: PrintoutFacts = {
    ...ALL_FACTS,
    masterData: { ...FACTS.masterData!, familienstand: 'verheiratet', familienstandSeit: '2015-05-15' },
    link: {
      filingType: 'zusammen',
      personB: {
        firstName: 'Bernd', lastName: 'Beispiel', steuerId: '12345678902', geburtsdatum: '1988-11-20', religion: 'VD', beruf: 'Lehrer',
        bruttoarbeitslohn: '54000', pension: { rentenart: 'GesetzlicheRente', jahresbetrag: '9000' },
      },
    },
    capital: { depot: 'auslaendischer-broker', kapitalertraege: '800', sparerPauschbetrag: '200' },
    riester: { kind: 'Mittelbar', incomeLastYear: null },
  }

  for (const [fall, facts] of [['single parent', ALL_FACTS], ['joint return', MARRIED]] as const) {
    it(`renders every field the mapping writes — ${fall}, all facts`, async () => {
      const res = printoutValues(facts)
      const pdf = await renderForms(FIELD_SETS[2025]!, res.values, { templatesDirectory: TEMPLATES, instances: res.instances })
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(15)
    })
  }
})
