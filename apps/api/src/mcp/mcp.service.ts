import { Inject, Injectable, Optional } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  maskTaxId,
  maskIban,
  maskStreet,
  maskHouseNumber,
  maskName,
  maskPhone,
  checkDraftPerson,
  PERSON_B_HANDLE,
  provenanceKey,
  SCREENS,
  type AdvisorHousehold,
  RECEIPT_TYPES,
  type ReceiptType,
  type Provenance,
} from '@steuereule/core'
import { CockpitService } from '../cockpit/cockpit.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { ReceiptService } from '../receipt/receipt.service.js'
import { UnlockService } from '../unlock/unlock.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { LinkService } from '../link/link.service.js'
import { ChildrenService } from '../children/children.service.js'
import { checkStageValue, validateStageTarget } from '../ki/advisor-safety.js'
import { registerAdviceTools } from './mcp-advice-tools.js'
import { McpReportService } from './mcp-report.service.js'

export interface AssistantSessionInfo {
  readonly clientId: string
  readonly clientName: string
  readonly scopes: readonly string[]
}

function assertScope(assistant: AssistantSessionInfo, requiredScope: string): void {
  if (!assistant.scopes.includes(requiredScope)) {
    throw new Error(`Fehlender OAuth-Scope: ${requiredScope}. Dem Assistenten wurde diese Berechtigung nicht erteilt.`)
  }
}

/**
 * Remote MCP Server providing domain-specific tools for AI assistants.
 * Traces to: ADR-0052 §3 (Werkzeuge), §5 (Bezahlung), §8 (Maskierung), §12 (Eulen-Modus).
 */
@Injectable()
export class McpService {
  constructor(
    @Inject(CockpitService) private readonly cockpitService: CockpitService,
    @Inject(PrintoutService) private readonly printoutService: PrintoutService,
    @Inject(ConfirmationService) private readonly confirmationService: ConfirmationService,
    @Inject(OwlModeService) private readonly owlModeService: OwlModeService,
    @Inject(ReceiptService) private readonly receiptService: ReceiptService,
    @Inject(UnlockService) private readonly unlockService: UnlockService,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterDataRepository: MasterDataRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(McpReportService) private readonly report?: McpReportService,
    /** The joint return (ADR-0054): whose data a value for Person B goes to. */
    @Optional() @Inject(LinkService) private readonly link?: Pick<LinkService, 'spouseForAdvisor' | 'dataUser'>,
    /** A child is a record of its own: the mask `kind` needs its id as `instance`. */
    @Optional() @Inject(ChildrenService) private readonly children?: Pick<ChildrenService, 'list' | 'create'>,
  ) {}

  /**
   * Whose data an entry writes, with the in-app advisor's rules (`checkDraftPerson`): Person B only in a
   * joint return the user records for, only on B's own masks, and on those masks the person is required.
   */
  private async dataUserFor(userId: string, taxYear: number, screen: (typeof SCREENS)[number], field: string, person: 'A' | 'B' | undefined): Promise<{ ok: true; dataUserId: string } | { ok: false; error: string }> {
    const spouse = await this.link?.spouseForAdvisor(userId, taxYear)
    const household: AdvisorHousehold = { personB: spouse ? { handle: PERSON_B_HANDLE, recordable: spouse.recordable, figures: null } : null }
    const check = checkDraftPerson(household, person, screen, field)
    if (!check.ok) return { ok: false, error: `${check.code}: ${check.reason}` }
    if (person !== 'B' || !this.link) return { ok: true, dataUserId: userId }
    return { ok: true, dataUserId: await this.link.dataUser(userId, taxYear, 'B') }
  }

