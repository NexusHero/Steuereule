#!/usr/bin/env node
// Pre-processor that embeds measured AcroForm fields directly into the official BMF Vordruck PDFs.
//
// Input:  apps/api/assets/vordrucke/<jahr>/<formular>.pdf + apps/api/src/printout/felder-<jahr>.json
// Output: apps/api/assets/vordrucke-acroform/<jahr>/<formular>.pdf (or verified with --check)
//
// Once pre-compiled, each Vordruck carries its own named AcroForm text fields (with font size 10 pt,
// alignment Left/Right/Center, and exact widget rectangle including any `textAb` offset), so both
// backend form filling and frontend PDF.js AcroForm rendering work directly by field name without
// runtime coordinate tables.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(path.join(ROOT, 'apps/api/package.json'))
const { PDFDocument, StandardFonts, TextAlignment, rgb } = require('pdf-lib')

const FONT_SIZE = 10
const FIXED_DATE = new Date('2025-01-01T00:00:00.000Z')

const isAmount = (art) => art === 'euro' || art === 'euroCent'

async function compileFormTemplate(rawBytes, fields) {
  const doc = await PDFDocument.load(rawBytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const form = doc.getForm()
  const pages = doc.getPages()

  for (const field of fields) {
    const page = pages[field.seite - 1]
    if (!page) {
      throw new Error(`Field ${field.id} references non-existent page ${field.seite} on ${field.formular}`)
    }
    const { x, y, breite, hoehe } = field.kasten
    const links = field.textAb ?? x
    const textField = form.createTextField(field.id)
    textField.setAlignment(
      field.art === 'kreuz' ? TextAlignment.Center : isAmount(field.art) ? TextAlignment.Right : TextAlignment.Left,
    )
    textField.addToPage(page, {
      x: links,
      y,
      width: x + breite - links,
      height: hoehe,
      font,
      textColor: rgb(0, 0, 0),
      borderWidth: 0,
    })
    textField.setFontSize(FONT_SIZE)
  }

  form.updateFieldAppearances(font)
  doc.setCreator('SteuerEule AcroForm Preprocessor')
  doc.setProducer('SteuerEule AcroForm Preprocessor')
  doc.setCreationDate(FIXED_DATE)
  doc.setModificationDate(FIXED_DATE)
  return doc.save()
}

async function run() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const checkOnly = process.argv.includes('--check')
  const years = args.length > 0 ? args : ['2024', '2025']

  for (const jahr of years) {
    if (!/^\d{4}$/.test(jahr)) {
      console.error(`usage: node scripts/vordrucke/acroform-vorlagen.mjs [jahr] [--check]`)
      process.exit(1)
    }
    const fieldSetPath = path.join(ROOT, 'apps/api/src/printout', `felder-${jahr}.json`)
    const fieldSet = JSON.parse(readFileSync(fieldSetPath, 'utf8'))
    const rawDir = path.join(ROOT, 'apps/api/assets/vordrucke', jahr)
    const outDir = path.join(ROOT, 'apps/api/assets/vordrucke-acroform', jahr)
    if (!checkOnly) {
      mkdirSync(outDir, { recursive: true })
    }

    const forms = Object.keys(fieldSet.vorlagen)
    let totalFields = 0

    for (const formular of forms) {
      const rawPath = path.join(rawDir, `${formular}.pdf`)
      const rawBytes = readFileSync(rawPath)
      const fields = fieldSet.felder.filter((f) => f.formular === formular)
      totalFields += fields.length
      const compiledBytes = await compileFormTemplate(rawBytes, fields)
      const outPath = path.join(outDir, `${formular}.pdf`)

      if (checkOnly) {
        if (!existsSync(outPath)) {
          console.error(`Missing pre-compiled AcroForm template: ${outPath}`)
          process.exit(1)
        }
        const existingHash = createHash('sha256').update(readFileSync(outPath)).digest('hex')
        const compiledHash = createHash('sha256').update(compiledBytes).digest('hex')
        if (existingHash !== compiledHash) {
          console.error(
            `AcroForm template ${jahr}/${formular}.pdf is out of sync with felder-${jahr}.json — run: node scripts/vordrucke/acroform-vorlagen.mjs ${jahr}`,
          )
          process.exit(1)
        }
      } else {
        writeFileSync(outPath, compiledBytes)
      }
    }

    if (checkOnly) {
      console.log(`${jahr}: ${forms.length} AcroForm-Vorlagen (${totalFields} Felder) stimmen exakt überein.`)
    } else {
      console.log(`${jahr}: ${forms.length} AcroForm-Vorlagen (${totalFields} Felder) erzeugt → apps/api/assets/vordrucke-acroform/${jahr}/`)
    }
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
