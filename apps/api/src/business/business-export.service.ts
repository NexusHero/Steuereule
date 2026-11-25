import { Inject, Injectable } from '@nestjs/common'
import {
  appendLogRecord,
  balanceSheet,
  eBilanzInstance,
  gdpduExport,
  incomeStatement,
  anlagespiegel,
  kontennachweise,
  kontennachweisRequired,
  verfahrensdokumentation,
  type VerfahrensdokuPlaceholder,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
import { elsterTransmissionConfig, missingForTransmission, transmitEBilanz, type TransmissionMode, type TransmissionResult } from './elster-transmission.js'
import { BUSINESS_REPOSITORY, type BusinessRef, type BusinessRepository } from './business.repository.js'
import { registerAssetOf } from './business-ledger.js'
import { zipStored } from './zip.js'
import { BusinessContext } from './business-context.js'
import { LedgerService } from './ledger.service.js'
import { ledgerCall, parseJson } from './business-helpers.js'

/**
 * The exports of a book (ADR-0101 §17): the GoBD Z3 data export, the Verfahrensdokumentation and the
 * E-Bilanz with its transmission through the operator's ERiC sidecar.
 */
@Injectable()
export class BusinessExportService {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BusinessContext) private readonly context: BusinessContext,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

  /** The Z3 data export as a zip; the export itself is logged in the chain (GoBD Rz. 107). */
  async gobdExport(userId: string, year: number, ref: BusinessRef): Promise<Buffer> {
    await this.context.assertOpen(userId, year)
    await this.context.assertUnlocked(userId, year)
    const { chart, mode, profile } = await this.context.frame(userId, year, ref)
    const files = await this.repository.changeBook(userId, year, ref, { chart, mode }, (book) => {
      this.ledger.assertIntact(book)
      const meta = { supplierName: profile?.name ?? 'Einzelunternehmen', supplierLocation: 'Deutschland', from: `${year}-01-01`, to: `${year}-12-31` }
      const log = appendLogRecord(book.log, 'export', { kind: 'gdpdu', from: meta.from, to: meta.to }, this.context.now())
      return { result: gdpduExport(book.ledger, log, meta).files, append: { log: log.slice(book.log.length) } }
    })
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig-export' })
    return zipStored({
      ...files,
      'LIESMICH.txt':
        'Datenträgerüberlassung nach § 147 Abs. 6 AO im Beschreibungsstandard der Finanzverwaltung.\r\n' +
        'index.xml verweist auf die DTD gdpdu-01-09-2004.dtd; die DTD veröffentlicht das Bundesministerium der Finanzen und liegt dem Prüfprogramm der Finanzverwaltung bei.\r\n',
    })
  }

  async procedureDoc(userId: string, year: number, ref: BusinessRef) {
    await this.context.assertOpen(userId, year)
    const frame = await this.context.frame(userId, year, ref)
    if (frame.profile) await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return this.procedureDocOf(year, frame)
  }

  /** The Verfahrensdokumentation from the book's frame; the save answers with it without a further READ row. */
  private procedureDocOf(year: number, { chart, mode, profile }: Awaited<ReturnType<BusinessContext['frame']>>) {
    const stored = parseJson<Partial<Record<VerfahrensdokuPlaceholder, string>>>(profile?.procedureDoc ?? null, {})
    const values = {
      // What the app knows itself; the user's own values win.
      kontenrahmen: chart,
      gewinnermittlung: mode === 'euer' ? 'Einnahmenüberschussrechnung (§ 4 Abs. 3 EStG)' : 'Bestandsvergleich (Bilanz, § 4 Abs. 1, § 5 EStG)',
      // The image sets APP_VERSION="" when it was built without the commit (compose, CI): empty is "not known" too.
      appVersion: process.env.APP_VERSION?.trim() || 'aktuelle Fassung',
      verschluesselung: 'Feldverschlüsselung mit AES-256-GCM',
      ...(profile?.name ? { unternehmen: profile.name } : {}),
      ...(profile?.startDate ? { beginn: profile.startDate } : {}),
      ...stored,
    }
    return { values: stored, ...verfahrensdokumentation(values) }
  }

  async saveProcedureDoc(userId: string, year: number, ref: BusinessRef, values: Partial<Record<VerfahrensdokuPlaceholder, string>>) {
    await this.context.assertOpen(userId, year)
    await this.repository.saveProfile(userId, year, ref, { procedureDoc: JSON.stringify(values) })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig' })
    return this.procedureDocOf(year, await this.context.frame(userId, year, ref))
  }

  /** The E-Bilanz as XBRL, not transmitted (ADR-0101 §17); `download` is gated by the tier. */
  async eBilanz(userId: string, year: number, ref: BusinessRef, download: boolean): Promise<{ xbrl: string; transmitted: false; transmissionReady: boolean; note: string }> {
    await this.context.assertOpen(userId, year)
    if (download) await this.context.assertUnlocked(userId, year)
    const { book, ledger, profile } = await this.context.loaded(userId, year, ref)
    if (ledger.mode !== 'bilanz') throw new InvalidInputError('E_BILANZ_BILANZ_ONLY', 'Eine E-Bilanz gibt es nur bei der Bilanz.')
    if (book) this.ledger.assertIntact(book)
    const doc = parseJson<Partial<Record<VerfahrensdokuPlaceholder, string>>>(profile?.procedureDoc ?? null, {})
    const steuernummer = (doc.steuernummer ?? '').replaceAll(/\D/g, '')
    const assets = (await this.repository.listAssets(userId, ref, year)).map((r) => registerAssetOf(r, year))
    const xbrl = ledgerCall(() =>
      eBilanzInstance({
        company: { name: profile?.name ?? doc.unternehmen ?? 'Einzelunternehmen', steuernummer },
        fiscalYearBegin: `${year}-01-01`,
        fiscalYearEnd: `${year}-12-31`,
        balanceSheet: balanceSheet(ledger, year),
        incomeStatement: incomeStatement(ledger, year),
        statementType: 'steuerbilanz',
        anlagespiegel: { rows: anlagespiegel(ledger.chart, assets, year).rows },
        // From 2025 the Kontennachweise are part of the data set (§ 5b Abs. 1 EStG i. d. F. JStG 2024).
        ...(kontennachweisRequired(`${year}-01-01`) ? { kontennachweise: kontennachweise(ledger, year) } : {}),
      }),
    )
    await this.audit.append({ userId, action: 'READ', resource: download ? 'selbststaendig-export' : 'selbststaendig' })
    const ready = missingForTransmission(elsterTransmissionConfig()).length === 0
    return {
      xbrl,
      transmitted: false,
      transmissionReady: ready,
      note: ready
        ? 'Der Datensatz kann geprüft und an ELSTER übermittelt werden.'
        : 'Die Übermittlung an ELSTER ist auf diesem Server noch nicht eingerichtet (ERiC und Zertifikat des Betreibers fehlen). Bis dahin ist dies eine Vorschau des Datensatzes; die Elementnamen folgen der amtlichen Taxonomie, geprüft hat ihn ERiC noch nicht.',
    }
  }

  /**
   * Validates or sends the E-Bilanz through the operator's ERiC sidecar (ADR-0101 §17, §22). The paid
   * tier is needed for both; sending writes an export record into the book's log.
   */
  async transmitEBilanz(userId: string, year: number, ref: BusinessRef, mode: TransmissionMode): Promise<TransmissionResult> {
    await this.context.assertUnlocked(userId, year)
    const { xbrl } = await this.eBilanz(userId, year, ref, true)
    if (mode === 'validieren') {
      const result = await transmitEBilanz(xbrl, mode)
      await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig-elster' })
      return result
    }
    // Sending runs under the book's lock: two requests cannot both send; the ticket goes into the log.
    const { chart, mode: bookMode } = await this.context.frame(userId, year, ref)
    const result = await this.repository.changeBook<TransmissionResult>(userId, year, ref, { chart, mode: bookMode }, async (book) => {
      this.ledger.assertIntact(book)
      if (book.log.some((r) => r.kind === 'export' && (r.payload as { kind?: string } | null)?.kind === 'e-bilanz')) {
        throw new ConflictError('E_BILANZ_ALREADY_SENT', 'Die E-Bilanz für dieses Jahr ist schon übermittelt; eine Berichtigung macht die App nicht.')
      }
      const sent = await transmitEBilanz(xbrl, 'senden')
      if (sent.status !== 'ok') return { result: sent, append: {} }
      const log = appendLogRecord(book.log, 'export', { kind: 'e-bilanz', ticket: sent.ticket }, this.context.now())
      return { result: sent, append: { log: log.slice(book.log.length) } }
    })
    await this.audit.append({ userId, action: 'WRITE', resource: 'selbststaendig-elster' })
    return result
  }
}
