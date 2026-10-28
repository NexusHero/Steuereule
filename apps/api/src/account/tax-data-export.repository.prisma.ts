import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportTaxDataEntry, ExportTaxDataValue } from './export/export-document.js'
import type { TaxDataExportRepository } from './tax-data-export.repository.js'

// Technical keys carry no information about the person and would only leak internals.
const OMITTED_FIELDS = new Set(['id', 'userId', 'steuerjahr'])

type Row = Record<string, unknown> & { steuerjahr?: number | null }

export function toExportEntry(bereich: string, row: Row): ExportTaxDataEntry {
  const felder: Record<string, ExportTaxDataValue> = {}
  for (const [key, value] of Object.entries(row)) {
    if (OMITTED_FIELDS.has(key)) continue
    felder[key] = value instanceof Date ? value.toISOString() : (value as ExportTaxDataValue)
  }
  return { bereich, steuerjahr: row.steuerjahr ?? null, felder }
}

@Injectable()
export class PrismaTaxDataExportRepository implements TaxDataExportRepository {
  // ENCRYPTED_PRISMA so every @encrypted column arrives decrypted (ADR-0008).
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    const where = { userId }
    const [steuerjahre, antworten, belege, lstb, ch, rente, kapital, vermietung, bescheide, uebernahme] =
      await Promise.all([
        this.prisma.taxYear.findMany({ where }),
        this.prisma.interviewAnswer.findMany({ where }),
        this.prisma.beleg.findMany({ where }),
        this.prisma.lstb.findMany({ where }),
        this.prisma.chLohnausweis.findMany({ where }),
        this.prisma.rente.findMany({ where }),
        this.prisma.kapital.findMany({ where }),
        this.prisma.vermietungsobjekt.findMany({ where }),
        this.prisma.bescheid.findMany({ where }),
        this.prisma.uebernahmeKennzeichnung.findMany({ where }),
      ])

    const entries = [
      ...steuerjahre.map((row) => toExportEntry('Steuerjahr', row)),
      ...antworten.map((row) => toExportEntry('Interview-Antwort', row)),
      ...belege.map((row) => toExportEntry('Beleg', row)),
      ...lstb.map((row) => toExportEntry('Lohnsteuerbescheinigung', row)),
      ...ch.map((row) => toExportEntry('Lohnausweis (CH)', row)),
      ...rente.map((row) => toExportEntry('Rente', row)),
      ...kapital.map((row) => toExportEntry('Kapitalerträge', row)),
      ...vermietung.map((row) => toExportEntry('Vermietungsobjekt', row)),
      ...bescheide.map((row) => toExportEntry('Steuerbescheid', row)),
      ...uebernahme.map((row) => toExportEntry('Jahresübernahme', row)),
    ]
    // Stable order: by tax year (yearless Belege last), then area.
    return entries.sort(
      (a, b) =>
        (a.steuerjahr ?? Number.MAX_SAFE_INTEGER) - (b.steuerjahr ?? Number.MAX_SAFE_INTEGER) ||
        a.bereich.localeCompare(b.bereich, 'de'),
    )
  }
}
