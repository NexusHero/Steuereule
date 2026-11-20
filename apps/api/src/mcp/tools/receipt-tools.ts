import { z } from 'zod'
import { RECEIPT_TYPES, type ReceiptType } from '@steuereule/core'
import { assertScope, json, type McpDeps, type McpSession } from '../mcp-session.js'

/** The receipt inbox (ADR-0052 §11). */
export function registerReceiptTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  // 5. Tool: beleg_hochladen (Beleg im Posteingang erfassen, ADR-0052 §11)
  server.tool(
    'beleg_hochladen',
    'Erfasst einen Beleg im Beleg-Posteingang des Nutzers.',
    {
      fileName: z.string().describe('Dateiname des Belegs (z.B. spendenquittung.pdf)'),
      kind: z.string().optional().describe('Belegart (z.B. spenden, werbungskosten)'),
      taxYear: z.number().int().optional().describe('Steuerjahr, dem der Beleg zugeordnet werden soll'),
      belegdatum: z.string().optional().describe('Belegdatum im Format YYYY-MM-DD'),
      zahlungsdatum: z.string().optional().describe('Zahlungsdatum im Format YYYY-MM-DD'),
    },
    async ({ fileName, kind, taxYear, belegdatum, zahlungsdatum }) => {
      assertScope(assistant, 'belege:write')
      const validatedKind: ReceiptType | undefined =
        kind !== undefined && (RECEIPT_TYPES as readonly string[]).includes(kind) ? (kind as ReceiptType) : undefined

      const created = await deps.receipts.create(userId, {
        fileName,
        ...(validatedKind !== undefined ? { kind: validatedKind } : {}),
        ...(belegdatum !== undefined ? { belegdatum } : {}),
        ...(zahlungsdatum !== undefined ? { zahlungsdatum } : {}),
      })

      if (taxYear !== undefined) {
        await deps.receipts.setAssignment(userId, created.id, { taxYear })
      }
      await deps.audit.append({ userId, action: 'WRITE', resource: 'beleg' })

      return json({
                belegId: created.id,
                dateiname: created.fileName,
                steuerjahr: taxYear ?? null,
                status: 'erfasst',
              })
    },
  )
}