  createServer(userId: string, assistant: AssistantSessionInfo): McpServer {
    const server = new McpServer({
      name: 'SteuerEule MCP Server',
      version: '1.0.0',
    })

    // 1. Tool: steuerjahr_stand (Lesen maskiert, ADR-0052 §8)
    server.tool(
      'steuerjahr_stand',
      'Liest den aktuellen Bearbeitungsstand, die geschätzte Erstattung/Nachzahlung und erfasste Abschnitte für ein Steuerjahr. Personenbezogene Daten werden maskiert zurückgegeben.',
      {
        taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      },
      async ({ taxYear }) => {
        assertScope(assistant, 'steuerdaten:read')
        await this.auditService.append({ userId, action: 'READ', resource: 'steuerjahr_stand' })

        const summary = await this.cockpitService.getSummary(userId, taxYear)
        const profile = await this.profileRepository.findByUserId(userId)
        const masterData = await this.masterDataRepository.findByUserId(userId)

        const maskedData = {
          steuerjahr: taxYear,
          status: summary?.status ?? null,
          openItems: summary?.openItems ?? 0,
          profil: profile
            ? {
                firstName: maskName(profile.firstName),
                lastName: maskName(profile.lastName),
                steuerId: maskTaxId(profile.steuerId),
                steuernummer: maskTaxId(profile.steuernummer),
              }
            : null,
          stammdaten: masterData
            ? {
                beruf: masterData.beruf,
                familienstand: masterData.familienstand,
                strasse: maskStreet(masterData.strasse),
                hausnummer: maskHouseNumber(masterData.hausnummer),
                plz: masterData.plz,
                wohnort: masterData.wohnort,
                iban: maskIban(masterData.iban),
                telefon: maskPhone(masterData.telefon),
              }
            : null,
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(maskedData, null, 2),
            },
          ],
        }
      },
    )

    // 2. Tool: ausdruck_vorpruefung (Was fehlt für den Ausdruck, ADR-0052 §3)
    server.tool(
      'ausdruck_vorpruefung',
      'Prüft, welche Angaben für den amtlichen Papierausdruck des Steuerjahres noch fehlen oder unbestätigt sind.',
      {
        taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
      },
      async ({ taxYear }) => {
        assertScope(assistant, 'steuerdaten:read')
        await this.auditService.append({ userId, action: 'READ', resource: 'ausdruck_vorpruefung' })

        const { missing } = await this.printoutService.check(userId, taxYear)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  steuerjahr: taxYear,
                  druckfaehig: missing.length === 0,
                  fehlend: missing,
                },
                null,
                2,
              ),
            },
          ],
        }
      },
    )

    // 3. Tool: maske_eintragen (Schreiben unbestätigt, ADR-0052 §6/§7)
    server.tool(
      'maske_eintragen',
      'Trägt einen Wert in eine Erfassungsmaske ein. Der Wert wird als unbestätigt markiert und muss vom Nutzer in der App bestätigt werden. Hat der Nutzer bereits einen Wert bestätigt, wird der neue Wert als Vorschlag hinterlegt.',
      {
        taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)'),
        screen: z.enum(SCREENS).describe('Die Erfassungsmaske (z.B. lstb, interview, kind, vermietung)'),
        instance: z.string().optional().describe('Instanz-ID bei mehrfachen Objekten (z.B. Vermietungsobjekt oder Kind)'),
        field: z.string().describe('Der Feldbezeichner (z.B. bruttoarbeitslohn, mieteinnahmen)'),
        value: z.string().nullable().describe('Der einzutragende Wert als String, oder null'),
        receiptId: z.string().optional().describe('Optionale Beleg-ID als Herkunftsnachweis'),
        person: z.enum(['A', 'B']).optional().describe('Bei Zusammenveranlagung: A der Nutzer, B Ehegatte oder Ehegattin. Pflicht in den Masken lstb, chLohnausweis, commute, rente, profil, stammdaten, sobald es Person B gibt.'),
      },
      async ({ taxYear, screen, instance, field, value, receiptId, person }) => {
        assertScope(assistant, 'steuerdaten:write')
        // The same target and value checks as the in-app advisor (unknown field, never-writable field,
        // booking mask, catalogue value rules). The user's own assistant may write personal fields (ADR-0052 §8).
        const target = validateStageTarget(screen, field, true)
        if (!target.ok) {
          const error = target.error.startsWith('USE_BOOKING_TOOL') ? 'USE_BOOKING_TOOL: Buchungen sind über diesen Zugang noch nicht möglich; der Nutzer bucht in der App.' : target.error
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error }, null, 2) }] }
        }
        // Store what the catalogue tidied ("50.000" → "50000"), never the raw input, under the trimmed name.
        const cleanField = field.trim()
        let cleanValue: string | null = null
        if (value !== null) {
          const checked = checkStageValue(screen, cleanField, value)
          if (!checked.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: checked.error }, null, 2) }] }
          cleanValue = checked.value
        }
        const whose = await this.dataUserFor(userId, taxYear, screen, cleanField, person)
        if (!whose.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: whose.error }, null, 2) }] }
        const key = provenanceKey(screen, cleanField, instance)
        const provenance: Provenance =
          receiptId !== undefined
            ? { kind: 'assistent', name: assistant.clientName, receiptId }
            : { kind: 'assistent', name: assistant.clientName }
        const result = await this.confirmationService.write(whose.dataUserId, taxYear, key, cleanValue, provenance)
        await this.auditService.append({ userId, action: 'WRITE', resource: 'maske_eintragen' })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  schluessel: key,
                  ...(person === 'B' ? { person: 'B' } : {}),
                  ergebnis: result,
                  hinweis:
                    result === 'vorschlag'
                      ? 'Der Nutzer hat diesen Wert bereits bestätigt. Die Eingabe wurde als Vorschlag hinterlegt.'
                      : 'Der Wert wurde unbestätigt eingetragen und muss vom Nutzer in der App geprüft und bestätigt werden.',
                },
                null,
                2,
              ),
            },
          ],
        }
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
        await this.auditService.append({ userId, action: 'READ', resource: 'eulen_hinweise' })

        const cardsDto = await this.owlModeService.getCards(userId, taxYear)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cardsDto, null, 2),
            },
          ],
        }
      },
    )

    // 5. Tool: beleg_hochladen (Beleg im Posteingang erfassen, ADR-0052 §11)
    server.tool(
      'beleg_hochladen',
      'Erfasst einen Beleg im Beleg-Posteingang des Nutzers.',
      {
        fileName: z.string().describe('Dateiname des Belegs (z.B. spendenquittung.pdf)'),
        kind: z.string().optional().describe('Belegart (z.B. spenden, werbungskosten)'),
        taxYear: z.number().int().optional().describe('Steuerjahr, dem der Beleg zugeordnet werden soll'),
        belegdatum: z.string().optional().describe('Belegdatum im Format YYYY-MM-DD'),
        zahlungsdatum: z.string().optional().describe('Zahlungsdatum im Format YYYY-MM-DD'),
      },
      async ({ fileName, kind, taxYear, belegdatum, zahlungsdatum }) => {
        assertScope(assistant, 'belege:write')
        const validatedKind: ReceiptType | undefined =
          kind !== undefined && (RECEIPT_TYPES as readonly string[]).includes(kind) ? (kind as ReceiptType) : undefined

        const created = await this.receiptService.create(userId, {
          fileName,
          ...(validatedKind !== undefined ? { kind: validatedKind } : {}),
          ...(belegdatum !== undefined ? { belegdatum } : {}),
          ...(zahlungsdatum !== undefined ? { zahlungsdatum } : {}),
        })

        if (taxYear !== undefined) {
          await this.receiptService.setAssignment(userId, created.id, { taxYear })
        }
        await this.auditService.append({ userId, action: 'WRITE', resource: 'beleg' })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  belegId: created.id,
                  dateiname: created.fileName,
                  steuerjahr: taxYear ?? null,
                  status: 'erfasst',
                },
                null,
                2,
              ),
            },
          ],
        }
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
        await this.auditService.append({ userId, action: 'READ', resource: 'zahllink_anfordern' })

        const { checkoutUrl } = await this.unlockService.startCheckout(userId, taxYear)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  steuerjahr: taxYear,
                  checkoutUrl,
                  hinweis: 'Der Bezahlvorgang muss vom Kontoinhaber im Browser abgeschlossen werden.',
                },
                null,
                2,
              ),
            },
          ],
        }
      },
    )

    registerAdviceTools(server, assistant, {
      requireRead: (who) => assertScope(who, 'steuerdaten:read'),
      audit: (resource) => this.auditService.append({ userId, action: 'READ', resource }),
    })
    this.registerReportTools(server, userId, assistant)
    this.registerChildTools(server, userId, assistant)

    return server
  }

  /** Feedback for the assistant's user: the state in words, the questions only they can answer, an entry's effect (ADR-0052 amendment 2). */
  private registerReportTools(server: McpServer, userId: string, assistant: AssistantSessionInfo): void {
    const report = this.report
    if (!report) return
    const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })

    server.tool(
      'steuerbericht',
      'Liefert den Stand der Erklärung zum Weitersagen an den Nutzer: die Schätzung der App (Erstattung oder Nachzahlung), was für den Ausdruck fehlt, was der Nutzer noch bestätigen muss, offene Interview-Fragen und die nächsten Schritte. Rufe es nach jedem größeren Eintrag auf und gib dem Nutzer eine verständliche Zusammenfassung.',
      { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
      async ({ taxYear }) => {
        assertScope(assistant, 'steuerdaten:read')
        await this.auditService.append({ userId, action: 'READ', resource: 'steuerbericht' })
        return json(await report.report(userId, taxYear))
      },
    )

    server.tool(
      'offene_fragen',
      'Nennt die nächste offene Interview-Frage der App mit ihren möglichen Antworten und wie viele noch folgen. Das sind Tatsachen, die nur der Nutzer kennt: Frage ihn und trage die Antwort mit maske_eintragen (Maske "interview") ein. Erfinde nie eine Antwort.',
      { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
      async ({ taxYear }) => {
        assertScope(assistant, 'steuerdaten:read')
        await this.auditService.append({ userId, action: 'READ', resource: 'offene_fragen' })
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
        await this.auditService.append({ userId, action: 'READ', resource: 'auswirkung_simulieren' })
        const target = validateStageTarget(screen, field, true)
        if (!target.ok) return json({ ok: false, error: target.error })
        const checked = checkStageValue(screen, field, value)
        if (!checked.ok) return json({ ok: false, error: checked.error })
        const whose = await this.dataUserFor(userId, taxYear, screen, field.trim(), person)
        if (!whose.ok) return json({ ok: false, error: whose.error })
        return json(await report.simulate(userId, taxYear, screen, field.trim(), checked.value, instance, whose.dataUserId))
      },
    )
  }

  /** The children of the year as records, so the assistant can address the mask `kind` (ADR-0052 amendment 2). */
  private registerChildTools(server: McpServer, userId: string, assistant: AssistantSessionInfo): void {
    const children = this.children
    if (!children) return
    const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
    // Names of third parties only masked (§8): the number and birth year tell the children apart.
    const listed = (kinder: readonly { id: string; sequenceNumber: number; firstName: string; geburtsdatum: string }[]) =>
      kinder.map((k) => ({ instance: k.id, nummer: k.sequenceNumber, vorname: maskName(k.firstName), geburtsjahr: k.geburtsdatum.slice(0, 4) }))

    server.tool(
      'kinder_auflisten',
      'Listet die Kinder des Steuerjahres mit ihrer `instance` für die Maske `kind` (Vorname maskiert, Geburtsjahr). Vor dem Anlegen prüfen, ob das Kind schon da ist.',
      { taxYear: z.number().int().describe('Das Steuerjahr (z.B. 2024 oder 2025)') },
      async ({ taxYear }) => {
        assertScope(assistant, 'steuerdaten:read')
        await this.auditService.append({ userId, action: 'READ', resource: 'kinder_auflisten' })
        return json({ kinder: listed((await children.list(userId, taxYear)).kinder) })
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
        const before = new Set((await children.list(userId, taxYear)).kinder.map((k) => k.id))
        const after = (await children.create(userId, taxYear, { firstName, lastName, geburtsdatum })).kinder
        await this.auditService.append({ userId, action: 'WRITE', resource: 'kind_anlegen' })
        const created = after.find((k) => !before.has(k.id))
        return json({ ok: true, instance: created?.id ?? null, nummer: created?.sequenceNumber ?? null, hinweis: 'Weitere Angaben mit maske_eintragen, Maske "kind", instance wie angegeben.' })
      },
    )
  }
}
