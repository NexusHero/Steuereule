import { z } from 'zod'
import { provenanceKey } from '@steuereule/core'
import { assertScope, json, provenanceOf, refused, type McpDeps, type McpSession } from '../mcp-session.js'
import { ownRecord } from '../own-record.js'

const MAX_OBJECTS = 10
/** The field whose marking says "the assistant created this object". */
const ANCHOR = 'mieteinnahmen'

/** The rental objects of the year as records, so the assistant can address the mask `vermietung` (#549). */
export function registerRentalTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const rentals = deps.rentals
  if (!rentals) return
  const taxYearArg = z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)')

  server.tool(
    'vermietungen_auflisten',
    'Listet die Vermietungsobjekte des Steuerjahres mit ihrer `instance` für die Maske `vermietung`. Die Werte eines Objekts liest du mit maske_lesen.',
    { taxYear: taxYearArg },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'vermietungen_auflisten' })
      const objects = await rentals.listForUserAndYear(userId, taxYear)
      return json({ objekte: objects.map((o, index) => ({ instance: o.id, nummer: index + 1 })) })
    },
  )

  server.tool(
    'vermietung_anlegen',
    'Legt ein leeres Vermietungsobjekt für das Steuerjahr an und gibt seine `instance` zurück. Mieteinnahmen, Adresse, Anschaffung und Werbungskosten danach mit maske_eintragen, Maske `vermietung`, und dieser `instance`. Lege ein Objekt nur an, wenn ein Beleg es hergibt; prüfe vorher mit vermietungen_auflisten, ob es schon da ist.',
    { taxYear: taxYearArg },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:write')
      const existing = await rentals.listForUserAndYear(userId, taxYear)
      if (existing.length >= MAX_OBJECTS) return refused(`TOO_MANY: Mehr als ${MAX_OBJECTS} Objekte legt nur der Nutzer in der App an.`)
      const created = await rentals.create(userId, taxYear)
      await deps.audit.append({ userId, action: 'WRITE', resource: 'vermietung_anlegen' })
      // The marking makes the object the assistant's own entry: unconfirmed, and so removable by it.
      await deps.confirmation.markUnconfirmed(userId, taxYear, [provenanceKey('vermietung', ANCHOR, created.id)], provenanceOf(assistant))
      return json({ ok: true, instance: created.id, nummer: existing.length + 1, hinweis: 'Angaben mit maske_eintragen, Maske "vermietung", instance wie angegeben. Die Felder nennt maske_felder.' })
    },
  )

  server.tool(
    'vermietung_entfernen',
    'Entfernt ein Vermietungsobjekt, das du selbst angelegt hast und an dem noch nichts bestätigt oder vom Nutzer eingetragen ist. Ein Objekt des Nutzers entfernt nur er in der App.',
    { taxYear: taxYearArg, instance: z.string().describe('Die instance des Objekts aus vermietungen_auflisten') },
    async ({ taxYear, instance }) => {
      assertScope(assistant, 'steuerdaten:write')
      if (!(await rentals.listForUserAndYear(userId, taxYear)).some((o) => o.id === instance)) return refused('NO_RECORD: Dieses Objekt gibt es für das Jahr nicht.')
      const record = await ownRecord(deps, { userId, taxYear, screen: 'vermietung', instance, anchorField: ANCHOR }, assistant)
      if (!record.own) return refused('NOT_OWN_ENTRY: Dieses Objekt hat der Nutzer angelegt oder schon bestätigt; entfernen kann es nur er in der App.')
      await rentals.delete(userId, taxYear, instance)
      await deps.confirmation.forget(userId, taxYear, record.keys)
      await deps.audit.append({ userId, action: 'WRITE', resource: 'vermietung_entfernen' })
      return json({ ok: true, entfernt: instance })
    },
  )
}
