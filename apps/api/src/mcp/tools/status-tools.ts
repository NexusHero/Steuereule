import { z } from 'zod'
import { type Screen } from '@steuereule/core'
import { ConflictError } from '../../common/domain-error.js'
import { checkStageValue, validateStageTarget } from '../../ki/advisor-safety.js'
import type { SimulationEntry } from '../mcp-report.service.js'
import { dataUserFor, type McpDeps, type McpSession } from '../mcp-session.js'
import { fieldArg, instanceArg, json, MIN_TAX_YEAR, maxTaxYear, personArg, refused, screenArg, taxYearArg, valueArg } from '../tool-kit.js'

/** Where the return stands: the years, printout pre-check, owl hints, payment link (ADR-0052 §3, §5, §8, §12). */
export function registerStatusTools(session: McpSession, deps: McpDeps): void {
  const { server, userId } = session

  const years = deps.years
  if (years) {
    server.tool(
      'steuerjahre_auflisten',
      'Nennt die Steuerjahre, für die der Nutzer schon etwas in der App hat, mit ihrem Stand, und welche Jahre die App annimmt. Zuerst aufrufen; jedes andere Werkzeug mit taxYear nimmt eines dieser Jahre.',
      {},
      async () => {
        const own = await years.yearsOf(userId)
        return json({
          jahre: own.map((y) => ({ steuerjahr: y.year, stand: y.status, hatDaten: y.hasData })),
          moeglicheJahre: { von: MIN_TAX_YEAR, bis: maxTaxYear() },
          hinweis: own.length === 0 ? 'Der Nutzer hat noch kein Steuerjahr angefangen. Frag ihn, um welches Jahr es geht.' : 'Arbeite mit dem Jahr, um das es dem Nutzer geht; frag nach, wenn es mehrere offene gibt.',
        })
      },
    )
  }

  server.tool(
    'ausdruck_vorpruefung',
    'Prüft, welche Angaben für den amtlichen Papierausdruck des Steuerjahres noch fehlen oder unbestätigt sind (`fehlend`: Lückencodes; `unbestaetigt.*` wartet auf die Bestätigung des Nutzers). Rendert den Ausdruck zur Probe und hat deshalb ein eigenes, kleines Kontingent: nach einer Reihe von Einträgen aufrufen, nicht nach jedem.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {
      const { missing } = await deps.printout.check(userId, taxYear)
      return json({ steuerjahr: taxYear, druckfaehig: missing.length === 0, fehlend: missing })
    },
  )

  server.tool(
    'eulen_hinweise',
    'Liest die Eulen-Tipps und Sparhinweise der App für das Steuerjahr. Die Liste ist leer, solange der Nutzer den Eulen-Modus in der App nicht eingeschaltet hat (`eulenModusAn: false`); das sagt nichts über fehlende Sparmöglichkeiten.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {
      const cards = await deps.owlMode.getCards(userId, taxYear)
      return json({
        ...cards,
        eulenModusAn: cards.enabled,
        ...(cards.enabled ? {} : { hinweis: 'Der Eulen-Modus ist aus: Der Nutzer kann ihn in der App einschalten. Bis dahin gibt es hier keine Hinweise.' }),
      })
    },
  )

  server.tool(
    'zahllink_anfordern',
    'Legt beim Zahlungsanbieter einen Bezahlvorgang für die Freischaltung des amtlichen Ausdrucks an und gibt den Link zurück (braucht die Berechtigung zahllink:write). Das Bezahlen selbst macht nur der Kontoinhaber im Browser. Ist das Jahr schon bezahlt oder läuft eine Zahlung, sagt die Antwort das.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {
      try {
        const { checkoutUrl } = await deps.unlock.startCheckout(userId, taxYear)
        return json({ steuerjahr: taxYear, checkoutUrl, hinweis: 'Der Bezahlvorgang muss vom Kontoinhaber im Browser abgeschlossen werden.' })
      } catch (error) {
        // API-4: a paid year or a payment still settling is said as such, not as a failure.
        if (error instanceof ConflictError) return refused(`${error.code}: ${error.message}`, 'Sage dem Nutzer, dass das Jahr schon bezahlt ist oder die Zahlung noch läuft; einen neuen Link braucht er nicht.')
        throw error
      }
    },
  )
}

