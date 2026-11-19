import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import { RangeDto } from '../../tax-estimate/dto/tax-estimate.dto.js'

// ADR-0099: the additions of `GET /v1/verlauf` — deadlines and „Schon abgegeben?“, Lebensereignisse, the
// checklist of the open year, prepayments, repeated cuts, couples, the groups and the Unterlagen.

const ANSWERS = ['ja', 'nein', 'weiss-nicht'] as const

/** Until when a return can be filed, or a Bescheid changed (ADR-0099 §1). */
export class YearDeadlineDto {
  @ApiProperty({ enum: ['abgabe-moeglich-bis', 'aenderbar-bis'], description: '`abgabe-moeglich-bis` without a Bescheid („bis 31.12.2026 möglich“), `aenderbar-bis` with one.' })
  kind!: 'abgabe-moeglich-bis' | 'aenderbar-bis'

  @ApiProperty({ type: String, example: '2026-12-31', description: 'The Festsetzungsfrist without a delayed start (§ 169 Abs. 2 Nr. 2 AO, § 108 Abs. 3 AO): true for every return.' })
  endsOn!: string

  @ApiProperty({ type: Number, example: 42, description: 'Days from today; negative once it passed.' })
  remainingDays!: number

  @ApiProperty({ type: Boolean })
  running!: boolean

  @ApiProperty({ type: String, nullable: true, example: '2029-01-02', description: 'The later end should the return have been mandatory (§ 170 Abs. 2 Nr. 1 AO); null when unknown or the same. Never shown instead of `endsOn`.' })
  endsOnIfMandatory!: string | null
}

/** „Schon abgegeben?“ for a year of the Festsetzungsfrist without data (ADR-0099 §1). */
export class FiledElsewhereDto {
  @ApiProperty({ type: String, nullable: true, enum: ANSWERS, description: 'The answer; null while not asked.' })
  answer!: (typeof ANSWERS)[number] | null

  @ApiProperty({ type: String, nullable: true, example: '2026-11-19' })
  answeredOn!: string | null

  @ApiProperty({ type: String, nullable: true, example: '2027-09-30', description: 'After „weiss-nicht“: from this day the question comes again (three months before the deadline).' })
  askAgainFrom!: string | null

  @ApiProperty({ type: Boolean, description: 'Ask the question now.' })
  ask!: boolean
}

/** The PUT body of „Schon abgegeben?“. */
export class PutFiledElsewhereDto {
  @ApiProperty({ enum: ANSWERS, description: '`ja`: filed elsewhere, the year waits for its Bescheid upload; `nein`: an open year; `weiss-nicht`: ask again three months before the deadline.' })
  @IsIn(ANSWERS)
  answer!: (typeof ANSWERS)[number]
}

export class FiledElsewhereResponseDto {
  @ApiProperty({ type: Number, example: 2022 }) year!: number

  @ApiProperty({ type: String, enum: ['entwurf', 'extern-erledigt'], description: 'The ADR-0039 state the answer put the year in.' })
  status!: string

  @ApiProperty({ type: FiledElsewhereDto }) filedElsewhere!: FiledElsewhereDto
  @ApiProperty({ type: YearDeadlineDto }) deadline!: YearDeadlineDto
}

/** A marker on the timeline, derived only from data (ADR-0099 §4). Only the fields of its kind are set. */
export class LifeEventDto {
  @ApiProperty({ type: Number, example: 2023 }) year!: number

  @ApiProperty({ enum: ['zusammenveranlagung', 'kind', 'neuer-arbeitgeber', 'grenzgaenger', 'umzug', 'immobilienkauf'] })
  kind!: 'zusammenveranlagung' | 'kind' | 'neuer-arbeitgeber' | 'grenzgaenger' | 'umzug' | 'immobilienkauf'

  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true, description: 'Whose event; null for the household’s.' })
  person!: 'A' | 'B' | null

  @ApiPropertyOptional({ type: [String], example: ['Grenz AG'], description: 'kind `neuer-arbeitgeber`: the employers new this year.' })
  employers?: string[]

  @ApiPropertyOptional({ type: String, example: '2025-03-14', description: 'kinds `kind`, `immobilienkauf`: the first date of the year.' })
  date?: string

  @ApiPropertyOptional({ type: Number, example: 1, description: 'kinds `kind`, `immobilienkauf`: how many in the year.' })
  count?: number
}

