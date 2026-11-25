import { z } from 'zod'
import { ISO_DATE_PATTERN, provenanceKey } from '@steuereule/core'
import { provenanceOf, type McpDeps, type McpSession } from '../mcp-session.js'
import { ConflictError } from '../../common/domain-error.js'
import { TOO_MANY_CHILDREN } from '../../children/children.service.js'
import { ownRecord } from '../own-record.js'
import { ageAtYearEnd } from '../read-view.js'
import { instanceArg, taxYearArg } from '../tool-args.js'
import { json, refused } from '../tool-results.js'

/** More children than this in one tax year only the user adds in the app: a household has few, a runaway assistant many. */
export const MAX_CHILDREN_BY_ASSISTANT = 12

/** The key under which "is this child there yet, may one more come" is decided for one account and year. */
export const childLockKey = (userId: string, taxYear: number) => `mcp-child:${userId}:${taxYear}`

/** The children of the year as records, so the assistant can address the mask `kind` (ADR-0052 amendment 2). */
export function registerChildTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const children = deps.children
  if (!children) return
  // A child reads as its number and age (amendment 3, 6): no name, no initial, no birth year.
  const listed = (kinder: readonly { id: string; sequenceNumber: number; geburtsdatum: string }[], taxYear: number) =>
    kinder.map((k) => ({ instance: k.id, nummer: k.sequenceNumber, alterJahre: ageAtYearEnd(k.geburtsdatum, taxYear) }))
  const tooMany = () => refused(`TOO_MANY: Mehr als ${MAX_CHILDREN_BY_ASSISTANT} Kinder legt nur der Nutzer in der App an.`)

  server.tool(
    'kinder_auflisten',
    'Listet die Kinder des Steuerjahres mit ihrer `instance` für die Maske `kind`, als Nummer und Alter am Jahresende. Merke dir beim Anlegen, welche instance zu welchem Kind gehört.',
    { taxYear: taxYearArg() },
    async ({ taxYear }) => json({ kinder: listed((await children.list(userId, taxYear)).kinder, taxYear) }),
  )

  server.tool(
    'kind_anlegen',
    `Legt ein Kind für das Steuerjahr an und gibt seine \`instance\` zurück. Gibt es ein Kind mit demselben Vornamen und Geburtsdatum schon, kommt dessen instance zurück (\`bereitsVorhanden\`), statt es doppelt anzulegen. Mehr als ${MAX_CHILDREN_BY_ASSISTANT} Kinder je Jahr legt nur der Nutzer an. Alle weiteren Angaben (Kindergeld, Verwandtschaft, Krankenversicherung, Betreuung …) danach mit maske_eintragen, Maske \`kind\`, und dieser \`instance\`.`,
    {
      taxYear: taxYearArg(),
      firstName: z.string().trim().min(1).max(100).describe('Vorname des Kindes'),
      lastName: z.string().trim().min(1).max(100).describe('Nachname des Kindes'),
      geburtsdatum: z.string().max(10).regex(ISO_DATE_PATTERN).describe('Geburtsdatum im Format YYYY-MM-DD, spätestens am Ende des Steuerjahres'),
    },
    async ({ taxYear, firstName, lastName, geburtsdatum }) =>
      // Look for the same child, count, create and mark under one lock: two calls arriving together create the
      // child once, stay under the cap, and each names the child it created itself (MCP-23, H2-20). The mark
      // commits with the child, so no child is left that its assistant could not remove (H2-28).
      deps.locks.withLock(childLockKey(userId, taxYear), async () => {
        const existing = (await children.list(userId, taxYear)).kinder
        // The same child twice would count its allowance twice; a repeated call returns the one already there.
        // This tells the caller whether its own household has a child of that first name and birth date — data
        // of the account it acts for and may write (MCP-15, accepted: see the P4 report).
        const same = existing.find((k) => k.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() && k.geburtsdatum === geburtsdatum)
        if (same) return json({ ok: true, instance: same.id, nummer: same.sequenceNumber, bereitsVorhanden: true, hinweis: 'Dieses Kind gibt es schon; weitere Angaben mit maske_eintragen und dieser instance.' })
        if (existing.length >= MAX_CHILDREN_BY_ASSISTANT) return tooMany()
        const before = new Set(existing.map((k) => k.id))
        const response = await children.create(userId, taxYear, { firstName, lastName, geburtsdatum }, MAX_CHILDREN_BY_ASSISTANT).catch((error: unknown) => {
          if (error instanceof ConflictError && error.code === TOO_MANY_CHILDREN) return null
          throw error
        })
        if (response === null) return tooMany()
        const created = response.kinder.find((k) => !before.has(k.id))
        if (!created) return refused('INTERNAL_ERROR: Das Kind ließ sich nicht wiederfinden.')
        // Name and birth date are the assistant's entry like any other: unconfirmed, and so removable by it.
        await deps.confirmation.markUnconfirmed(userId, taxYear, ['firstName', 'lastName', 'geburtsdatum'].map((field) => provenanceKey('kind', field, created.id)), provenanceOf(assistant))
        return json({ ok: true, instance: created.id, nummer: created.sequenceNumber, hinweis: 'Weitere Angaben mit maske_eintragen, Maske "kind", instance wie angegeben.' })
      }),
  )

  server.tool(
    'kind_entfernen',
    'Entfernt ein Kind, das du selbst angelegt hast und an dem noch nichts bestätigt oder vom Nutzer eingetragen ist (z. B. ein versehentlich doppelt angelegtes). Ein Kind, das der Nutzer angelegt oder bestätigt hat, entfernt nur er in der App.',
    {
      taxYear: taxYearArg(),
      instance: instanceArg('Die instance des Kindes aus kinder_auflisten'),
    },
    async ({ taxYear, instance }) =>
      // Check and delete in one transaction: what the user enters on the child in between makes the delete
      // fail as a conflict instead of being lost with it (H2-28).
      deps.transactions.run(async () => {
        const child = (await children.list(userId, taxYear)).kinder.find((k) => k.id === instance)
        if (!child) return refused('NO_RECORD: Dieses Kind gibt es für das Jahr nicht.')
        const record = await ownRecord(deps, { userId, taxYear, screen: 'kind', instance, anchorField: 'firstName' }, assistant)
        if (!record.own) return refused('NOT_OWN_ENTRY: Dieses Kind hat der Nutzer angelegt oder schon bestätigt; entfernen kann es nur er in der App.')
        await children.delete(userId, taxYear, instance)
        await deps.confirmation.forget(userId, taxYear, record.keys)
        return json({ ok: true, entfernt: instance })
      }),
  )
}
