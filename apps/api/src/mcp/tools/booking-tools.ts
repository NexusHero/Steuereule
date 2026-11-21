import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { checkBookingDraft, decomposeProvenanceKey, parseBookingDraft, provenanceKey, serializeBookingDraft, type BookingDraft } from '@steuereule/core'
import { OWN_FIRST_BUSINESS } from '../../business/business.repository.js'
import { DomainError } from '../../common/domain-error.js'
import { TOOL_ARG_SCHEMAS } from '../../ki/advisor-tools.js'
import { assertScope, isOwnProvenance, json, provenanceOf, refused, type McpDeps, type McpSession } from '../mcp-session.js'

/** How many drafts of one assistant may wait for the user at once in a year. */
export const MAX_OPEN_BOOKING_DRAFTS = 25

const BOOKING_FIELD = 'entry'

/** A draft as the assistant reads it back: the booking itself, in cents, without anything else of the book. */
function describeDraft(instance: string, draft: BookingDraft) {
  return {
    entwurf: instance,
    datum: draft.date,
    belegnummer: draft.documentNumber,
    text: draft.text,
    summeCent: draft.lines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + line.amount, 0),
    zeilen: draft.lines.map((line) => ({ konto: line.account, seite: line.side, betragCent: line.amount, ...(line.taxKey === undefined ? {} : { steuerschluessel: line.taxKey }) })),
    ...(draft.asset === undefined ? {} : { anlagegut: { bezeichnung: draft.asset.label, abschreibung: draft.asset.method } }),
  }
}

/**
 * Booking drafts for the self-employed (#549, ADR-0101 §18, ADR-0052 amendment 6): checked as the in-app
 * advisor checks them, filed as an open proposal on `buchung:<entwurf>.entry`, and posted only when the user
 * takes it on "Prüfen & bestätigen". An own open draft is taken back with eintrag_zuruecknehmen.
 */
export function registerBookingTools(session: McpSession, deps: McpDeps): void {
  const { server, userId, assistant } = session
  const business = deps.business
  if (!business) return

  /** The open drafts this assistant filed in the year, oldest key first. */
  async function ownOpenDrafts(taxYear: number): Promise<{ instance: string; draft: BookingDraft }[]> {
    const markings = await deps.confirmation.list(userId, taxYear)
    return markings.flatMap((marking) => {
      if (!marking.key.startsWith('buchung:') || marking.proposal === null || marking.proposal.value === null) return []
      if (!isOwnProvenance(marking.proposal.provenance, assistant)) return []
      const parsed = parseBookingDraft(marking.proposal.value)
      const { instance } = decomposeProvenanceKey(marking.key)
      return parsed.ok && instance !== null ? [{ instance, draft: parsed.draft }] : []
    })
  }

  server.tool(
    'buchung_entwerfen',
    'Bereitet für Selbstständige eine Buchung als Entwurf vor. Gebucht wird nichts: Der Entwurf wartet in der App unter „Prüfen & bestätigen“, bis der Nutzer ihn übernimmt oder verwirft. Beträge in ganzen Cent, `side` debit (Soll) oder credit (Haben), Konten aus dem Kontenrahmen des Buchs, `taxKey` z. B. ust19, ust7, vst19, vst7, kleinunternehmer, none; Bruttobeträge teilt die App selbst auf. Für ein Anlagegut `asset` mit Abschreibung. Die App prüft Konten, Steuerschlüssel, Ausgleich von Soll und Haben und die Festschreibung und nennt sonst den Grund. Eigene offene Entwürfe: buchungsentwuerfe_auflisten; zurücknehmen mit eintrag_zuruecknehmen (Maske "buchung", Feld "entry", instance = entwurf).',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'), ...TOOL_ARG_SCHEMAS.stage_booking_draft.shape },
    async ({ taxYear, label, reason: _reason, ...raw }) => {
      assertScope(assistant, 'steuerdaten:write')
      if ((await business.digest(userId, taxYear)) === null) return refused('NO_BOOK: Für dieses Jahr gibt es kein Buch (keine Selbstständigkeit oder noch nicht freigeschaltet).')
      const parsed = parseBookingDraft(JSON.stringify(raw))
      if (!parsed.ok) return refused(`INVALID_BOOKING: ${parsed.reason}`)
      const target = await business.bookingTarget(userId, taxYear, OWN_FIRST_BUSINESS)
      const check = checkBookingDraft(parsed.draft, { chart: target.chart, mode: target.mode, year: taxYear, lockedThrough: target.lockedThrough, smallBusiness: target.smallBusiness })
      if (!check.ok) return refused(`${check.code.toUpperCase()}: ${check.reason}`)
      if ((await ownOpenDrafts(taxYear)).length >= MAX_OPEN_BOOKING_DRAFTS) {
        return refused(`TOO_MANY_DRAFTS: Es warten schon ${MAX_OPEN_BOOKING_DRAFTS} deiner Entwürfe auf den Nutzer. Er muss erst welche übernehmen oder verwerfen.`)
      }
      // Each draft is its own booking: its reference is the instance the confirmation path posts it under.
      const instance = `entwurf-${randomUUID().slice(0, 12)}`
      try {
        await deps.confirmation.fileProposal(userId, taxYear, provenanceKey('buchung', BOOKING_FIELD, instance), serializeBookingDraft(parsed.draft), provenanceOf(assistant))
      } catch (error) {
        if (error instanceof DomainError) return refused(`${error.code}: ${error.message}`)
        throw error
      }
      await deps.audit.append({ userId, action: 'WRITE', resource: 'buchung_entwerfen' })
      return json({
        ok: true,
        ergebnis: 'vorschlag',
        entwurf: instance,
        titel: label,
        buchung: describeDraft(instance, parsed.draft),
        hinweis: 'Nichts ist gebucht. Der Nutzer übernimmt oder verwirft den Entwurf in der App unter „Prüfen & bestätigen“.',
      })
    },
  )

  server.tool(
    'buchungsentwuerfe_auflisten',
    'Listet deine Buchungsentwürfe des Steuerjahres, über die der Nutzer noch nicht entschieden hat (übernommene oder verworfene erscheinen nicht mehr).',
    { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
    async ({ taxYear }) => {
      assertScope(assistant, 'steuerdaten:read')
      await deps.audit.append({ userId, action: 'READ', resource: 'buchungsentwuerfe_auflisten' })
      const drafts = await ownOpenDrafts(taxYear)
      return json({ taxYear, entwuerfe: drafts.map(({ instance, draft }) => describeDraft(instance, draft)) })
    },
  )
}