export class RecurringDetailDto {
  @ApiProperty({ type: Number, nullable: true, example: 67 }) km!: number | null
  @ApiProperty({ type: Number, nullable: true, example: 226 }) days!: number | null
}

export class RecurringItemFieldDto {
  @ApiProperty({ type: String, example: 'commute', description: 'The mask the item is entered in.' }) screen!: string
  @ApiProperty({ type: String, example: 'accountFeesEur' }) field!: string
}

/** One line of „Kommt jedes Jahr wieder“ (ADR-0099 §2): last year's amount is a hint, never a value. */
export class RecurringItemDto {
  @ApiProperty({ type: String, example: 'kontofuehrung' }) id!: string
  @ApiProperty({ type: String, example: 'Kontoführung' }) label!: string
  @ApiProperty({ type: Number, example: 2025, description: 'The latest of the last two years that had the item.' }) lastYear!: number
  @ApiProperty({ type: Number, nullable: true, example: 32, description: 'That year’s amount, as a hint.' }) lastAmount!: number | null
  @ApiProperty({ type: RecurringDetailDto, nullable: true, description: 'Kilometres and days of a way to work, days of Homeoffice.' }) lastDetail!: RecurringDetailDto | null
  @ApiProperty({ type: Number, nullable: true, description: 'What the open year itself has entered; null while nothing (never last year’s value).' }) currentAmount!: number | null
  @ApiProperty({ type: RecurringDetailDto, nullable: true }) currentDetail!: RecurringDetailDto | null
  @ApiProperty({ enum: ['erledigt', 'offen'] }) status!: 'erledigt' | 'offen'
  @ApiProperty({ type: String, nullable: true, enum: ['uebernommen', 'vorschlag'], description: 'What the open year’s receipts did for the item (ADR-0097).' }) receipt!: 'uebernommen' | 'vorschlag' | null
  @ApiProperty({ type: [Number], description: 'Years whose Bescheid cut the position again and again (ADR-0099 §5).' }) cutInYears!: number[]
  @ApiProperty({ type: [RecurringItemFieldDto], description: 'Where the item is entered.' }) fields!: RecurringItemFieldDto[]
}

export class RecurringChecklistDto {
  @ApiProperty({ type: Number, example: 2026, description: 'The open year.' }) year!: number
  @ApiProperty({ type: [RecurringItemDto] }) items!: RecurringItemDto[]
  @ApiProperty({ type: Number }) done!: number
  @ApiProperty({ type: Number }) open!: number
}

export class PrepaymentYearDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: Number, description: 'Abschlusszahlung laut Bescheid: positive = Erstattung, negative = Nachzahlung.' }) refund!: number
  @ApiProperty({ type: Number, nullable: true, description: 'The Nachzahlung as a positive amount.' }) backPayment!: number | null
  @ApiProperty({ type: Number, nullable: true, description: 'The prepayments the year’s answers name.' }) prepayments!: number | null
  @ApiProperty({ type: Boolean, description: 'Show „Vorauszahlungen anpassen lassen“.' }) adjustPrepayments!: boolean
}

/** „Vorauszahlungen“ (ADR-0099 §3): the Bescheid years with their Nachzahlung, for the tab on „Entwicklung“. */
export class PrepaymentSeriesDto {
  @ApiProperty({ type: [PrepaymentYearDto] }) years!: PrepaymentYearDto[]
  @ApiProperty({ type: Number }) backPaymentYears!: number
  @ApiProperty({ type: Number, description: 'Nachzahlungen in a row up to the latest Bescheid.' }) consecutiveBackPayments!: number
  @ApiProperty({ type: Number, nullable: true }) averageBackPayment!: number | null
  @ApiProperty({ type: String, nullable: true, example: 'Vorauszahlungen anpassen lassen (Antrag beim Finanzamt)' }) hint!: string | null
}

