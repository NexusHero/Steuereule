import { z } from 'zod'
import { assertScope, json, type McpDeps, type McpSession } from '../mcp-session.js'

/**
 * Comparisons from the case itself (#548): joint against separate assessment from the recorded figures of
 * both persons, and this year beside the year before. Figures and names of masks and fields only.
 */
export function registerComparisonTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const report = deps.report
  if (!report) return
  const taxYearArg = z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)')

  server.tool(
    'veranlagung_vergleichen',
    'Vergleicht Zusammen- und Einzelveranlagung aus den erfassten Zahlen beider Personen (Schätzung der App), ohne dass du ein Einkommen des Partners angibst: beide Steuerbeträge, die Differenz und ob das Ergebnis eindeutig ist, oder warum kein Vergleich möglich ist (z. B. keine Person B). Für frei gewählte Einkommen gibt es veranlagungsarten_vergleichen.',
    { taxYear: taxYearArg },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'veranlagung_vergleichen' })
      return json(await report.compareFilingTypes(userId, taxYear))
    },
  )

  server.tool(
    'vorjahr_vergleichen',
    'Legt die Aufschlüsselung der Schätzung (wie schaetzung_aufschluesseln) für dieses Jahr und das Vorjahr nebeneinander, mit der Veränderung der Hauptzahlen, und nennt die Felder, die im Vorjahr einen Wert hatten und jetzt leer sind (nur Masken und Feldnamen), sowie die Zahl der Kinder und Vermietungsobjekte in beiden Jahren. Frag den Nutzer, was davon dieses Jahr wieder zutrifft; übernimm keine Werte ungefragt.',
    { taxYear: taxYearArg },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'vorjahr_vergleichen' })
      const comparison = await report.compareYears(userId, taxYear)
      if (comparison.ok !== true) return json(comparison)
      // Records carry ids of their own year: counted, never matched or named.
      const count = async <T>(read: ((year: number) => Promise<readonly T[]>) | null) =>
        read === null ? undefined : { vorjahr: (await read(taxYear - 1)).length, diesesJahr: (await read(taxYear)).length }
      const { rentals, children } = deps
      const [vermietungsobjekte, kinder] = await Promise.all([
        count(rentals ? (year) => rentals.listForUserAndYear(userId, year) : null),
        count(children ? async (year) => (await children.list(userId, year)).kinder : null),
      ])
      return json({ ...comparison, datensaetze: { ...(vermietungsobjekte ? { vermietungsobjekte } : {}), ...(kinder ? { kinder } : {}) } })
    },
  )
}
