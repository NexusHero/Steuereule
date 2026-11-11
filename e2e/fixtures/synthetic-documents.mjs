// Synthetic documents for the upload gates (#450 5D, P5): a PDF with a real text layer and a
// 1×1 PNG. Everything is made up — no real personal data, no real employer.
//
// The PDF is printed by headless Chromium from plain HTML, so it carries an embedded font and a text
// layer like a real LStB printout (a hand-written PDF with the unembedded Helvetica made pdf.js in the
// browser fail: it needs `standardFontDataUrl` for the base-14 fonts).

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Prints `lines` (one text line per row) to a PDF with Chromium and returns the bytes. */
export async function renderTextPdf(browser, lines, { fontSize = 11 } = {}) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body style="font-family: Arial, sans-serif; font-size: ${fontSize}pt; margin: 24px"><pre style="font-family: inherit; margin: 0">${escapeHtml(lines.join('\n'))}</pre></body></html>`)
    return Buffer.from(await page.pdf({ format: 'A4' }))
  } finally {
    await context.close()
  }
}

/** A clean, made-up Lohnsteuerbescheinigung (layout like the official printout). */
export function syntheticLstbLines({ year = 2025, gross = 54_320, wageTax = 9_810, rv = 5_051.76, kv = 4_182.64, pv = 977.76, av = 706.16 } = {}) {
  const eur = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return [
    `Ausdruck der elektronischen Lohnsteuerbescheinigung für ${year}`,
    'Arbeitgeber: Beispiel Musterwerke GmbH',
    'Steuerklasse: I',
    `3. Bruttoarbeitslohn einschl. Sachbezüge ohne 9. und 10.    ${eur(gross)}`,
    `4. Einbehaltene Lohnsteuer von 3.                           ${eur(wageTax)}`,
    '5. Einbehaltener Solidaritätszuschlag                         0,00',
    `22a Arbeitgeberanteil zur gesetzlichen Rentenversicherung   ${eur(rv)}`,
    `23a Arbeitnehmeranteil zur gesetzlichen Rentenversicherung  ${eur(rv)}`,
    `25. Arbeitnehmerbeiträge zur gesetzlichen Krankenversicherung ${eur(kv)}`,
    `26. Arbeitnehmerbeiträge zur sozialen Pflegeversicherung       ${eur(pv)}`,
    `27. Arbeitnehmerbeiträge zur Arbeitslosenversicherung          ${eur(av)}`,
  ]
}

/** A 1×1 PNG, enough for "a photo was uploaded" flows that need no text. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