export class RepeatedCutYearDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: Number }) declared!: number
  @ApiProperty({ type: Number }) assessed!: number
  @ApiProperty({ type: Number }) difference!: number
  @ApiProperty({ type: Number, nullable: true }) refundEffect!: number | null
}

/** A position the Finanzamt cut in at least two Bescheid years (ADR-0099 §5). */
export class RepeatedCutDto {
  @ApiProperty({ type: String, example: 'homeofficeA' }) position!: string
  @ApiProperty({ type: String, example: 'homeoffice' }) type!: string
  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true }) person!: 'A' | 'B' | null
  @ApiProperty({ type: String, example: 'Homeoffice-Pauschale' }) label!: string
  @ApiProperty({ type: [RepeatedCutYearDto] }) years!: RepeatedCutYearDto[]
  @ApiProperty({ type: String, nullable: true, description: 'The catalogue hint for the position type.' }) hint!: string | null
}

/** Paare (ADR-0099 §6). Only the fields of its `status` are set. */
export class CoupleComparisonDto {
  @ApiProperty({ type: Number }) year!: number

  @ApiProperty({ enum: ['gerechnet', 'unvollstaendig', 'tarif-fehlt'] })
  status!: 'gerechnet' | 'unvollstaendig' | 'tarif-fehlt'

  @ApiPropertyOptional({ enum: ['einzel', 'zusammen'], description: 'status `gerechnet`: how the year was filed.' })
  filedAs?: 'einzel' | 'zusammen'

  @ApiPropertyOptional({ type: Boolean, description: 'status `gerechnet`: true for a joint Bescheid split by the filed facts („Rechnung der App, etwa“).' })
  approximate?: boolean

  @ApiPropertyOptional({ type: Number, description: 'status `gerechnet`: ESt + Soli (+ KiSt) of two single returns.' })
  singleTax?: number

  @ApiPropertyOptional({ type: Number, description: 'status `gerechnet`: the same, joint.' })
  jointTax?: number

  @ApiPropertyOptional({ type: Number, example: 1120, description: 'status `gerechnet`: singleTax − jointTax; > 0 the joint return is (or would have been) cheaper.' })
  jointSaving?: number

  @ApiPropertyOptional({ type: () => RangeDto, nullable: true, description: 'status `gerechnet`: the saving over the ways to split a joint Bescheid; null when it is one number.' })
  jointSavingRange?: RangeDto | null

  @ApiPropertyOptional({ enum: ['eindeutig', 'zu-knapp', 'unbestimmt'], description: 'status `gerechnet`: the comparison’s statement (progression clause).' })
  statement?: 'eindeutig' | 'zu-knapp' | 'unbestimmt'

  @ApiPropertyOptional({ type: [String], description: 'status `unvollstaendig`: what is missing.' })
  missing?: string[]
}

export class CrossBorderYearDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: String, enum: ['A', 'B'] }) person!: 'A' | 'B'
  @ApiProperty({ type: Number, example: 1.065, description: 'EUR per CHF.' }) rate!: number
  @ApiProperty({ type: String, example: '2025', description: '`yyyy` or `yyyy-mm`.' }) period!: string
  @ApiProperty({ type: Number }) grossChf!: number
  @ApiProperty({ type: Number }) grossEur!: number
  @ApiProperty({ type: Number, nullable: true, example: 1.4, description: 'Change of the rate to the year before in %.' }) rateChangePercent!: number | null
  @ApiProperty({ type: Number }) withholdingTaxChf!: number
  @ApiProperty({ type: Number, description: 'Credited in Germany (N-Gre Zeile 25): at most 4,5 % of the gross wage.' }) creditedEur!: number
  @ApiProperty({ type: Boolean, description: 'More was withheld than can be credited.' }) creditCapped!: boolean
}

