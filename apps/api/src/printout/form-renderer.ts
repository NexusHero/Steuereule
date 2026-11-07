import { readFile } from 'node:fs/promises'
import { PDFDocument, rgb, StandardFonts, TextAlignment, type PDFFont, type PDFForm, type PDFPage } from 'pdf-lib'
import felder2025 from './felder-2025.json' with { type: 'json' }

const templateBytesCache = new Map<string, Promise<Uint8Array>>()

function loadTemplateBytes(url: URL): Promise<Uint8Array> {
  const key = url.href
  const cached = templateBytesCache.get(key)
  if (cached) return cached
  const pending = readFile(url).then(
    (buffer) => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    (error: unknown) => {
      templateBytesCache.delete(key)
      throw error
    },
  )
  templateBytesCache.set(key, pending)
  return pending
}

export type FieldKind = 'text' | 'euro' | 'euroCent' | 'kreuz'

export interface Field {
  id: string
  formular: string
  seite: number
  art: string
  kasten: { x: number; y: number; breite: number; hoehe: number }
  textAb?: number
}

export interface FieldSet {
  jahr: number
  vorlagen: Record<string, string>
  felder: Field[]
}

export type FieldValues = Readonly<Record<string, string | true>>

const FONT_SIZE = 10
const INNER_PADDING = 3

const ORDER = [
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

export const FIELD_SETS: Readonly<Record<number, FieldSet>> = { 2025: felder2025 as FieldSet }

/** Writes field values onto the checked-in Vordruck templates. */
export class OverflowError extends Error {
  constructor(readonly fields: string[]) {
    super(`Wert passt nicht in sein Feld: ${fields.join(', ')}`)
  }
}

export interface RendererOptions {
  templatesDirectory: URL
  instances?: Record<string, readonly FieldValues[]> | undefined
  editable?: boolean | undefined
}

export async function renderForms(fieldSet: FieldSet, values: FieldValues, options: RendererOptions): Promise<Uint8Array> {
  const known = new Map(fieldSet.felder.map((field) => [field.id, field]))
  const allValues = [values, ...Object.values(options.instances ?? {}).flat()]
  const unknown = allValues.flatMap((w) => Object.keys(w)).filter((id) => !known.has(id))
  if (unknown.length > 0) throw new Error(`Unbekannte Feld-IDs: ${[...new Set(unknown)].join(', ')}`)

  const output = await PDFDocument.create()
  const font = await output.embedFont(StandardFonts.Helvetica)
  const form = options.editable ? output.getForm() : null
  const overflows: string[] = []
  const instanceNumber = new Map<string, number>()

  for (const formular of ORDER) {
    const listInstances = options.instances?.[formular]
    const instancesToRender: readonly FieldValues[] =
      listInstances && listInstances.length > 0
        ? listInstances
        : [values]

    for (const instanceValues of instancesToRender) {
      const fields = fieldSet.felder.filter((field) => field.formular === formular && instanceValues[field.id] !== undefined)
      if (fields.length === 0 && formular !== 'est-1-a') continue
      const number = (instanceNumber.get(formular) ?? 0) + 1
      instanceNumber.set(formular, number)
      const templateBytes = await loadTemplateBytes(new URL(`${formular}.pdf`, options.templatesDirectory))
      const template = await PDFDocument.load(templateBytes)
      const pages = await output.copyPages(template, template.getPageIndices())
      pages.forEach((page, index) => {
        output.addPage(page)
        for (const field of fields.filter((f) => f.seite === index + 1)) {
          const value = instanceValues[field.id]!
          const situation = place(font, field, value)
          if (situation === null) overflows.push(field.id)
          else if (form) setFormField(form, page, font, field, number === 1 ? field.id : `${field.id}#${number}`, value)
          else page.drawText(situation.text, { x: situation.x, y: situation.baseline, size: FONT_SIZE, font, color: rgb(0, 0, 0) })
        }
      })
    }
  }

  if (overflows.length > 0) throw new OverflowError(overflows)
  form?.updateFieldAppearances(font)
  output.setCreator('SteuerEule')
  output.setProducer('SteuerEule')
  return output.save()
}

const isAmount = (field: Field) => field.art === 'euro' || field.art === 'euroCent'

function place(font: PDFFont, field: Field, value: string | true): { text: string; x: number; baseline: number } | null {
  const { x, y, breite, hoehe } = field.kasten
  const baseline = y + (hoehe - font.heightAtSize(FONT_SIZE, { descender: false })) / 2
  const text = value === true ? 'X' : value
  const textWidth = font.widthOfTextAtSize(text, FONT_SIZE)
  const links = field.textAb ?? x + INNER_PADDING
  const right = x + breite - INNER_PADDING
  const start = value === true ? x + (breite - textWidth) / 2 : isAmount(field) ? right - textWidth : links
  if (start < x || start + textWidth > x + breite) return null
  return { text, x: start, baseline }
}

function setFormField(form: PDFForm, page: PDFPage, font: PDFFont, field: Field, name: string, value: string | true): void {
  const { x, y, breite, hoehe } = field.kasten
  const links = field.textAb ?? x
  const textField = form.createTextField(name)
  textField.setText(value === true ? 'X' : value)
  textField.setAlignment(value === true ? TextAlignment.Center : isAmount(field) ? TextAlignment.Right : TextAlignment.Left)
  textField.addToPage(page, { x: links, y, width: x + breite - links, height: hoehe, font, textColor: rgb(0, 0, 0), borderWidth: 0 })
  textField.setFontSize(FONT_SIZE)
}
