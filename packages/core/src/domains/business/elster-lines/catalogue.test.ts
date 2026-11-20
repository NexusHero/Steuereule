import { describe, expect, it } from 'vitest'
import { EUER_KEYS } from '../euer-keys'
import { EUER_KEY_LINES, elsterLinesFor, euerLineFor } from './catalogue'
import { ELSTER_FORMS, ELSTER_YEARS, type ElsterForm, type ElsterLine, type ElsterYear } from './types'

function lines(form: ElsterForm, year: ElsterYear): readonly ElsterLine[] {
  const result = elsterLinesFor(form, year)
  if (result.status !== 'published') throw new Error(`${form} ${year} is ${result.status}`)
  return result.lines
}

const byKz = (form: ElsterForm, year: ElsterYear, kz: string) => lines(form, year).find((l) => l.kennzahlen.includes(kz))
const byId = (form: ElsterForm, year: ElsterYear, id: string) => lines(form, year).find((l) => l.id === id)

describe('publication status', () => {
  it('has the Anlage EÜR and the USt 2 A for every year 2022 to 2026', () => {
    for (const year of ELSTER_YEARS) {
      expect(elsterLinesFor('anlage-euer', year).status).toBe('published')
      expect(elsterLinesFor('ust-2-a', year).status).toBe('published')
    }
  })

  it('says the 2026 Hauptvordruck and Anlage Sonstiges are not published yet and points to 2025', () => {
    expect(elsterLinesFor('est-1-a', 2026)).toEqual({ status: 'not_published', latestPublishedYear: 2025 })
    expect(elsterLinesFor('anlage-sonstiges', 2026)).toEqual({ status: 'not_published', latestPublishedYear: 2025 })
  })

  it('says Anlage G and Anlage S have no official source', () => {
    for (const form of ['anlage-g', 'anlage-s'] as const) {
      for (const year of ELSTER_YEARS) expect(elsterLinesFor(form, year)).toEqual({ status: 'not_available', reason: 'electronic_only' })
    }
  })

  it('names the source PDF and its hash for a published year', () => {
    const result = elsterLinesFor('anlage-euer', 2025)
    if (result.status !== 'published') throw new Error('expected published')
    expect(result.source.url).toContain('2025-08-29-anlage-EUER-2025.pdf')
    expect(result.source.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('catalogue integrity', () => {
  it('has unique ids within every form and year', () => {
    for (const form of ELSTER_FORMS) {
      for (const year of ELSTER_YEARS) {
        const result = elsterLinesFor(form, year)
        if (result.status !== 'published') continue
        const ids = result.lines.map((l) => l.id)
        expect(new Set(ids).size, `${form} ${year}`).toBe(ids.length)
        const zeilen = result.lines.map((l) => l.zeile).filter((z) => z !== null)
        expect(new Set(zeilen).size, `${form} ${year} Zeilen`).toBe(zeilen.length)
        for (const l of result.lines) expect(l.label.length, `${form} ${year} ${l.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('maps every EÜR key to a line in every published year', () => {
    for (const year of ELSTER_YEARS) {
      for (const key of EUER_KEYS) {
        const result = euerLineFor(key, year)
        expect(result.status, `${key} ${year}`).toBe('published')
        if (result.status === 'published') expect(result.line.euerKeys).toContain(key)
      }
    }
  })

  it('lists a mapping for every EÜR key', () => {
    expect(Object.keys(EUER_KEY_LINES).sort()).toEqual([...EUER_KEYS].sort())
  })

  it('takes the Arbeitszimmer line for the Tagespauschale before the form had its own line', () => {
    const own = euerLineFor('beschraenkt_arbeitszimmer_tagespauschale', 2025)
    const before = euerLineFor('beschraenkt_arbeitszimmer_tagespauschale', 2023)
    expect(own.status === 'published' && own.line.kennzahlen).toEqual(['163'])
    expect(before.status === 'published' && before.line.kennzahlen).toEqual(['162', '172'])
  })
})

// Spot checks against the PDFs (Zeile, Kennzahl and label read in the official form of each year).
describe('Anlage EÜR lines as printed', () => {
  it.each([
    [2022, '280', '49', 'Aufwendungen für Telekommunikation (z. B. Telefon, Internet)'],
    [2022, '219', '109', 'Steuerpflichtiger Gewinn/Verlust'],
    [2023, '162', '63', 'Aufwendungen für die Tätigkeit in der häuslichen Wohnung (siehe Anleitung)'],
    [2023, '199', '72', 'Summe Betriebsausgaben (Übertrag in Zeile 74)'],
    [2024, '280', '43', 'Aufwendungen für Telekommunikation (z. B. Telefon, Internet)'],
    [2024, '163', '66', 'Tagespauschale für die Tätigkeit in der häuslichen Wohnung (siehe Anleitung)'],
    [2025, '112', '15', 'Umsatzsteuerpflichtige Betriebseinnahmen (ohne solche zum ermäßigten Steuersatz von 0 %)'],
    [2025, '219', '97', 'Steuerpflichtiger Gewinn/Verlust'],
    [2026, '280', '44', 'Aufwendungen für Telekommunikation (z. B. Telefon, Internet)'],
    [2026, '219', '98', 'Steuerpflichtiger Gewinn/Verlust'],
  ] as const)('%i Kz %s is Zeile %s', (year, kz, zeile, label) => {
    expect(byKz('anlage-euer', year, kz)).toMatchObject({ zeile, label })
  })

  it('keeps both Kennzahlen of a two-column line, nicht abziehbar first', () => {
    expect(byKz('anlage-euer', 2025, '164')).toMatchObject({ zeile: '62', label: 'Geschenke', kennzahlen: ['164', '174'] })
  })

  it('gives lines without a Kennzahl a label-based id', () => {
    expect(byId('anlage-euer', 2025, 'euer.einnahmen.aufloesung-ruecklagen')).toMatchObject({
      zeile: '22',
      kennzahlen: [],
      label: 'Auflösung von Rücklagen und/oder Ausgleichsposten (Übertrag aus Zeile 105)',
    })
  })
})

describe('USt 2 A lines as printed', () => {
  it.each([
    [2022, '38'],
    [2023, '22'],
    [2024, '22'],
    [2025, '22'],
    [2026, '24'],
  ] as const)('%i: Umsätze zu 19 %% in Zeile %s (Kz 177)', (year, zeile) => {
    expect(byId('ust-2-a', year, 'ust.umsatz-19')).toMatchObject({ zeile, kennzahlen: ['177'], label: expect.stringMatching(/^(a\) )?Lieferungen und sonstige Leistungen zu 19 %$/) })
  })

  it.each([
    [2022, '168'],
    [2023, '118'],
    [2024, '118'],
    [2025, '119'],
    [2026, '125'],
  ] as const)('%i: Vorauszahlungssoll in Zeile %s', (year, zeile) => {
    expect(byId('ust-2-a', year, 'ust.vorauszahlungssoll')).toMatchObject({ zeile, label: `Vorauszahlungssoll ${year} (einschließlich Sondervorauszahlung)` })
  })

  it('has the § 13b lines as recipient and the Vorsteuer from invoices', () => {
    expect(byId('ust-2-a', 2025, 'ust.13b-andere-leistungen')).toMatchObject({ zeile: '67', kennzahlen: ['877', '878'] })
    expect(byId('ust-2-a', 2025, 'ust.vorsteuer-rechnungen')).toMatchObject({
      zeile: '79',
      kennzahlen: ['320'],
      label: 'Vorsteuerbeträge aus Rechnungen von anderen Unternehmern (§ 15 Absatz 1 Satz 1 Nummer 1 UStG)',
    })
  })

  it('has the Kleinunternehmer lines of each regime', () => {
    expect(byId('ust-2-a', 2024, 'ust.kleinunternehmer-umsatz-jahr')).toMatchObject({ zeile: '21', kennzahlen: ['239'] })
    expect(byId('ust-2-a', 2025, 'ust.kleinunternehmer-umsatz-jahr')).toBeUndefined()
    expect(byId('ust-2-a', 2025, 'ust.steuerfrei-kleinunternehmer')).toMatchObject({ zeile: '48', kennzahlen: ['236'] })
  })
})

describe('§ 10d lines', () => {
  it.each([
    [2022, '8'],
    [2023, '18'],
    [2024, '18'],
    [2025, '18'],
  ] as const)('%i: waiver of the Verlustrücktrag in Zeile %s of the Anlage Sonstiges (Kz 802)', (year, zeile) => {
    expect(byId('anlage-sonstiges', year, 'anlage-sonstiges.verzicht-verlustruecktrag')).toMatchObject({ zeile, kennzahlen: ['802'] })
  })

  it('has the declaration of the verbleibender Verlustvortrag in Zeile 2 of the Hauptvordruck', () => {
    for (const year of [2022, 2023, 2024, 2025] as const) {
      expect(byId('est-1-a', year, 'est-1-a.feststellung-verlustvortrag')).toMatchObject({
        zeile: '2',
        label: 'Erklärung zur Feststellung des verbleibenden Verlustvortrags',
      })
    }
  })
})

describe('Gewerbesteuererklärung from the ELSTER help', () => {
  it('has the fields 2022 to 2025 without Zeile and says 2026 is not published', () => {
    for (const year of [2022, 2023, 2024, 2025] as const) {
      const result = elsterLinesFor('gewst-1-a', year)
      if (result.status !== 'published') throw new Error(`gewst ${year} is ${result.status}`)
      expect(result.source.url).toContain(`help_gewst_ufa_20_${year}`)
      expect(result.lines.every((l) => l.zeile === null)).toBe(true)
      expect(byId('gewst-1-a', year, 'gewst.betriebsstaette')?.label).toBe('Angaben zur Betriebsstätte')
      expect(byId('gewst-1-a', year, 'gewst.hinzurechnung-entgelte-schulden')?.label).toBe('Entgelte für Schulden')
      expect(byId('gewst-1-a', year, 'gewst.kuerzung-grundbesitz-erweitert')?.label).toBe('Kürzung nach § 9 Nummer 1 Satz 2 GewStG')
    }
    expect(byId('gewst-1-a', 2022, 'gewst.gewinn')?.label).toBe('Gewinn aus Gewerbebetrieb')
    expect(byId('gewst-1-a', 2025, 'gewst.gewinn')?.label).toBe('Gewinn aus Gewerbebetrieb nach den Vorschriften des Einkommensteuergesetzes')
    expect(elsterLinesFor('gewst-1-a', 2026)).toEqual({ status: 'not_published', latestPublishedYear: 2025 })
  })
})
