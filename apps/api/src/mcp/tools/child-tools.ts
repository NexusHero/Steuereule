import { z } from 'zod'
import { fieldsOfScreen, provenanceKey } from '@steuereule/core'
import { assertScope, json, refused, type McpDeps, type McpSession } from '../mcp-session.js'
import { ageAtYearEnd } from '../read-view.js'

/** The children of the year as records, so the assistant can address the mask `kind` (ADR-0052 amendment 2). */
export function registerChildTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const children = deps.children
  if (!children) return
  // A child reads as its number and age (amendment 3, 6): no name, no initial, no birth year.
  const listed = (kinder: readonly { id: string; sequenceNumber: number; geburtsdatum: string }[], taxYear: number) =>
    kinder.map((k) => ({ instance: k.id, nummer: k.sequenceNumber, alterJahre: ageAtYearEnd(k.geburtsdatum, taxYear) }))

  server.tool(
    'kinder_auflisten',
    'Listet die Kinder des Steuerjahres mit ihrer `instance` für die Maske `kind`, als Nummer und Alter am Jahresende. Merke dir beim Anlegen, welche instance zu welchem Kind gehört.',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'kinder_auflisten' })
      return json({ kinder: listed((await children.list(userId, taxYear)).kinder, taxYear) })
    },
  )

  server.tool(
    'kind_anlegen',
    'Legt ein Kind für das Steuerjahr an und gibt seine `instance` zurück. Alle weiteren Angaben (Kindergeld, Verwandtschaft, Krankenversicherung, Betreuung …) danach mit maske_eintragen, Maske `kind`, und dieser `instance`.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      firstName: z.string().min(1).max(100).describe('Vorname des Kindes'),
      lastName: z.string().min(1).max(100).describe('Nachname des Kindes'),
      geburtsdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Geburtsdatum im Format YYYY-MM-DD'),
    },
    async ({ taxYear, firstName, lastName, geburtsdatum }) => {
      assertScope(assistant, 'steuerdaten:write')
      const existing = (await children.list(userId, taxYear)).kinder
      // The same child twice would count its allowance twice; a repeated call returns the one already there.
      const same = existing.find((k) => k.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() && k.geburtsdatum === geburtsdatum)
      if (same) return json({ ok: true, instance: same.id, nummer: same.sequenceNumber, bereitsVorhanden: true, hinweis: 'Dieses Kind gibt es schon; weitere Angaben mit maske_eintragen und dieser instance.' })
      const before = new Set(existing.map((k) => k.id))
      const after = (await children.create(userId, taxYear, { firstName, lastName, geburtsdatum })).kinder
      await deps.audit.append({ userId, action: 'WRITE', resource: 'kind_anlegen' })
      const created = after.find((k) => !before.has(k.id))
      // Name and birth date are the assistant's entry like any other: unconfirmed, and so removable by it.
      if (created) await deps.confirmation.markUnconfirmed(userId, taxYear, ['firstName', 'lastName', 'geburtsdatum'].map((field) => provenanceKey('kind', field, created.id)), { kind: 'assistent', name: assistant.clientName })
      return json({ ok: true, instance: created?.id ?? null, nummer: created?.sequenceNumber ?? null, hinweis: 'Weitere Angaben mit maske_eintragen, Maske "kind", instance wie angegeben.' })
    },
  )

  server.tool(
    'kind_entfernen',
    'Entfernt ein Kind, das du selbst angelegt hast und an dem noch nichts bestätigt oder vom Nutzer eingetragen ist (z. B. ein versehentlich doppelt angelegtes). Ein Kind, das der Nutzer angelegt oder bestätigt hat, entfernt nur er in der App.',
    {
      taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      instance: z.string().describe('Die instance des Kindes aus kinder_auflisten'),
    },
    async ({ taxYear, instance }) => {
      assertScope(assistant, 'steuerdaten:write')
      const child = (await children.list(userId, taxYear)).kinder.find((k) => k.id === instance)
      if (!child) return refused('NO_RECORD: Dieses Kind gibt es für das Jahr nicht.')
      const prefix = `kind:${instance}.`
      const markings = (await deps.confirmation.list(userId, taxYear)).filter((m) => m.key.startsWith(prefix))
      const own = (m: (typeof markings)[number]) => !m.confirmed && m.proposal === null && m.provenance.kind === 'assistent' && m.provenance.name === assistant.clientName
      const keys = fieldsOfScreen('kind').map((spec) => provenanceKey('kind', spec.field, instance))
      const values = await deps.confirmation.readRawValues(userId, taxYear, keys)
      // Every value of the child must be this assistant's unconfirmed entry; one the user typed or confirmed keeps the child.
      const untouched = keys.every((key) => values[key] === null || values[key] === undefined || values[key] === '' || markings.some((m) => m.key === key && own(m)))
      if (!untouched || markings.some((m) => !own(m)) || !markings.some((m) => m.key === `${prefix}firstName`)) {
        return refused('NOT_OWN_ENTRY: Dieses Kind hat der Nutzer angelegt oder schon bestätigt; entfernen kann es nur er in der App.')
      }
      await children.delete(userId, taxYear, instance)
      await deps.confirmation.forget(userId, taxYear, markings.map((m) => m.key))
      await deps.audit.append({ userId, action: 'WRITE', resource: 'kind_entfernen' })
      return json({ ok: true, entfernt: instance })
    },
  )
}
