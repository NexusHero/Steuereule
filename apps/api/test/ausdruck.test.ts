// ADR-0050 — the Formular-Ausdruck: field values from stored facts, and the renderer
// against the real checked-in templates. Positions come from felder-2025.json, measured
// by scripts/vordrucke/vermessen.mjs — never typed by hand.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { ausdruckWerte, datumFuerVordruck, type AusdruckFakten } from '../src/ausdruck/ausdruck-werte.js'
import felder2025 from '../src/ausdruck/felder-2025.json' with { type: 'json' }
import manifest from '../src/ausdruck/vordrucke-2025.json' with { type: 'json' }
import { FELDSAETZE, rendereVordrucke, UeberlaufFehler } from '../src/ausdruck/vordruck-renderer.js'

const VORLAGEN = new URL('../assets/vordrucke/2025/', import.meta.url)

const FAKTEN: AusdruckFakten = {
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

  it('recorded Vermietung/Kapital/CH income without a printable Anlage blocks the printout, naming it', () => {
    const { fehlend } = ausdruckWerte({ ...FAKTEN, nochNichtDruckbar: ['anlageV', 'anlageKap', 'anlageNGre'] })
    expect(fehlend).toEqual(['anlageV', 'anlageKap', 'anlageNGre'])
  })

  it('formats dates with points, as the form asks', () => {
    expect(datumFuerVordruck('2025-12-31')).toBe('31.12.2025')
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
})
