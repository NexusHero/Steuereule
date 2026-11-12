import { Inject, Injectable, Optional } from '@nestjs/common'
import { PersonSealService } from '../household/person-seal.service.js'
import { Prisma } from '@prisma/client'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportTaxDataEntry, ExportTaxDataValue } from './export/export-document.js'
import type { TaxDataExportRepository } from './tax-data-export.repository.js'

const OMITTED_FIELDS = new Set([
  'id',
  'userId',
  'personAUserId',
  'personBUserId',
  'taxYear',
  'receiptId',
  'iv',
  'authTag',
  'cipherBytes',
  'keyVersion',
])

/**
 * The export names every figure by its database column. The columns keep their German names through
 * `@map`, so the file a person downloads (Art. 15/20 DSGVO) does not change when the code's names do.
 */
const COLUMNS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, new Map(model.fields.map((field) => [field.name, field.dbName ?? field.name]))]),
)

type Row = Record<string, unknown> & { taxYear?: number | null }

export function toExportEntry(area: string, model: Prisma.ModelName, row: Row): ExportTaxDataEntry {
  const columns = COLUMNS.get(model)
  const fields: Record<string, ExportTaxDataValue> = {}
  for (const [key, value] of Object.entries(row)) {
    if (OMITTED_FIELDS.has(key) || value instanceof Uint8Array) continue
    fields[columns?.get(key) ?? key] = value instanceof Date ? value.toISOString() : (value as ExportTaxDataValue)
  }
  return { area, taxYear: row.taxYear ?? null, fields }
}

@Injectable()
export class PrismaTaxDataExportRepository implements TaxDataExportRepository {
  constructor(
    @Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient,
    @Optional() @Inject(PersonSealService) private readonly seal?: PersonSealService,
  ) {}

  async findAllForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    const where = { userId }
    const [taxYears, answers, receiptFiles, receipts, lstb, ch, pension, capital, commute, rental, assessments, markings, yearTakeovers, masterData, kinder, links, owlSetting, owlDismissals, advisorMessages, advisorConversations, advisorNotes] =
      await Promise.all([
        this.prisma.taxYear.findMany({ where }),
        this.prisma.interviewAnswer.findMany({ where }),
        this.prisma.receiptFile.findMany({ where }),
        this.prisma.receipt.findMany({ where }),
        this.prisma.lstb.findMany({ where }),
        this.prisma.chSalaryCertificate.findMany({ where }),
        this.prisma.pension.findMany({ where }),
        this.prisma.capital.findMany({ where }),
        this.prisma.commute.findMany({ where }),
        this.prisma.rentalProperty.findMany({ where }),
        this.prisma.assessment.findMany({ where }),
        this.prisma.marking.findMany({ where }),
        this.prisma.yearTakeover.findMany({ where }),
        this.prisma.masterData.findMany({ where }),
        this.prisma.child.findMany({ where }),
        this.prisma.taxYearLink.findMany({
          where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] },
        }),
        this.prisma.owlSetting.findMany({ where }),
        this.prisma.owlCardDismissal.findMany({ where }),
        this.prisma.advisorChatMessage.findMany({ where }),
        this.prisma.advisorConversation.findMany({ where }),
        this.prisma.advisorNote.findMany({ where }),
      ])
    // ADR-0062: household people are sealed under their own key — the export shows them readable.
    const household = await this.prisma.householdPerson.findMany({ where: { householdUserId: userId }, include: { memberships: true } })
    const householdRows = await Promise.all(
      household.map(async ({ sealed, memberships, ...row }) => {
        const facts = this.seal ? await this.seal.unseal(row.id, sealed) : null
        return {
          ...row,
          firstName: facts?.firstName ?? null,
          lastName: facts?.lastName ?? null,
          birthDate: facts?.birthDate ?? null,
          taxId: facts?.taxId ?? null,
          diedOn: facts?.diedOn ?? null,
          years: memberships.map((m) => m.taxYear).sort().join(', '),
        }
      }),
    )
    const partnerLinks = await this.prisma.partnerLink.findMany({ where: { OR: [{ personAUserId: userId }, { personBUserId: userId }] } })
    const mergeQuestions = await this.prisma.householdMergeCandidate.findMany({ where: { householdUserId: userId } })

    const entries = [
      ...taxYears.map((row) => toExportEntry('Steuerjahr', 'TaxYear', row)),
      ...answers.map((row) => toExportEntry('Interview-Antwort', 'InterviewAnswer', row)),
      ...receiptFiles.map((row) => toExportEntry('Beleg-Datei', 'ReceiptFile', row)),
      ...receipts.map((row) => toExportEntry('Beleg', 'Receipt', row)),
      ...lstb.map((row) => toExportEntry('Lohnsteuerbescheinigung', 'Lstb', row)),
      ...ch.map((row) => toExportEntry('Lohnausweis (CH)', 'ChSalaryCertificate', row)),
      ...pension.map((row) => toExportEntry('Rente', 'Pension', row)),
      ...capital.map((row) => toExportEntry('Kapitalerträge', 'Capital', row)),
      ...commute.map((row) => toExportEntry('Arbeitsweg', 'Commute', row)),
      ...rental.map((row) => toExportEntry('Vermietungsobjekt', 'RentalProperty', row)),
      ...assessments.map((row) => toExportEntry('Steuerbescheid', 'Assessment', row)),
      ...markings.map((row) => toExportEntry('Herkunft und Bestätigung', 'Marking', row)),
      ...yearTakeovers.map((row) => toExportEntry('Jahresübernahme', 'YearTakeover', row)),
      ...masterData.map((row) => toExportEntry('Erklärungs-Stammdaten', 'MasterData', row)),
      ...kinder.map((row) => toExportEntry('Kind', 'Child', row)),
      ...links.map((row) => toExportEntry('Steuerjahr-Kopplung', 'TaxYearLink', row)),
      ...owlSetting.map((row) => toExportEntry('Eulen-Modus-Einstellung', 'OwlSetting', row)),
      ...owlDismissals.map((row) => toExportEntry('Eulen-Modus-Kartenverwurf', 'OwlCardDismissal', row)),
      ...advisorConversations.map((row) => toExportEntry('Steuerberater-Chat (Gespräche)', 'AdvisorConversation', row)),
      ...advisorMessages.map((row) => toExportEntry('Steuerberater-Chat', 'AdvisorChatMessage', row)),
      ...advisorNotes.map((row) => toExportEntry('Steuerberater-Chat (Projektnotizen)', 'AdvisorNote', row)),
      ...householdRows.map((row) => toExportEntry('Haushalt (Person)', 'HouseholdPerson', row)),
      ...partnerLinks.map((row) => toExportEntry('Partner-Verknüpfung', 'PartnerLink', row)),
      ...mergeQuestions.map((row) => toExportEntry('Haushalt (Rückfrage „dieselben?“)', 'HouseholdMergeCandidate', row)),
    ]
    return entries.sort(
      (a, b) =>
        (a.taxYear ?? Number.MAX_SAFE_INTEGER) - (b.taxYear ?? Number.MAX_SAFE_INTEGER) ||
        a.area.localeCompare(b.area, 'de'),
    )
  }
}
