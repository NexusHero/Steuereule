import { z } from 'zod'
import { SCREENS, type Screen } from '@steuereule/core'
import { checkStageValue, validateStageTarget } from '../../ki/advisor-safety.js'
import type { SimulationEntry } from '../mcp-report.service.js'
import { MCP_CHECKOUT_LINK_LIMIT } from '../mcp-rate-limit.js'
import { assertScope, json, refused, dataUserFor, type McpDeps, type McpSession } from '../mcp-session.js'

/** Where the return stands: state, printout pre-check, owl hints, payment link (ADR-0052 §3, §5, §8, §12). */
export function registerStatusTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  // 2. Tool: ausdruck_vorpruefung (Was fehlt für den Ausdruck, ADR-0052 §3)
  server.tool(
    'ausdruck_vorpruefung',
    'Prüft, welche Angaben für den amtlichen Papierausdruck des Steuerjahres noch fehlen oder unbestätigt sind.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
    },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'ausdruck_vorpruefung' })

      const { missing } = await deps.printout.check(userId, taxYear)
      return json({
                steuerjahr: taxYear,
                druckfaehig: missing.length === 0,
                fehlend: missing,
              })
    },
  )

  // 4. Tool: eulen_hinweise (Eulen-Tipps lesen, ADR-0052 §12)
  server.tool(
    'eulen_hinweise',
    'Liest die Eulen-Tipps und steuerlichen Sparhinweise für das Steuerjahr ab.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
    },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'eulen_hinweise' })

      const cardsDto = await deps.owlMode.getCards(userId, taxYear)
      return json(cardsDto)
    },
  )

  // 6. Tool: zahllink_anfordern (Checkout-URL abrufen, ADR-0052 §5)
  server.tool(
    'zahllink_anfordern',
    'Fordert einen Stripe-Checkout-Link für die Freischaltung des amtlichen Ausdrucks an. Das Bezahlen selbst verbleibt beim Kontoinhaber.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
    },
    async ({ taxYear }) => {
      assertScope(assistant, 'zahllink:read')
      // Every link is a new checkout session at the payment provider: a few an hour, not 120 a minute.
      const gate = await deps.limiter?.takeCheckoutLink(userId)
      if (gate && !gate.ok) {
        return refused(`RATE_LIMITED: Für dieses Konto wurden in der letzten Stunde schon ${MCP_CHECKOUT_LINK_LIMIT.max} Zahllinks angefordert. Gib dem Nutzer den zuletzt erhaltenen Link, oder versuch es in ${Math.ceil(gate.retryAfterSeconds / 60)} Minuten wieder.`)
      }
      await deps.audit.append({ userId, action: 'READ', resource: 'zahllink_anfordern' })

      const { checkoutUrl } = await deps.unlock.startCheckout(userId, taxYear)
      return json({
                steuerjahr: taxYear,
                checkoutUrl,
                hinweis: 'Der Bezahlvorgang muss vom Kontoinhaber im Browser abgeschlossen werden.',
              })
    },
  )
}

