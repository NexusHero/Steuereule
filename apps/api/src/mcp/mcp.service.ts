import { Inject, Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  maskTaxId,
  maskIban,
  maskStreet,
  maskHouseNumber,
  maskName,
  maskPhone,
  provenanceKey,
  SCREENS,
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
  ) {}

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
      },
      async ({ taxYear, screen, instance, field, value, receiptId }) => {
        assertScope(assistant, 'steuerdaten:write')
        const key = provenanceKey(screen, field, instance)
        const provenance: Provenance =
          receiptId !== undefined
            ? { kind: 'assistent', name: assistant.clientName, receiptId }
            : { kind: 'assistent', name: assistant.clientName }
        const result = await this.confirmationService.write(userId, taxYear, key, value, provenance)
        await this.auditService.append({ userId, action: 'WRITE', resource: 'maske_eintragen' })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  schluessel: key,
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

    return server
  }
}