/** Feedback for the assistant's user: the state in words, the questions only they can answer, an entry's effect (ADR-0052 amendment 2). */
export function registerReportTools(session: McpSession, deps: McpDeps): void {
  const { server, userId } = session
  const report = deps.report
  if (!report) return

  server.tool(
    'steuerbericht',
    'Liefert den Stand der Erklärung zum Weitersagen an den Nutzer: die Schätzung der App (Erstattung oder Nachzahlung), was für den Ausdruck fehlt, was der Nutzer noch bestätigen muss, offene Interview-Fragen und die nächsten Schritte. Nach einer Reihe von Einträgen aufrufen (teilt sich ein kleines Kontingent mit ausdruck_vorpruefung und pruefen) und dem Nutzer eine verständliche Zusammenfassung geben.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => json(await report.report(userId, taxYear)),
  )

  server.tool(
    'schaetzung_aufschluesseln',
    'Zeigt den Rechenweg der App-Schätzung: Einkünfte und Werbungskosten je Person, Vorsorge nach Zeilen, Sonderausgaben, Kinderfreibetrag gegen Kindergeld, zu versteuerndes Einkommen, tarifliche Steuer, § 35a, hinzugerechnetes Kindergeld, Abgeltungsteuer, Soli, Anrechnung, Vorauszahlungen und Ergebnis. Nutze es, um dem Nutzer das Ergebnis zu erklären und Abweichungen zu einem Bescheid zu finden, statt selbst nachzurechnen.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => json(await report.breakdown(userId, taxYear)),
  )

  server.tool(
    'bescheid_abgleichen',
    'Vergleicht einen eingetragenen Steuerbescheid mit der Erklärung in der App: je Position der Wert der App, der Wert des Bescheids und die Abweichung, dazu die Einspruchsfrist. Vorher die Werte des Bescheids in die Maske "assessment" eintragen (Positionen und assessmentDate; maske_felder zeigt sie).',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => json(await report.compareAssessment(userId, taxYear)),
  )

  server.tool(
    'pruefen',
    'Prüft die Erklärung wie der Berater der App: was für den Ausdruck fehlt und was die festen Eintragsregeln verlangen, je Lücke mit Feld, Person oder Kind, ob du es eintragen darfst oder nur der Nutzer, und ob es den Ausdruck sperrt. Am Ende eines Laufs aufrufen und abarbeiten (teilt sich ein kleines Kontingent mit ausdruck_vorpruefung und steuerbericht).',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {
      const [spouse, kinder] = await Promise.all([deps.link?.spouseForAdvisor(userId, taxYear), deps.children?.list(userId, taxYear)])
      return json(await report.check(userId, taxYear, { spouse: spouse ? { spouseUserId: spouse.spouseUserId, recordable: spouse.recordable } : null, childIds: (kinder?.kinder ?? []).map((k) => k.id) }))
    },
  )

  server.tool(
    'offene_fragen',
    'Nennt je Interview-Bereich (Grundfragen, Lebenslagen, Einkünfte, Sonderausgaben, Grenzgänger, Haushalt, Gesundheit, Vorauszahlungen …) die nächste offene Frage mit ihren möglichen Antworten und wie viele dort noch folgen. Das sind Tatsachen, die nur der Nutzer kennt: Frage ihn und trage die Antwort mit maske_eintragen (Maske "interview") ein; danach erneut aufrufen. Erfinde nie eine Antwort.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => json(await report.openQuestions(userId, taxYear)),
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

  // The in-app advisor's refusal of a booking names its own tool; the assistant has buchung_entwerfen instead (MCP-19).
  const forAssistant = (error: string) => (error.startsWith('USE_BOOKING_TOOL') ? 'USE_BOOKING_TOOL: Eine Buchung lässt sich nicht simulieren. Lege sie mit buchung_entwerfen als Entwurf an.' : error)

  const entryShape = {
    screen: screenArg(),
    instance: instanceArg('Datensatz-ID bei Masken mit mehreren Datensätzen (Kind: kinder_auflisten, Vermietung: vermietungen_auflisten)').optional(),
    field: fieldArg(),
    value: valueArg('Der Wert, dessen Wirkung simuliert wird, in der Form, die maske_felder nennt'),
    person: personArg('Wie bei maske_eintragen').optional(),
  }

  server.tool(
    'auswirkung_simulieren',
    'Zeigt vorab, was ein Eintrag an der Erstattung ändert (Schätzung der App vorher und nachher). Der Eintrag wird zur Probe geschrieben und immer zurückgerollt; gespeichert wird nichts, auch keine Veranlagungsart. Braucht trotzdem die Schreibberechtigung. Nutze es, um dem Nutzer die Folge einer Angabe zu erklären, bevor du sie mit maske_eintragen einträgst.',
    { taxYear: taxYearArg(), ...entryShape },
    async ({ taxYear, ...entry }) => {
      const prepared = await trialEntry(taxYear, entry)
      if (!prepared.ok) return refused(forAssistant(prepared.error))
      return json(await report.simulateEntries(userId, taxYear, [prepared.entry]))
    },
  )

  server.tool(
    'szenario_simulieren',
    'Wie auswirkung_simulieren, aber für mehrere Einträge zusammen (höchstens 20): die Erstattung vorher und nachher für das ganze Szenario; gespeichert wird nichts. Für Fragen wie „was bringt es, wenn beide Krankenkassenbeiträge und der des Kindes stimmen?“.',
    {
      taxYear: taxYearArg(),
      eintraege: z.array(z.object(entryShape)).min(1).max(20).describe('Die Einträge des Szenarios, wie bei maske_eintragen'),
    },
    async ({ taxYear, eintraege }) => {
      const entries: SimulationEntry[] = []
      for (const entry of eintraege) {
        const prepared = await trialEntry(taxYear, entry)
        if (!prepared.ok) return refused(forAssistant(prepared.error).replace(/^([A-Z_]+): /, `$1: ${entry.screen}.${entry.field}: `))
        entries.push(prepared.entry)
      }
      return json(await report.simulateEntries(userId, taxYear, entries))
    },
  )
}
