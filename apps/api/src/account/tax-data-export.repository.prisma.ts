import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportTaxDataEntry, ExportTaxDataValue } from './export/export-document.js'
import type { TaxDataExportRepository } from './tax-data-export.repository.js'

const OMITTED_FIELDS = new Set(['id', 'userId', 'personAUserId', 'personBUserId', 'steuerjahr'])

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
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    const where = { userId }
    const [steuerjahre, antworten, belege, lstb, ch, rente, kapital, vermietung, bescheide, kennzeichnungen, jahresuebernahmen, stammdaten, kinder, kopplungen, eulenEinstellung, eulenVerwuerfe] =
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
        this.prisma.kennzeichnung.findMany({ where }),
        this.prisma.jahresuebernahme.findMany({ where }),
        this.prisma.stammdaten.findMany({ where }),
        this.prisma.kind.findMany({ where }),
        this.prisma.steuerjahrKopplung.findMany({
          where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] },
        }),
        this.prisma.eulenEinstellung.findMany({ where }),
        this.prisma.eulenKartenVerwurf.findMany({ where }),
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
      ...kennzeichnungen.map((row) => toExportEntry('Herkunft und Bestätigung', row)),
      ...jahresuebernahmen.map((row) => toExportEntry('Jahresübernahme', row)),
      ...stammdaten.map((row) => toExportEntry('Erklärungs-Stammdaten', row)),
      ...kinder.map((row) => toExportEntry('Kind', row)),
      ...kopplungen.map((row) => toExportEntry('Steuerjahr-Kopplung', row)),
      ...eulenEinstellung.map((row) => toExportEntry('Eulen-Modus-Einstellung', row)),
      ...eulenVerwuerfe.map((row) => toExportEntry('Eulen-Modus-Kartenverwurf', row)),
    ]
    return entries.sort(
      (a, b) =>
        (a.steuerjahr ?? Number.MAX_SAFE_INTEGER) - (b.steuerjahr ?? Number.MAX_SAFE_INTEGER) ||
        a.bereich.localeCompare(b.bereich, 'de'),
    )
  }
}
