// Writes field values onto the checked-in Vordruck templates (ADR-0050). The template pages
// are copied untouched — layout, form keys, barcodes and grey raster stay exactly as the tax
// administration printed them; only the values are added, following the BMF letter of
// 12.08.2022: sans-serif, 10 pt, decimal comma without thousands separator, empty fields
// stay empty, a form's every page is handed out, a form without any entry is not.
import { readFileSync } from 'node:fs'
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import felder2025 from './felder-2025.json' with { type: 'json' }

export type FeldArt = 'text' | 'euro' | 'euroCent' | 'kreuz'

export interface Feld {
  id: string
  formular: string
  seite: number
  art: string
  kasten: { x: number; y: number; breite: number; hoehe: number }
  textAb?: number
}

export interface Feldsatz {
  jahr: number
  vorlagen: Record<string, string>
  felder: Feld[]
}

/** A text value, or `true` to tick a box. */
export type FeldWerte = Readonly<Record<string, string | true>>

const SCHRIFTGROESSE = 10
const INNENABSTAND = 3

// Order in which forms are handed in: Hauptvordruck first, then the Anlagen.
const REIHENFOLGE = ['est-1-a', 'anlage-n', 'anlage-r']

export const FELDSAETZE: Readonly<Record<number, Feldsatz>> = { 2025: felder2025 as Feldsatz }

export class UeberlaufFehler extends Error {
  constructor(readonly felder: string[]) {
    super(`Wert passt nicht in sein Feld: ${felder.join(', ')}`)
  }
}

export interface RendererOptionen {
  /** Directory holding `<formular>.pdf` for the Feldsatz's year. */
  vorlagenVerzeichnis: URL
}

export async function rendereVordrucke(feldsatz: Feldsatz, werte: FeldWerte, optionen: RendererOptionen): Promise<Uint8Array> {
  const bekannt = new Map(feldsatz.felder.map((feld) => [feld.id, feld]))
  const unbekannt = Object.keys(werte).filter((id) => !bekannt.has(id))
  if (unbekannt.length > 0) throw new Error(`Unbekannte Feld-IDs: ${unbekannt.join(', ')}`)

  const ausgabe = await PDFDocument.create()
  const schrift = await ausgabe.embedFont(StandardFonts.Helvetica)
  const ueberlaeufe: string[] = []

  for (const formular of REIHENFOLGE) {
    const felder = feldsatz.felder.filter((feld) => feld.formular === formular && werte[feld.id] !== undefined)
    if (felder.length === 0 && formular !== 'est-1-a') continue
    const vorlage = await PDFDocument.load(readFileSync(new URL(`${formular}.pdf`, optionen.vorlagenVerzeichnis)))
    const seiten = await ausgabe.copyPages(vorlage, vorlage.getPageIndices())
    seiten.forEach((seite, index) => {
      ausgabe.addPage(seite)
      for (const feld of felder.filter((f) => f.seite === index + 1)) {
        if (!zeichne(seite, schrift, feld, werte[feld.id]!)) ueberlaeufe.push(feld.id)
      }
    })
  }

  if (ueberlaeufe.length > 0) throw new UeberlaufFehler(ueberlaeufe)
  ausgabe.setCreator('SteuerEule')
  ausgabe.setProducer('SteuerEule')
  return ausgabe.save()
}

/** false when the value does not fit — the BMF forbids shrinking below 10 pt. */
function zeichne(seite: PDFPage, schrift: PDFFont, feld: Feld, wert: string | true): boolean {
  const { x, y, breite, hoehe } = feld.kasten
  const grundlinie = y + (hoehe - schrift.heightAtSize(SCHRIFTGROESSE, { descender: false })) / 2
  const text = wert === true ? 'X' : wert
  const textbreite = schrift.widthOfTextAtSize(text, SCHRIFTGROESSE)
  const links = feld.textAb ?? x + INNENABSTAND
  const rechts = x + breite - INNENABSTAND
  let start: number
  if (wert === true) start = x + (breite - textbreite) / 2
  else if (feld.art === 'euro' || feld.art === 'euroCent') start = rechts - textbreite
  else start = links
  if (start < x || start + textbreite > x + breite) return false
  seite.drawText(text, { x: start, y: grundlinie, size: SCHRIFTGROESSE, font: schrift, color: rgb(0, 0, 0) })
  return true
}