export class SwissShareDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: Number, example: 18.7 }) percent!: number
}

export class CrossBorderGroupDto {
  @ApiProperty({ type: [CrossBorderYearDto] }) years!: CrossBorderYearDto[]
  @ApiProperty({ type: [SwissShareDto], description: 'The Swiss wage’s share of the household’s gross wage.' }) swissShare!: SwissShareDto[]
}

export class RentalPropertyYearDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: Number, nullable: true, description: 'Mieten + Umlagen − Werbungskosten − Schuldzinsen − AfA; null while a part is missing.' }) result!: number | null
  @ApiProperty({ type: [String], example: ['werbungskosten'] }) missing!: string[]
  @ApiProperty({ type: Number, nullable: true }) depreciation!: number | null
  @ApiProperty({ type: Number, nullable: true, description: 'Remaining book value at year end; null without the purchase date.' }) bookValueEnd!: number | null
}

export class RentalDepreciationRateDto {
  @ApiProperty({ type: Number, example: 4200 }) annual!: number
  @ApiProperty({ type: Number, example: 2 }) ratePercent!: number
}

/** The 15 % limit of § 6 Abs. 1 Nr. 1a EStG in the three years after the purchase. */
export class AcquisitionRelatedDto {
  @ApiProperty({ type: String, example: '2026-04-01' }) windowEnd!: string
  @ApiProperty({ type: Number }) limitEur!: number
  @ApiProperty({ type: Number }) withinWindowEur!: number
  @ApiProperty({ type: Boolean }) exceeds!: boolean
  @ApiProperty({ type: Number }) roomLeftEur!: number
  @ApiProperty({ type: Boolean, description: 'The window still runs.' }) windowOpen!: boolean
  @ApiProperty({ type: Number, description: 'Repairs without a date counted in the window to be safe.' }) undatedCounted!: number
}

export class RentalGroupPropertyDto {
  @ApiProperty({ type: String }) propertyKey!: string
  @ApiProperty({ type: String, nullable: true, example: 'Lindenweg 4' }) label!: string | null
  @ApiProperty({ type: String, nullable: true }) acquiredOn!: string | null
  @ApiProperty({ type: RentalDepreciationRateDto, nullable: true }) depreciation!: RentalDepreciationRateDto | null
  @ApiProperty({ type: [RentalPropertyYearDto] }) years!: RentalPropertyYearDto[]
  @ApiProperty({ type: Number, nullable: true }) bookValue!: number | null
  @ApiProperty({ type: Number, nullable: true }) yearsLeft!: number | null
  @ApiProperty({ type: AcquisitionRelatedDto, nullable: true }) acquisitionRelated!: AcquisitionRelatedDto | null
}

export class RentalGroupDto {
  @ApiProperty({ type: [RentalGroupPropertyDto] }) properties!: RentalGroupPropertyDto[]
}

export class CapitalFavourableCheckDto {
  @ApiProperty({ enum: ['eindeutig', 'zu-knapp', 'unbestimmt'] }) statement!: 'eindeutig' | 'zu-knapp' | 'unbestimmt'
  @ApiProperty({ type: Number, description: 'Personal rate minus flat rate tax; > 0 the flat rate is cheaper.' }) delta!: number
  @ApiProperty({ type: String, nullable: true, enum: ['abgeltung', 'persoenlich'] }) recommendation!: 'abgeltung' | 'persoenlich' | null
}

export class CapitalYearDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: Number }) income!: number
  @ApiProperty({ type: Number }) allowanceLimit!: number
  @ApiProperty({ type: Number }) allowanceUsed!: number
  @ApiProperty({ type: Number }) aboveAllowance!: number
  @ApiProperty({ type: Boolean }) fullyUsed!: boolean
  @ApiProperty({ type: CapitalFavourableCheckDto, nullable: true, description: 'The Günstigerprüfung on the Bescheid’s zvE; null without one.' }) favourableCheck!: CapitalFavourableCheckDto | null
}

