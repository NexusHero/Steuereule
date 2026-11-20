import { z } from 'zod'
import { ANNUAL_AVERAGE_RATES, describeFieldForPrompt, fieldsOfScreen, SCREENS } from '@steuereule/core'
import { isAiWritable } from '../../confirmation/ai-write-policy.js'
import { OWN_TOOL_SCREENS } from '../../ki/advisor-safety.js'
import { assertScope, json, type McpDeps, type McpSession } from '../mcp-session.js'

/** A line of a form the assistant may see: a Kennzahl with a plain amount, never a name, an id or an address. */
const isAmountLine = (id: string, value: string | true): value is string => /\.kz\d+/.test(id) && typeof value === 'string' && /^-?\d{1,12}(?:[.,]\d{1,2})?$/.test(value)

/** Lookups that save the assistant guessing (#548): exchange rates, where a term belongs, what the form will say, deadlines. */
export function registerComfortTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session

  server.tool(
    'wechselkurs',
    'Nennt den Jahresdurchschnittskurs CHF→EUR, den die Anlage N-Gre für das Steuerjahr vorgibt (z. B. 1,065 = 100 CHF sind 106,50 €). Nimm diesen Kurs, statt einen aus dem Gedächtnis.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'wechselkurs' })
      const rate = ANNUAL_AVERAGE_RATES[taxYear]
      return rate === undefined ? json({ ok: false, error: `Für ${taxYear} kennt die App keinen Jahresdurchschnittskurs.` }) : json({ ok: true, taxYear, eurJeChf: rate, feld: 'chLohnausweis.wechselkurs' })
    },
  )

  server.tool(
    'feld_finden',
    'Sucht in allen Masken nach einem Stichwort (z. B. „Krankentaggeld“, „Zeile 24“, „Kontoführung“) und nennt die passenden Felder mit ihrer Beschreibung.',
    { stichwort: z.string().min(2).max(60).describe('Wort oder Wortteil aus Feldname oder Beschreibung') },
    async ({ stichwort }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'feld_finden' })
      const needle = stichwort.trim().toLowerCase()
      const treffer = SCREENS.filter((screen) => !OWN_TOOL_SCREENS.has(screen)).flatMap((screen) =>
        fieldsOfScreen(screen)
          .filter((spec) => isAiWritable(screen, spec.field, true) && !(screen === 'stammdaten' && spec.field === 'religion'))
          .map((spec) => ({ screen, feld: spec.field, beschreibung: describeFieldForPrompt(spec) }))
          .filter((entry) => entry.beschreibung.toLowerCase().includes(needle)),
      )
      return json({ stichwort, treffer: treffer.slice(0, 25), ...(treffer.length > 25 ? { weitere: treffer.length - 25 } : {}) })
    },
  )

  server.tool(
    'vordruck_zeilen',
    'Zeigt, welche Beträge in welcher Kennzahl welcher Anlage landen würden (z. B. anlN.kz110), je Formular und Person. Nur Kennzahlen mit Beträgen, keine Namen, Kennungen oder Adressen. Damit lässt sich die Erklärung Zeile für Zeile neben eine andere legen.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'vordruck_zeilen' })
      const { forms } = await deps.printout.liveValues(userId, taxYear)
      return json({
        taxYear,
        formulare: forms.flatMap((form) =>
          form.instances.map((instance, index) => ({
            formular: form.formular,
            ...(instance.person ? { person: instance.person } : {}),
            ...(form.instances.length > 1 && !instance.person ? { nummer: index + 1 } : {}),
            kennzahlen: Object.fromEntries(Object.entries(instance.values).filter(([id, value]) => isAmountLine(id, value))),
          })),
        ),
      })
    },
  )

  const deadlines = deps.deadlines
  if (deadlines) {
    server.tool(
      'fristen',
      'Nennt die Abgabefrist der Erklärung für das Steuerjahr, die verbleibenden Tage und was bei Verspätung droht. Die Einspruchsfrist eines Bescheids nennt bescheid_abgleichen.',
      { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
      async ({ taxYear }) => {
        assertScope(assistant, 'steuerdaten:read')
        await deps.audit.append({ userId, action: 'READ', resource: 'fristen' })
        const d = await deadlines.getDeadlines(taxYear)
        return json({ taxYear, abgabefrist: d.filingDeadline, heute: d.today, stand: d.level, verbleibendeTage: d.remainingDays, verspaetungszuschlag: d.lateFilingSurcharge })
      },
    )
  }
}
