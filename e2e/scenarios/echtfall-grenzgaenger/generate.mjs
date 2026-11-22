// Renders the documents of the real case (apps/api/test/acceptance/echtfaelle/grenzgaenger-paar.case.ts) to
// PDFs with a text layer, as a user's PDF from the employer has one. The case file stays the single source
// of the facts; the PDFs are committed so the gate uploads the same bytes every run.
//
//   node e2e/scenarios/echtfall-grenzgaenger/generate.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, closeBrowser } from '../../harness/browser.mjs'
import { renderTextPdf } from '../../fixtures/synthetic-documents.mjs'
import { GRENZGAENGER_PAAR } from '../../../apps/api/test/acceptance/echtfaelle/grenzgaenger-paar.case.ts'

export const DOCUMENT_DIR = path.dirname(fileURLToPath(import.meta.url))

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const browser = await launchBrowser()
  try {
    for (const year of GRENZGAENGER_PAAR.years) {
      for (const doc of year.documents) {
        await fs.writeFile(path.join(DOCUMENT_DIR, doc.fileName), await renderTextPdf(browser, doc.text.split('\n'), { fontSize: 8 }))
        console.log(`wrote ${doc.fileName}`)
      }
    }
  } finally {
    await closeBrowser(browser)
  }
}
