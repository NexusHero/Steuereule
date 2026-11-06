import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportTaxDataEntry, ExportTaxDataValue } from './export/export-document.js'
import type { TaxDataExportRepository } from './tax-data-export.repository.js'

const OMITTED_FIELDS = new Set(['id', 'userId', 'personAUserId', 'personBUserId', 'steuerjahr'])

type Row = Record<string, unknown> & { steuerjahr?: number | null }

export function toExportEntry(area: string, row: Row): ExportTaxDataEntry {
  const fields: Record<string, ExportTaxDataValue> = {}
  for (const [key, value] of Object.entries(row)) {
    if (OMITTED_FIELDS.has(key)) continue
    fields[key] = value instanceof Date ? value.toISOString() : (value as ExportTaxDataValue)
  }
  return { area, steuerjahr: row.steuerjahr ?? null, fields }
}

@Injectable()
export class PrismaTaxDataExportRepository implements TaxDataExportRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    const where = { userId }
    const [taxYears, answers, receipts, lstb, ch, pension, capital, commute, rental, assessments, markings, yearTakeovers, masterData, kinder, links, owlSetting, owlDismissals] =
      await Promise.all([
        this.prisma.taxYear.findMany({ where }),
        this.prisma.interviewAnswer.findMany({ where }),
        this.prisma.beleg.findMany({ where }),
        this.prisma.lstb.findMany({ where }),
        this.prisma.chLohnausweis.findMany({ where }),
        this.prisma.rente.findMany({ where }),
        this.prisma.kapital.findMany({ where }),
        this.prisma.arbeitsweg.findMany({ where }),
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
      ...taxYears.map((row) => toExportEntry('Steuerjahr', row)),
      ...answers.map((row) => toExportEntry('Interview-Antwort', row)),
      ...receipts.map((row) => toExportEntry('Beleg', row)),
      ...lstb.map((row) => toExportEntry('Lohnsteuerbescheinigung', row)),
      ...ch.map((row) => toExportEntry('Lohnausweis (CH)', row)),
      ...pension.map((row) => toExportEntry('Rente', row)),
      ...capital.map((row) => toExportEntry('Kapitalerträge', row)),
      ...commute.map((row) => toExportEntry('Arbeitsweg', row)),
      ...rental.map((row) => toExportEntry('Vermietungsobjekt', row)),
      ...assessments.map((row) => toExportEntry('Steuerbescheid', row)),
      ...markings.map((row) => toExportEntry('Herkunft und Bestätigung', row)),
      ...yearTakeovers.map((row) => toExportEntry('Jahresübernahme', row)),
      ...masterData.map((row) => toExportEntry('Erklärungs-Stammdaten', row)),
      ...kinder.map((row) => toExportEntry('Kind', row)),
      ...links.map((row) => toExportEntry('Steuerjahr-Kopplung', row)),
      ...owlSetting.map((row) => toExportEntry('Eulen-Modus-Einstellung', row)),
      ...owlDismissals.map((row) => toExportEntry('Eulen-Modus-Kartenverwurf', row)),
    ]
    return entries.sort(
      (a, b) =>
        (a.steuerjahr ?? Number.MAX_SAFE_INTEGER) - (b.steuerjahr ?? Number.MAX_SAFE_INTEGER) ||
        a.area.localeCompare(b.area, 'de'),
    )
  }
}
