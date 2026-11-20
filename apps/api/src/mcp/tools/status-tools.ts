import { z } from 'zod'
import { SCREENS } from '@steuereule/core'
import { checkStageValue, validateStageTarget } from '../../ki/advisor-safety.js'
import { assertScope, json, dataUserFor, type McpDeps, type McpSession } from '../mcp-session.js'

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
    'offene_fragen',
    'Nennt je Interview-Bereich (Grundfragen, Lebenslagen, Einkünfte, Sonderausgaben, Grenzgänger, Haushalt, Gesundheit, Vorauszahlungen …) die nächste offene Frage mit ihren möglichen Antworten und wie viele dort noch folgen. Das sind Tatsachen, die nur der Nutzer kennt: Frage ihn und trage die Antwort mit maske_eintragen (Maske "interview") ein; danach erneut aufrufen. Erfinde nie eine Antwort.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'offene_fragen' })
      return json(await report.openQuestions(userId, taxYear))
    },
  )

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
    async ({ taxYear, screen, instance, field, value, person }) => {
      // The simulation writes on trial and rolls back: only an assistant that may enter values gets it.
      assertScope(assistant, 'steuerdaten:write')
      await deps.audit.append({ userId, action: 'READ', resource: 'auswirkung_simulieren' })
      const target = validateStageTarget(screen, field, true)
      if (!target.ok) return json({ ok: false, error: target.error })
      const checked = checkStageValue(screen, field, value)
      if (!checked.ok) return json({ ok: false, error: checked.error })
      const whose = await dataUserFor(deps.link, userId, taxYear, screen, field.trim(), person)
      if (!whose.ok) return json({ ok: false, error: whose.error })
      return json(await report.simulate(userId, taxYear, screen, field.trim(), checked.value, instance, whose.dataUserId))
    },
  )
}
