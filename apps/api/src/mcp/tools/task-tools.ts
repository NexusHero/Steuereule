import { z } from 'zod'
import { ASSISTANT_TASK_KINDS } from '../../assistant-task/assistant-task.repository.js'
import { MAX_OPEN_TASKS, MAX_TASK_TEXT } from '../../assistant-task/assistant-task.service.js'
import type { McpDeps, McpSession } from '../mcp-session.js'
import { instanceArg, json, refused, taxYearArg } from '../tool-kit.js'

/** What only the user can do in the app, left as a task the Cockpit shows (#547). */
export function registerTaskTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const tasks = deps.tasks
  if (!tasks) return

  server.tool(
    'aufgabe_fuer_nutzer',
    `Hinterlässt dem Nutzer eine Aufgabe, die nur er in der App erledigen kann: die Konfession eintragen, eine Einwilligung geben, Einträge bestätigen, einen Beleg nachreichen, ein Kind entfernen. Die Aufgabe steht im Cockpit, bis der Nutzer sie erledigt oder verwirft; den Stand liest du mit aufgaben_auflisten, eine eigene offene nimmst du mit aufgabe_zuruecknehmen zurück. Schreibe den Text kurz, als Bitte an den Nutzer, ohne Namen, Kennungen (IBAN, Steuer-ID) und ohne Links oder Webadressen (auch nichts wie „name.de“). Höchstens ${MAX_OPEN_TASKS} offene je Jahr.`,
    {
      taxYear: taxYearArg(),
      art: z.enum(ASSISTANT_TASK_KINDS).describe('Worum es geht; „sonstiges“ nur, wenn keine andere Art passt'),
      text: z.string().min(1).max(MAX_TASK_TEXT).describe(`Die Aufgabe in einem kurzen Satz (höchstens ${MAX_TASK_TEXT} Zeichen), ohne Namen, Kennungen und Links`),
    },
    async ({ taxYear, art, text }) =>
      // Duplicate check, count and create under one lock: calls in parallel stay under the cap (MCP-23).
      deps.locks.withLock(`mcp-task:${userId}:${taxYear}`, async () => {
        const result = await tasks.create(userId, taxYear, { kind: art, text, assistant: assistant.clientName, clientId: assistant.clientId })
        if (!result.ok) return refused(`${result.code}: ${result.reason}`)
        return json({
          ok: true,
          id: result.task.id,
          status: result.task.status,
          hinweis: result.existing ? 'Diese Aufgabe ist schon offen.' : 'Die Aufgabe steht im Cockpit des Nutzers. Den Stand liest du mit aufgaben_auflisten.',
        })
      }),
  )

  server.tool(
    'aufgaben_auflisten',
    'Listet die Aufgaben, die du dem Nutzer für das Steuerjahr hinterlassen hast, mit ihrem Stand: offen, erledigt oder verworfen. Eine verworfene Aufgabe stellst du nicht noch einmal.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => {
      const own = await tasks.listForAssistant(userId, taxYear, assistant.clientId)
      return json({ aufgaben: own.map((t) => ({ id: t.id, art: t.kind, text: t.text, status: t.status })) })
    },
  )

  server.tool(
    'aufgabe_zuruecknehmen',
    'Nimmt eine eigene offene Aufgabe zurück, die nicht mehr nötig oder falsch ist; sie verschwindet aus dem Cockpit des Nutzers. Aufgaben anderer Assistenten und schon erledigte oder verworfene bleiben.',
    { taxYear: taxYearArg(), id: instanceArg('Die id der Aufgabe aus aufgabe_fuer_nutzer oder aufgaben_auflisten') },
    async ({ taxYear, id }) => {
      const removed = await tasks.withdrawOwn(userId, taxYear, id, assistant.clientId)
      if (!removed) return refused('NO_RECORD: Eine offene Aufgabe von dir mit dieser id gibt es für das Jahr nicht.')
      return json({ ok: true, entfernt: id })
    },
  )
}
