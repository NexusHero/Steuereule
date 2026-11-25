import { readFile } from 'node:fs/promises'
import { PDFDocument, rgb, StandardFonts, TextAlignment, type PDFFont, type PDFForm, type PDFPage } from 'pdf-lib'
import felder2024 from './felder-2024.json' with { type: 'json' }
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
  'anlage-aussergewoehnliche-belastungen',
  'anlage-haushaltsnahe-aufwendungen',
  'anlage-av',
  'anlage-vorsorgeaufwand',
]

export const FORM_ORDER: readonly string[] = ORDER

export interface AcroFieldWidgetMeta {
  readonly id: string
  readonly pageIndex: number
  readonly rect: { x: number; y: number; width: number; height: number }
  readonly alignment: TextAlignment
}

/**
 * Extracts AcroForm widget rectangles, alignments and page indices directly from a pre-compiled
 * AcroForm Vordruck template (`assets/vordrucke-acroform/<jahr>/<formular>.pdf`). When the template
 * is a raw BMF PDF without pre-compiled AcroForm fields, returns an empty map so the caller falls
 * back to `felder-<jahr>.json`.
 */
export async function extractAcroFormWidgets(template: PDFDocument): Promise<ReadonlyMap<string, AcroFieldWidgetMeta>> {
  const form = template.getForm()
  const fields = form.getFields()
  if (fields.length === 0) return new Map()
  const pageRefs = template.getPages().map((p) => p.ref)
  const result = new Map<string, AcroFieldWidgetMeta>()
  for (const field of fields) {
    const id = field.getName()
    try {
      const tf = form.getTextField(id)
      const widget = tf.acroField.getWidgets()[0]
      if (!widget) continue
      const pageRef = widget.P()
      const pageIndex = pageRefs.findIndex((ref) => ref === pageRef)
      result.set(id, {
        id,
        pageIndex: pageIndex >= 0 ? pageIndex : 0,
        rect: widget.getRectangle(),
        alignment: tf.getAlignment() ?? TextAlignment.Left,
      })
    } catch {
      // Ignore non-text fields if any
    }
  }
  return result
}

/** Loads a single pre-compiled AcroForm Vordruck PDF for the live Power-User viewer. */
export async function loadAcroFormTemplateBytes(acroTemplatesDirectory: URL, formular: string): Promise<Uint8Array> {
  return loadTemplateBytes(new URL(`${formular}.pdf`, acroTemplatesDirectory))
}

export const FIELD_SETS: Readonly<Record<number, FieldSet>> = { 2024: felder2024 as FieldSet, 2025: felder2025 as FieldSet }

/**
 * Fields the app fills that a year's Vordruck does not have (ADR-0085): their values are left out for that
 * year instead of failing as unknown ids. Every other unknown id still fails, so a typo cannot hide.
 */
export const NOT_ON_FORM: Readonly<Record<number, readonly string[]>> = {
  // 2022 and 2023 are measured for the ELSTER fill-in help only (ADR-0101 §16), not printed (FIELD_SETS).
  2022: [
    'anlNGre.beruf',
    // The commute table of 2022 has one row per workplace instead of the 1/2 code of later years.
    'anlN.wegArt',
    'anlN.weg2Art',
    'anlNGre.wegArt',
    'anlNGre.weg2Art',
    // One „Sonstiges“ line in the Werbungskosten of the Anlage N-Gre 2022.
    'anlNGre.z58Text',
    'anlNGre.z58Eur',
    // The Anlage V 2022 asks for rents per storey, not per described unit, and has no detail text
    // beside Schuldzinsen and Sonstiges.
    'anlV.z13Bezeichnung',
    'anlV.z13Miete',
    'anlV.z13Wohnflaeche',
    'anlV.z46Text',
    'anlV.z80Text',
    // The page-2 head of the ESt 1 A 2022 is framed in a way vermessen.mjs cannot resolve; it repeats
    // the Steuernummer and is no line of its own.
    'est1a.kopfSeite2',
  ],
  2023: ['anlNGre.beruf'],
  2024: ['anlNGre.beruf'],
}

/** The values a year's forms can take: those of fields its Vordruck does not have are dropped. */
export function forYear<T extends Record<string, unknown>>(year: number, values: T): T {
  const absent = NOT_ON_FORM[year]
  if (!absent || absent.length === 0) return values
  return Object.fromEntries(Object.entries(values).filter(([id]) => !absent.includes(id))) as T
}

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

function assertKnownFields(fieldSet: FieldSet, values: FieldValues, instances: RendererOptions['instances']): void {
  const known = new Set(fieldSet.felder.map((field) => field.id))
  const allValues = [values, ...Object.values(instances ?? {}).flat()]
  const unknown = allValues.flatMap((w) => Object.keys(w)).filter((id) => !known.has(id))
  if (unknown.length > 0) throw new Error(`Unbekannte Feld-IDs: ${[...new Set(unknown)].join(', ')}`)
}

