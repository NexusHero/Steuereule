import { readFileSync } from 'node:fs'
import { PDFDocument, rgb, StandardFonts, TextAlignment, type PDFFont, type PDFForm, type PDFPage } from 'pdf-lib'
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

export type FeldWerte = Readonly<Record<string, string | true>>

const SCHRIFTGROESSE = 10
const INNENABSTAND = 3

const REIHENFOLGE = [
  'est-1-a',
  'anlage-n',
  'anlage-r',
  'anlage-kap',
  'anlage-n-gre',
  'anlage-v',
  'anlage-kind',
  'anlage-sonderausgaben',
  'anlage-av',
  'anlage-vorsorgeaufwand',
]

export const FELDSAETZE: Readonly<Record<number, Feldsatz>> = { 2025: felder2025 as Feldsatz }

/** Writes field values onto the checked-in Vordruck templates. */
export class UeberlaufFehler extends Error {
  constructor(readonly felder: string[]) {
    super(`Wert passt nicht in sein Feld: ${felder.join(', ')}`)
  }
}

export interface RendererOptionen {
  vorlagenVerzeichnis: URL
  instanzen?: Record<string, readonly FeldWerte[]> | undefined
  bearbeitbar?: boolean | undefined
}

export async function rendereVordrucke(feldsatz: Feldsatz, werte: FeldWerte, optionen: RendererOptionen): Promise<Uint8Array> {
  const bekannt = new Map(feldsatz.felder.map((feld) => [feld.id, feld]))
  const alleWerte = [werte, ...Object.values(optionen.instanzen ?? {}).flat()]
  const unbekannt = alleWerte.flatMap((w) => Object.keys(w)).filter((id) => !bekannt.has(id))
  if (unbekannt.length > 0) throw new Error(`Unbekannte Feld-IDs: ${[...new Set(unbekannt)].join(', ')}`)

  const ausgabe = await PDFDocument.create()
  const schrift = await ausgabe.embedFont(StandardFonts.Helvetica)
  const form = optionen.bearbeitbar ? ausgabe.getForm() : null
  const ueberlaeufe: string[] = []
  const instanzNummer = new Map<string, number>()

  for (const formular of REIHENFOLGE) {
    const listenInstanzen = optionen.instanzen?.[formular]
    const instanzenZuRendern: readonly FeldWerte[] =
      listenInstanzen && listenInstanzen.length > 0
        ? listenInstanzen
        : [werte]

    for (const instanzWerte of instanzenZuRendern) {
      const felder = feldsatz.felder.filter((feld) => feld.formular === formular && instanzWerte[feld.id] !== undefined)
      if (felder.length === 0 && formular !== 'est-1-a') continue
      const nummer = (instanzNummer.get(formular) ?? 0) + 1
      instanzNummer.set(formular, nummer)
      const vorlage = await PDFDocument.load(readFileSync(new URL(`${formular}.pdf`, optionen.vorlagenVerzeichnis)))
      const seiten = await ausgabe.copyPages(vorlage, vorlage.getPageIndices())
      seiten.forEach((seite, index) => {
        ausgabe.addPage(seite)
        for (const feld of felder.filter((f) => f.seite === index + 1)) {
          const wert = instanzWerte[feld.id]!
          const lage = platziere(schrift, feld, wert)
          if (lage === null) ueberlaeufe.push(feld.id)
          else if (form) setzeFormularfeld(form, seite, schrift, feld, nummer === 1 ? feld.id : `${feld.id}#${nummer}`, wert)
          else seite.drawText(lage.text, { x: lage.x, y: lage.grundlinie, size: SCHRIFTGROESSE, font: schrift, color: rgb(0, 0, 0) })
        }
      })
    }
  }

  if (ueberlaeufe.length > 0) throw new UeberlaufFehler(ueberlaeufe)
  form?.updateFieldAppearances(schrift)
  ausgabe.setCreator('SteuerEule')
  ausgabe.setProducer('SteuerEule')
  return ausgabe.save()
}

const istBetrag = (feld: Feld) => feld.art === 'euro' || feld.art === 'euroCent'

function platziere(schrift: PDFFont, feld: Feld, wert: string | true): { text: string; x: number; grundlinie: number } | null {
  const { x, y, breite, hoehe } = feld.kasten
  const grundlinie = y + (hoehe - schrift.heightAtSize(SCHRIFTGROESSE, { descender: false })) / 2
  const text = wert === true ? 'X' : wert
  const textbreite = schrift.widthOfTextAtSize(text, SCHRIFTGROESSE)
  const links = feld.textAb ?? x + INNENABSTAND
  const rechts = x + breite - INNENABSTAND
  const start = wert === true ? x + (breite - textbreite) / 2 : istBetrag(feld) ? rechts - textbreite : links
  if (start < x || start + textbreite > x + breite) return null
  return { text, x: start, grundlinie }
}

function setzeFormularfeld(form: PDFForm, seite: PDFPage, schrift: PDFFont, feld: Feld, name: string, wert: string | true): void {
  const { x, y, breite, hoehe } = feld.kasten
  const links = feld.textAb ?? x
  const textfeld = form.createTextField(name)
  textfeld.setText(wert === true ? 'X' : wert)
  textfeld.setAlignment(wert === true ? TextAlignment.Center : istBetrag(feld) ? TextAlignment.Right : TextAlignment.Left)
  textfeld.addToPage(seite, { x: links, y, width: x + breite - links, height: hoehe, font: schrift, textColor: rgb(0, 0, 0), borderWidth: 0 })
  textfeld.setFontSize(SCHRIFTGROESSE)
}
