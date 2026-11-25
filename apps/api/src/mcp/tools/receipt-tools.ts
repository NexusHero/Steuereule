import { ISO_DATE_PATTERN, RECEIPT_TYPES } from '@steuereule/core'
import { z } from 'zod'
import { MAX_RECEIPT_FILE_BYTES } from '../../receipt/storage/magic-bytes.js'
import type { McpDeps, McpSession } from '../mcp-session.js'
import { instanceArg, json, maxTaxYear, MIN_TAX_YEAR, refused, taxYearArg } from '../tool-kit.js'

/** The base64 text of the largest file the upload takes (10 MB), with room for line breaks some clients insert. */
export const MAX_RECEIPT_BASE64_LENGTH = Math.ceil(MAX_RECEIPT_FILE_BYTES / 3) * 4 + 300_000
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** The file of a tool call: strict base64, or null when the text is none. */
function decodeBase64(text: string): Buffer | null {
  const compact = text.replace(/\s+/g, '')
  if (compact.length === 0 || compact.length % 4 !== 0 || !BASE64.test(compact)) return null
  return Buffer.from(compact, 'base64')
}

const isoDateArg = (description: string) => z.string().max(10).regex(ISO_DATE_PATTERN).describe(description)

/**
 * The receipt inbox (ADR-0052 §11, beta decision 6): the assistant uploads the file itself, and the upload takes
 * the same way as the app's (`ReceiptService.upload`: type by magic bytes, 10 MB, the account's quota, the
 * name cut to 255, dates checked) with the same admission and budget. Only the assistant that uploaded a
 * receipt may take it back, and only while no entry names it as its source.
 */
export function registerReceiptTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  server.tool(
    'beleg_hochladen',
    'Lädt eine Belegdatei (PDF, JPEG, PNG, WebP oder XML-E-Rechnung, höchstens 10 MB) in den Beleg-Posteingang des Nutzers. Die Datei geht base64-kodiert in `dateiBase64`; die App erkennt die Art an ihrem Inhalt, nicht am Namen. Gibt die belegId zurück, die du bei maske_eintragen als receiptId angibst. Den Inhalt liest du selbst; die App liest die Datei nicht für dich aus. Eine falsch hochgeladene Datei nimmst du mit beleg_zuruecknehmen zurück.',
    {
      dateiBase64: z.string().min(8).max(MAX_RECEIPT_BASE64_LENGTH).describe('Die Datei, base64-kodiert (höchstens 10 MB vor der Kodierung)'),
      fileName: z.string().min(1).max(1024).describe('Dateiname des Belegs (z.B. spendenquittung.pdf); gespeichert werden höchstens 255 Zeichen. Er wird in der App angezeigt, aber nie an dich zurückgegeben'),
      kind: z.enum(RECEIPT_TYPES).optional().describe(`Belegart, eine von: ${RECEIPT_TYPES.join(', ')}`),
      taxYear: taxYearArg().optional().describe('Steuerjahr, dem der Beleg zugeordnet werden soll (steuerjahre_auflisten)'),
      belegdatum: isoDateArg('Belegdatum im Format YYYY-MM-DD').optional(),
      zahlungsdatum: isoDateArg('Zahlungsdatum im Format YYYY-MM-DD').optional(),
    },
    async ({ dateiBase64, fileName, kind, taxYear, belegdatum, zahlungsdatum }) => {
      const budget = await deps.limiter.takeReceiptUpload(userId)
      if (!budget.ok) return refused(`RATE_LIMITED: Über diesen Zugang wurden gerade viele Belege hochgeladen. Versuch es in ${Math.ceil(budget.retryAfterSeconds / 60)} Minuten wieder.`)
      const buffer = decodeBase64(dateiBase64)
      if (buffer === null) return refused('RECEIPT_FILE_INVALID: `dateiBase64` ist kein gültiges Base64.', 'Kodiere die Datei als Standard-Base64 (RFC 4648) ohne Präfix wie „data:…;base64,“.')
      // The REST route's admission: a few uploads at once per instance, one per account (ADR-0109).
      const release = deps.admission?.acquire(userId) ?? (() => undefined)
      try {
        const created = await deps.receipts.upload(userId, { buffer, fileName, kind, belegdatum, zahlungsdatum, uploadedByClientId: assistant.clientId })
        if (taxYear !== undefined) await deps.receipts.setAssignment(userId, created.id, { taxYear })
        // No file name back: the read view keeps it out (ADR-0052 amendment 3 no. 8, H2-23).
        return json({
          belegId: created.id,
          art: created.kind,
          dateityp: created.mimeType,
          steuerjahr: taxYear ?? null,
          ...(created.duplicateOf ? { gleicheDateiWie: created.duplicateOf.id } : {}),
          status: 'hochgeladen',
          hinweis: 'Gib bei Werten aus diesem Beleg die belegId als receiptId an. Der Nutzer sieht den Beleg in seinem Posteingang.',
        })
      } finally {
        release()
      }
    },
  )

  server.tool(
    'beleg_zuruecknehmen',
    'Nimmt einen Beleg zurück, den du selbst hochgeladen hast (z. B. die falsche Datei), samt Datei. Geht nur, solange kein Eintrag ihn als Herkunft nennt; solche Einträge vorher mit eintrag_zuruecknehmen zurücknehmen. Belege des Nutzers oder anderer Assistenten bleiben.',
    { belegId: instanceArg('Die belegId aus beleg_hochladen oder belege_auflisten') },
    async ({ belegId }) =>
      // Check and delete in one transaction: a value the user takes from the receipt in between keeps it.
      deps.transactions.run(async () => {
        const receipt = await deps.receipts.findOwn(userId, belegId)
        if (receipt === null) return refused('NO_RECORD: Diesen Beleg gibt es in diesem Konto nicht.')
        if (receipt.uploadedByClientId !== assistant.clientId) return refused('NOT_OWN_ENTRY: Diesen Beleg hast nicht du hochgeladen; entfernen kann ihn nur der Nutzer in der App.')
        // An entry of any year may name the receipt as its source; one read covers every year the app takes.
        const years = Array.from({ length: maxTaxYear() - MIN_TAX_YEAR + 1 }, (_, index) => MIN_TAX_YEAR + index)
        const markings = await deps.confirmation.listForYears(userId, [0, ...years])
        const named = markings.filter((m) => ('receiptId' in m.provenance && m.provenance.receiptId === belegId) || (m.proposal !== null && 'receiptId' in m.proposal.provenance && m.proposal.provenance.receiptId === belegId))
        if (named.length > 0) return refused(`RECEIPT_IN_USE: ${named.length} Eintrag/Einträge nennen diesen Beleg als Herkunft (${named.slice(0, 5).map((m) => m.key).join(', ')}).`, 'Nimm diese Einträge zuerst mit eintrag_zuruecknehmen zurück, oder lass den Beleg stehen.')
        await deps.receipts.delete(userId, belegId, { takeBackValues: true })
        return json({ ok: true, entfernt: belegId })
      }),
  )
}