/** The copies of a Vordruck the printout prints: one per list instance, else one with the plain values. */
function copiesOf(formular: string, values: FieldValues, instances: RendererOptions['instances']): readonly FieldValues[] {
  const list = instances?.[formular]
  return list && list.length > 0 ? list : [values]
}

/** The box a field is printed into: the AcroForm widget's rectangle where the template has one. */
function resolveField(field: Field, widget: AcroFieldWidgetMeta | undefined): Field {
  return widget
    ? {
        ...field,
        kasten: { x: widget.rect.x, y: widget.rect.y, breite: widget.rect.width, hoehe: widget.rect.height },
        ...(field.textAb !== undefined ? { textAb: widget.rect.x } : {}),
      }
    : field
}

/** What the overflow check needs of a template: its page count and widget boxes, never the pages themselves. */
interface TemplateLayout {
  readonly pageCount: number
  readonly widgets: ReadonlyMap<string, AcroFieldWidgetMeta>
}

const templateLayoutCache = new Map<string, Promise<TemplateLayout>>()

function templateLayout(url: URL): Promise<TemplateLayout> {
  const key = url.href
  const cached = templateLayoutCache.get(key)
  if (cached) return cached
  const pending = loadTemplateBytes(url)
    .then((bytes) => PDFDocument.load(bytes))
    .then(async (template) => ({ pageCount: template.getPageCount(), widgets: await extractAcroFormWidgets(template) }))
  pending.catch(() => templateLayoutCache.delete(key))
  templateLayoutCache.set(key, pending)
  return pending
}

let measuringFont: Promise<PDFFont> | undefined

/** Helvetica's metrics, the same the printout embeds; a scratch document holds it once per process. */
function helveticaMetrics(): Promise<PDFFont> {
  measuringFont ??= PDFDocument.create().then((document) => document.embedFont(StandardFonts.Helvetica))
  return measuringFont
}

/**
 * The fields whose value does not fit its box at the printout's font size: the same `place` the renderer
 * applies, without copying a page or writing a PDF (API-6). The check before payment asks this on every
 * open of the screen; it rendered the whole return for it before. Template layouts are cached per process.
 */
export async function findOverflows(fieldSet: FieldSet, values: FieldValues, options: Pick<RendererOptions, 'templatesDirectory' | 'instances'>): Promise<string[]> {
  assertKnownFields(fieldSet, values, options.instances)
  const font = await helveticaMetrics()
  const overflows: string[] = []
  for (const formular of ORDER) {
    for (const copy of copiesOf(formular, values, options.instances)) {
      const fields = fieldSet.felder.filter((field) => field.formular === formular && copy[field.id] !== undefined)
      if (fields.length === 0) continue
      const layout = await templateLayout(new URL(`${formular}.pdf`, options.templatesDirectory))
      for (const field of fields) {
        // The renderer places a field only on a page the template has.
        if (field.seite < 1 || field.seite > layout.pageCount) continue
        if (place(font, resolveField(field, layout.widgets.get(field.id)), copy[field.id]!) === null) overflows.push(field.id)
      }
    }
  }
  return overflows
}

export async function renderForms(fieldSet: FieldSet, values: FieldValues, options: RendererOptions): Promise<Uint8Array> {
  assertKnownFields(fieldSet, values, options.instances)

  const output = await PDFDocument.create()
  const font = await output.embedFont(StandardFonts.Helvetica)
  const form = options.editable ? output.getForm() : null
  const overflows: string[] = []
  const instanceNumber = new Map<string, number>()

  for (const formular of ORDER) {
    for (const instanceValues of copiesOf(formular, values, options.instances)) {
      const fields = fieldSet.felder.filter((field) => field.formular === formular && instanceValues[field.id] !== undefined)
      if (fields.length === 0 && formular !== 'est-1-a') continue
      const number = (instanceNumber.get(formular) ?? 0) + 1
      instanceNumber.set(formular, number)
      const templateBytes = await loadTemplateBytes(new URL(`${formular}.pdf`, options.templatesDirectory))
      const template = await PDFDocument.load(templateBytes)
      const acroWidgets = await extractAcroFormWidgets(template)
      if (acroWidgets.size > 0) {
        const templateForm = template.getForm()
        for (const existingField of templateForm.getFields()) {
          templateForm.removeField(existingField)
        }
      }
      const pages = await output.copyPages(template, template.getPageIndices())
      pages.forEach((page, index) => {
        output.addPage(page)
        for (const field of fields.filter((f) => f.seite === index + 1)) {
          const value = instanceValues[field.id]!
          const resolvedField = resolveField(field, acroWidgets.get(field.id))
          const situation = place(font, resolvedField, value)
          if (situation === null) overflows.push(field.id)
          else if (form) setFormField(form, page, font, resolvedField, number === 1 ? field.id : `${field.id}#${number}`, value)
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