export class CapitalGroupDto {
  @ApiProperty({ type: [CapitalYearDto] }) years!: CapitalYearDto[]
}

export class PensionYearDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: Number, nullable: true }) amount!: number | null
  @ApiProperty({ type: Number, nullable: true }) taxablePart!: number | null
}

export class PensionGroupDto {
  @ApiProperty({ type: Number, nullable: true }) startYear!: number | null
  @ApiProperty({ type: Number, nullable: true, example: 82.5, description: 'Besteuerungsanteil of the start year.' }) sharePercent!: number | null
  @ApiProperty({ type: Number, nullable: true, description: 'Rentenfreibetrag, fixed from the first full year.' }) allowance!: number | null
  @ApiProperty({ type: Number, nullable: true }) allowanceYear!: number | null
  @ApiProperty({ type: [PensionYearDto] }) years!: PensionYearDto[]
}

export class LossCarryForwardDto {
  @ApiProperty({ enum: ['notRecorded'], description: 'Verlustvortrag and Verlustverrechnungstöpfe: „noch nicht erfasst“.' })
  status!: 'notRecorded'
}

/** The groups as tabs on „Entwicklung“ (ADR-0099 §7); a group is null without data. */
export class HistoryGroupsDto {
  @ApiProperty({ type: CrossBorderGroupDto, nullable: true }) crossBorder!: CrossBorderGroupDto | null
  @ApiProperty({ type: RentalGroupDto, nullable: true }) rental!: RentalGroupDto | null
  @ApiProperty({ type: CapitalGroupDto, nullable: true }) capital!: CapitalGroupDto | null
  @ApiProperty({ type: PensionGroupDto, nullable: true }) pension!: PensionGroupDto | null
  @ApiProperty({ type: LossCarryForwardDto }) lossCarryForward!: LossCarryForwardDto
}

export class AssessmentDocumentDto {
  @ApiProperty({ type: String }) receiptId!: string
  @ApiProperty({ type: String, example: 'Bescheid-2024.pdf' }) fileName!: string
  @ApiProperty({ type: String, example: '2026-11-03T09:12:00.000Z' }) uploadedAt!: string
  @ApiProperty({ type: String, example: '/v1/belege/0f…/datei', description: 'The existing receipt file endpoint.' }) downloadPath!: string
}

export class AssessmentWaitDto {
  @ApiProperty({ type: Number }) days!: number
  @ApiProperty({ type: Number }) weeks!: number
  @ApiProperty({ type: Boolean, description: 'No Bescheid yet: counted up to today.' }) pending!: boolean
  @ApiProperty({ type: Boolean, description: '„Nachfragen lohnt sich“: more than twelve weeks without a Bescheid.' }) askTaxOffice!: boolean
}

export class AppealHistoryEntryDto {
  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true }) person!: 'A' | 'B' | null
  @ApiProperty({ type: String, nullable: true, example: '2023-07-03' }) date!: string | null
  @ApiProperty({ type: String, nullable: true, enum: ['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'] }) reason!: string | null
  @ApiProperty({ type: String, nullable: true, enum: ['offen', 'stattgegeben', 'teilweise', 'abgelehnt', 'zurueckgenommen'] }) outcome!: string | null
  @ApiProperty({ type: Number, nullable: true, example: 140 }) amount!: number | null
}

/** One year of „Unterlagen“ (ADR-0099 §9). */
export class YearDocumentsDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: [AssessmentDocumentDto], description: 'The uploaded Steuerbescheide, oldest first.' }) documents!: AssessmentDocumentDto[]
  @ApiProperty({ type: String, nullable: true }) submittedOn!: string | null
  @ApiProperty({ type: String, nullable: true }) assessmentDate!: string | null
  @ApiProperty({ type: AssessmentWaitDto, nullable: true, description: 'Submission → Bescheid; null without a submission in the app.' }) wait!: AssessmentWaitDto | null
  @ApiProperty({ type: [AppealHistoryEntryDto] }) appeals!: AppealHistoryEntryDto[]
}
