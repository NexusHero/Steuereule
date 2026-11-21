import { z } from 'zod'
import { ASSISTANT_TASK_KINDS } from '../../assistant-task/assistant-task.repository.js'
import { assertScope, json, refused, type McpDeps, type McpSession } from '../mcp-session.js'

/** What only the user can do in the app, left as a task the Cockpit shows (#547). */
export function registerTaskTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const tasks = deps.tasks
  if (!tasks) return
  const taxYearArg = z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)')

  server.tool(
    'aufgabe_fuer_nutzer',
    'Hinterlässt dem Nutzer eine Aufgabe, die nur er in der App erledigen kann: die Konfession eintragen, eine Einwilligung geben, Einträge bestätigen, einen Beleg nachreichen, ein Kind entfernen. Die Aufgabe steht im Cockpit, bis der Nutzer sie erledigt oder verwirft; den Stand liest du mit aufgaben_auflisten. Schreibe den Text kurz, als Bitte an den Nutzer, ohne Namen, Kennungen (IBAN, Steuer-ID) und Links.',
    {
      taxYear: taxYearArg,
      art: z.enum(ASSISTANT_TASK_KINDS).describe('Worum es geht; „sonstiges“ nur, wenn keine andere Art passt'),
      text: z.string().describe('Die Aufgabe in einem kurzen Satz (höchstens 300 Zeichen), ohne Namen und Kennungen'),
    },
    async ({ taxYear, art, text }) => {
      assertScope(assistant, 'steuerdaten:write')
      const result = await tasks.create(userId, taxYear, { kind: art, text, assistant: assistant.clientName, clientId: assistant.clientId })
      if (!result.ok) return refused(`${result.code}: ${result.reason}`)
      if (!result.existing) await deps.audit.append({ userId, action: 'WRITE', resource: 'aufgabe_fuer_nutzer' })
      return json({
        ok: true,
        id: result.task.id,
        status: result.task.status,
        hinweis: result.existing ? 'Diese Aufgabe ist schon offen.' : 'Die Aufgabe steht im Cockpit des Nutzers. Den Stand liest du mit aufgaben_auflisten.',
      })
    },
  )

  server.tool(
    'aufgaben_auflisten',
    'Listet die Aufgaben, die du dem Nutzer für das Steuerjahr hinterlassen hast, mit ihrem Stand: offen, erledigt oder verworfen. Eine verworfene Aufgabe stellst du nicht noch einmal.',
    { taxYear: taxYearArg },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'aufgaben_auflisten' })
      const own = await tasks.listForAssistant(userId, taxYear, assistant.clientId)
      return json({ aufgaben: own.map((t) => ({ id: t.id, art: t.kind, text: t.text, status: t.status })) })
    },
  )
}