/** Feedback for the assistant's user: the state in words, the questions only they can answer, an entry's effect (ADR-0052 amendment 2). */
export function registerReportTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const report = deps.report
  if (!report) return

  server.tool(
    'steuerbericht',
    'Liefert den Stand der Erklärung zum Weitersagen an den Nutzer: die Schätzung der App (Erstattung oder Nachzahlung), was für den Ausdruck fehlt, was der Nutzer noch bestätigen muss, offene Interview-Fragen und die nächsten Schritte. Rufe es nach jedem größeren Eintrag auf und gib dem Nutzer eine verständliche Zusammenfassung.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'steuerbericht' })
      return json(await report.report(userId, taxYear))
    },
  )

  server.tool(
    'schaetzung_aufschluesseln',
    'Zeigt den Rechenweg der App-Schätzung: Einkünfte und Werbungskosten je Person, Vorsorge nach Zeilen, Sonderausgaben, Kinderfreibetrag gegen Kindergeld, zu versteuerndes Einkommen, tarifliche Steuer, § 35a, hinzugerechnetes Kindergeld, Abgeltungsteuer, Soli, Anrechnung, Vorauszahlungen und Ergebnis. Nutze es, um dem Nutzer das Ergebnis zu erklären und Abweichungen zu einem Bescheid zu finden, statt selbst nachzurechnen.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'schaetzung_aufschluesseln' })
      return json(await report.breakdown(userId, taxYear))
    },
  )

  server.tool(
    'bescheid_abgleichen',
    'Vergleicht einen eingetragenen Steuerbescheid mit der Erklärung in der App: je Position der Wert der App, der Wert des Bescheids und die Abweichung, dazu die Einspruchsfrist. Vorher die Werte des Bescheids in die Maske "assessment" eintragen (Positionen und assessmentDate; maske_felder zeigt sie).',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'bescheid_abgleichen' })
      return json(await report.compareAssessment(userId, taxYear))
    },
  )

  server.tool(
    'pruefen',
    'Prüft die Erklärung wie der Berater der App: was für den Ausdruck fehlt und was die festen Eintragsregeln verlangen, je Lücke mit Feld, Person oder Kind, ob du es eintragen darfst oder nur der Nutzer, und ob es den Ausdruck sperrt. Am Ende eines Laufs aufrufen und abarbeiten.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'pruefen' })
      const [spouse, kinder] = await Promise.all([deps.link?.spouseForAdvisor(userId, taxYear), deps.children?.list(userId, taxYear)])
      return json(await report.check(userId, taxYear, { spouse: spouse ? { spouseUserId: spouse.spouseUserId, recordable: spouse.recordable } : null, childIds: (kinder?.kinder ?? []).map((k) => k.id) }))
    },
  )

  server.tool(
    'offene_fragen',
    'Nennt je Interview-Bereich (Grundfragen, Lebenslagen, Einkünfte, Sonderausgaben, Grenzgänger, Haushalt, Gesundheit, Vorauszahlungen …) die nächste offene Frage mit ihren möglichen Antworten und wie viele dort noch folgen. Das sind Tatsachen, die nur der Nutzer kennt: Frage ihn und trage die Antwort mit maske_eintragen (Maske "interview") ein; danach erneut aufrufen. Erfinde nie eine Antwort.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'offene_fragen' })
      return json(await report.openQuestions(userId, taxYear))
    },
  )

  /** An entry of a simulation, checked like a real one: target, value and whose data it would be. */
  async function trialEntry(taxYear: number, entry: { screen: Screen; instance?: string | undefined; field: string; value: string; person?: 'A' | 'B' | undefined }): Promise<{ ok: true; entry: SimulationEntry } | { ok: false; error: string }> {
    const target = validateStageTarget(entry.screen, entry.field, true)
    if (!target.ok) return { ok: false, error: target.error }
    const checked = checkStageValue(entry.screen, entry.field, entry.value)
    if (!checked.ok) return { ok: false, error: checked.error }
    const whose = await dataUserFor(deps.link, userId, taxYear, entry.screen, entry.field.trim(), entry.person)
    if (!whose.ok) return whose
    return { ok: true, entry: { screen: entry.screen, field: entry.field.trim(), value: checked.value, instance: entry.instance, dataUserId: whose.dataUserId } }
  }

  server.tool(
    'auswirkung_simulieren',
    'Zeigt vorab, was ein Eintrag an der Erstattung ändert (Schätzung der App vorher und nachher), ohne etwas zu speichern (braucht die Schreibberechtigung). Nutze es, um dem Nutzer die Folge einer Angabe zu erklären, bevor du sie mit maske_eintragen einträgst.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      screen: z.enum(SCREENS).describe('Die Erfassungsmaske'),
      instance: z.string().optional().describe('Instanz-ID bei mehrfachen Objekten'),
      field: z.string().describe('Der Feldbezeichner'),
      value: z.string().describe('Der Wert, dessen Wirkung simuliert wird'),
      person: z.enum(['A', 'B']).optional().describe('Wie bei maske_eintragen'),
    },
    async ({ taxYear, ...entry }) => {
      // The simulation writes on trial and rolls back: only an assistant that may enter values gets it.
      assertScope(assistant, 'steuerdaten:write')
      await deps.audit.append({ userId, action: 'READ', resource: 'auswirkung_simulieren' })
      const prepared = await trialEntry(taxYear, entry)
      if (!prepared.ok) return json({ ok: false, error: prepared.error })
      return json(await report.simulateEntries(userId, taxYear, [prepared.entry]))
    },
  )

  server.tool(
    'szenario_simulieren',
    'Wie auswirkung_simulieren, aber für mehrere Einträge zusammen (höchstens 20): die Erstattung vorher und nachher für das ganze Szenario, ohne etwas zu speichern. Für Fragen wie „was bringt es, wenn beide Krankenkassenbeiträge und der des Kindes stimmen?“.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      eintraege: z
        .array(z.object({ screen: z.enum(SCREENS), instance: z.string().optional(), field: z.string(), value: z.string(), person: z.enum(['A', 'B']).optional() }))
        .min(1)
        .max(20)
        .describe('Die Einträge des Szenarios, wie bei maske_eintragen'),
    },
    async ({ taxYear, eintraege }) => {
      assertScope(assistant, 'steuerdaten:write')
      await deps.audit.append({ userId, action: 'READ', resource: 'szenario_simulieren' })
      const entries: SimulationEntry[] = []
      for (const entry of eintraege) {
        const prepared = await trialEntry(taxYear, entry)
        if (!prepared.ok) return json({ ok: false, error: `${entry.screen}.${entry.field}: ${prepared.error}` })
        entries.push(prepared.entry)
      }
      return json(await report.simulateEntries(userId, taxYear, entries))
    },
  )
}
