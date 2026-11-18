import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { AssessmentDiffDto, AssessmentLessonDto } from '../../assessment/dto/assessment-diff.dto.js'
import { RangeDto } from '../../tax-estimate/dto/tax-estimate.dto.js'

const TIERS = ['bescheid', 'schaetzung', 'offen'] as const
const SOURCES = ['bescheid', 'lohnsteuerbescheinigung', 'lohnausweis', 'erklaerung', 'schaetzung'] as const

/** The change to the year before (ADR-0098 §2, §3). Only the fields of the given `kind` are set. */
export class HistoryDeltaDto {
  @ApiProperty({ enum: ['exact', 'range', 'none'], description: '`range` when either year is a range; `none` with a `reason`.' })
  kind!: 'exact' | 'range' | 'none'

  @ApiPropertyOptional({ type: Number, description: 'kind `exact`: the change in euros (percentage points for a quote).' })
  absolute?: number

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'kind `exact`: the change in %; null for a quote or a previous value ≤ 0.' })
  percent?: number | null

  @ApiPropertyOptional({ type: () => RangeDto, description: 'kind `range`: low = current low − previous high, high = current high − previous low.' })
  absoluteRange?: RangeDto

  @ApiPropertyOptional({ type: () => RangeDto, nullable: true, description: 'kind `range`: the change in %, as a range.' })
  percentRange?: RangeDto | null

  @ApiPropertyOptional({ enum: ['kein-vorjahr', 'offen', 'veranlagungsart-gewechselt'], description: 'kind `none`: why there is no change to show.' })
  reason?: 'kein-vorjahr' | 'offen' | 'veranlagungsart-gewechselt'
}

/**
 * One key figure of one year (ADR-0098 §3). `bescheid`: an exact `value` — from the Bescheid or a fact of the
 * LStB/Lohnausweis (`source` says which). `schaetzung`: a `range`, never a midpoint. `offen`: `missing`.
 */
export class HistoryFigureDto {
  @ApiProperty({ enum: TIERS })
  tier!: (typeof TIERS)[number]

  @ApiPropertyOptional({ type: Number, description: 'tier `bescheid`: the exact value (euros, or % for a quote).' })
  value?: number

  @ApiPropertyOptional({ type: () => RangeDto, description: 'tier `schaetzung`: the range (from = to where one number).' })
  range?: RangeDto

  @ApiPropertyOptional({ enum: SOURCES, description: 'Where the value comes from (tiers `bescheid` and `schaetzung`).' })
  source?: (typeof SOURCES)[number]

  @ApiPropertyOptional({ type: [String], example: ['lohnsteuerbescheinigung'], description: 'tier `offen`: what is missing (machine ids, e.g. `bruttoarbeitslohn`, `personB.bruttoarbeitslohn`, `lohnsteuerbescheinigung`).' })
  missing?: string[]

  @ApiProperty({ type: () => HistoryDeltaDto })
  delta!: HistoryDeltaDto
}

export class ExchangeRateNoteDto {
  @ApiProperty({ type: Number, example: 0.9502, description: 'EUR per CHF.' })
  rate!: number

  @ApiProperty({ type: String, example: '2025', description: '`yyyy` (annual average) or `yyyy-mm`.' })
  period!: string
}

export class NetFiguresDto {
  @ApiProperty({ type: HistoryFigureDto }) brutto!: HistoryFigureDto
  @ApiProperty({ type: HistoryFigureDto }) lohnsteuer!: HistoryFigureDto
  @ApiProperty({ type: HistoryFigureDto }) solidaritaetszuschlag!: HistoryFigureDto
  @ApiProperty({ type: HistoryFigureDto }) kirchensteuer!: HistoryFigureDto
  @ApiProperty({ type: HistoryFigureDto, description: 'Sozialversicherung, Arbeitnehmeranteil.' }) sozialversicherung!: HistoryFigureDto
  @ApiProperty({ type: HistoryFigureDto }) netto!: HistoryFigureDto
  @ApiProperty({ type: HistoryFigureDto, description: 'Netto ÷ Brutto in %, one decimal; its delta is in percentage points.' }) nettoQuote!: HistoryFigureDto
  @ApiProperty({ type: [ExchangeRateNoteDto], description: 'The CHF rates Swiss wages went in at (tooltip).' }) exchangeRates!: ExchangeRateNoteDto[]
}

export class HouseholdNetFiguresDto extends NetFiguresDto {
  @ApiProperty({ type: HistoryFigureDto, description: 'Netto ± Abschlusszahlung; household only.' })
  nettoNachErstattung!: HistoryFigureDto
}

export class WorkExpensePartsDto {
  @ApiProperty({ type: Number }) fahrtweg!: number
  @ApiProperty({ type: Number }) homeoffice!: number
  @ApiProperty({ type: Number }) arbeitsmittel!: number
  @ApiProperty({ type: Number }) sonstiges!: number
}

export class WorkExpenseFiguresDto {
  @ApiProperty({ type: HistoryFigureDto, description: 'The sum: from the Bescheid, else as declared.' })
  total!: HistoryFigureDto

  @ApiProperty({ type: HistoryFigureDto, description: 'What counted: the sum, at least the Arbeitnehmer-Pauschbetrag.' })
  angesetzt!: HistoryFigureDto

  @ApiProperty({ type: WorkExpensePartsDto, nullable: true, description: 'The stack; null where only the sum is known (an Eckjahr: „laut Bescheid, ohne Aufteilung“).' })
  parts!: WorkExpensePartsDto | null

  @ApiProperty({ type: String, enum: ['bescheid', 'erklaerung'], nullable: true })
  partsSource!: 'bescheid' | 'erklaerung' | null

  @ApiProperty({ type: Number, nullable: true, example: 1230, description: 'The year’s Arbeitnehmer-Pauschbetrag times the persons shown (the line in the chart).' })
  pauschbetrag!: number | null

  @ApiProperty({ type: Boolean, nullable: true, description: 'The sum stayed below the Pauschbetrag, so the Pauschbetrag counted.' })
  belowLumpSum!: boolean | null
}

export class RefundFiguresDto {
  @ApiProperty({ type: HistoryFigureDto, description: 'Positive = Erstattung, negative = Nachzahlung; household only.' })
  amount!: HistoryFigureDto

  @ApiProperty({ type: Number, nullable: true, description: 'The refund of the version filed in the app (the mark at the bar).' })
  declared!: number | null

  @ApiProperty({ type: Number, nullable: true, description: 'Assessed − declared (the cut area).' })
  difference!: number | null

  @ApiProperty({ type: () => RangeDto, nullable: true, description: 'The last estimate before the Bescheid (detail only, not in the chart).' })
  estimateBeforeAssessment!: RangeDto | null

  @ApiProperty({ type: Boolean, description: 'Two single returns added up.' })
  sumOfSingleFilings!: boolean
}

export class TaxRateFiguresDto {
  @ApiProperty({ type: HistoryFigureDto, description: 'Festgesetzte (or estimated) Einkommensteuer.' })
  incomeTax!: HistoryFigureDto

  @ApiProperty({ type: HistoryFigureDto, description: 'Income tax ÷ household gross, in %.' })
  effective!: HistoryFigureDto

  @ApiProperty({ type: HistoryFigureDto, nullable: true, description: 'Grenzsteuersatz in whole % (splitting); null for single returns.' })
  marginal!: HistoryFigureDto | null
}

export class YearNetDto {
  @ApiProperty({ type: HouseholdNetFiguresDto, description: '„Wir beide“ (or the one person).' }) beide!: HouseholdNetFiguresDto
  @ApiProperty({ type: NetFiguresDto }) A!: NetFiguresDto
  @ApiProperty({ type: NetFiguresDto, nullable: true }) B!: NetFiguresDto | null
}

export class YearWorkExpensesDto {
  @ApiProperty({ type: WorkExpenseFiguresDto }) beide!: WorkExpenseFiguresDto
  @ApiProperty({ type: WorkExpenseFiguresDto }) A!: WorkExpenseFiguresDto
  @ApiProperty({ type: WorkExpenseFiguresDto, nullable: true }) B!: WorkExpenseFiguresDto | null
}

/** One year of the Verlauf, from the core's `buildYearHistory`. */
export class YearHistoryEntryDto {
  @ApiProperty({ type: Number, example: 2024 }) year!: number
  @ApiProperty({ enum: ['einzel', 'zusammen'] }) filingType!: 'einzel' | 'zusammen'
  @ApiProperty({ type: Boolean, description: 'The Veranlagungsart changed from the year before (mark it in the chart).' }) filingTypeChanged!: boolean
  @ApiProperty({ type: Boolean, description: 'Known only from an uploaded Bescheid (`extern-erledigt`).' }) eckjahr!: boolean
  @ApiProperty({ enum: TIERS, description: 'The year’s tier: `bescheid` once every filing has one, `schaetzung` when the core can estimate, else `offen`.' }) tier!: (typeof TIERS)[number]
  @ApiProperty({ type: [String], description: 'tier `offen`: what the year lacks.' }) missing!: string[]
  @ApiProperty({ type: [String], enum: ['A', 'B'] }) persons!: ('A' | 'B')[]
  @ApiProperty({ type: YearNetDto, description: 'Brutto → Netto per „beide“, A and B.' }) netto!: YearNetDto
  @ApiProperty({ type: YearWorkExpensesDto }) werbungskosten!: YearWorkExpensesDto
  @ApiProperty({ type: RefundFiguresDto }) erstattung!: RefundFiguresDto
  @ApiProperty({ type: TaxRateFiguresDto }) steuerquote!: TaxRateFiguresDto
}

export class AppealDeadlineDto {
  @ApiProperty({ type: String, example: '2026-12-07', description: 'The Einspruchsfrist’s last day (ISO).' })
  endsOn!: string

  @ApiProperty({ type: Number, example: 19, description: 'Days from today; negative once it passed.' })
  remainingDays!: number

  @ApiProperty({ type: Boolean })
  running!: boolean
}

/** One row of „Alle Jahre: erklärt und festgesetzt“. */
export class YearListItemDto {
  @ApiProperty({ type: Number }) year!: number

  @ApiProperty({ type: String, nullable: true, enum: ['entwurf', 'pruefung', 'eingereicht', 'rueckfrage', 'bescheid', 'abgeschlossen', 'extern-erledigt'], description: 'The stored ADR-0039 state; null for a year without a tax year row.' })
  status!: string | null

  @ApiProperty({ enum: ['eckjahr', 'bescheid', 'eingereicht', 'offen'], description: 'How the year stands, derived from its data.' })
  kind!: 'eckjahr' | 'bescheid' | 'eingereicht' | 'offen'

  @ApiProperty({ enum: ['einzel', 'zusammen'] }) filingType!: 'einzel' | 'zusammen'
  @ApiProperty({ type: Number, nullable: true }) declaredRefund!: number | null
  @ApiProperty({ type: Number, nullable: true }) assessedRefund!: number | null
  @ApiProperty({ type: Number, nullable: true, description: 'Assessed − declared.' }) difference!: number | null
  @ApiProperty({ type: Number, description: 'Own deviations of the Bescheid-Abgleich(e).' }) deviations!: number

  @ApiProperty({ type: String, nullable: true, enum: ['eckjahr', 'kein-bescheid', 'keine-eingereichte-fassung'], description: 'Why there is no Abgleich (a sentence says why); null when there is one.' })
  noDiffReason!: 'eckjahr' | 'kein-bescheid' | 'keine-eingereichte-fassung' | null

  @ApiProperty({ type: Boolean, description: 'Within the four years of the Festsetzungsfrist; older years are for display only.' })
  withinAssessmentPeriod!: boolean
}

export class PositionRefDto {
  @ApiProperty({ type: String, example: 'homeofficeA' }) position!: string
  @ApiProperty({ type: String, example: 'Homeoffice-Pauschale' }) label!: string
}

/** One entry of „Was ansteht“: at most one per year. Only the fields of its `kind` are set. */
export class OpenItemDto {
  @ApiProperty({ enum: ['einspruchsfrist', 'wartet-auf-bescheid', 'offen'] })
  kind!: 'einspruchsfrist' | 'wartet-auf-bescheid' | 'offen'

  @ApiProperty({ type: Number }) year!: number

  @ApiProperty({ type: Boolean, description: 'Shown first and highlighted (a Bescheid with deviations and a running Einspruchsfrist).' })
  highlighted!: boolean

  @ApiPropertyOptional({ type: Number, nullable: true, example: -92, description: 'kind `einspruchsfrist`: assessed − declared refund in euros.' })
  refundDifference?: number | null

  @ApiPropertyOptional({ type: Number, description: 'kind `einspruchsfrist`: the number of own deviations.' })
  deviations?: number

  @ApiPropertyOptional({ type: AppealDeadlineDto, description: 'kind `einspruchsfrist`.' })
  deadline?: AppealDeadlineDto

  @ApiPropertyOptional({ type: [PositionRefDto], description: 'kind `wartet-auf-bescheid`: positions cut the year before and declared the same way again; no amount.' })
  repeatedCuts?: PositionRefDto[]

  @ApiPropertyOptional({ type: [String], description: 'kind `offen`: what the year lacks.' })
  missing?: string[]
}

/** The Bescheid-Abgleich of one filing of a year, with its Einspruchsfrist and „Fürs nächste Mal“. */
export class YearDiffDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: String, enum: ['A', 'B'], nullable: true, description: 'Whose single return; null for the joint one.' }) person!: 'A' | 'B' | null
  @ApiProperty({ type: String, example: '2026-09-21' }) submittedOn!: string
  @ApiProperty({ type: String, nullable: true, example: '2026-11-02' }) assessmentDate!: string | null
  @ApiProperty({ type: AppealDeadlineDto, nullable: true, description: 'Null without a Bescheiddatum.' }) deadline!: AppealDeadlineDto | null
  @ApiProperty({ type: AssessmentDiffDto }) diff!: AssessmentDiffDto
  @ApiProperty({ type: [AssessmentLessonDto] }) lessons!: AssessmentLessonDto[]
}

export class MaskLessonsDto {
  @ApiProperty({ type: Number, example: 2026, description: 'The open year whose masks show the lessons.' }) year!: number
  @ApiProperty({ type: Number, example: 2024, description: 'The Bescheid they come from.' }) fromYear!: number
  @ApiProperty({ type: [AssessmentLessonDto], description: 'Only lessons with a mask.' }) lessons!: AssessmentLessonDto[]
}

/** `GET /v1/verlauf` (ADR-0098): all years of the account or household, computed on request, nothing stored. */
export class YearHistoryResponseDto {
  @ApiProperty({ type: String, example: '2026-11-18', description: 'The day remaining days are counted from.' })
  today!: string

  @ApiProperty({ type: [YearHistoryEntryDto], description: 'The four key figures per year, oldest first.' })
  years!: YearHistoryEntryDto[]

  @ApiProperty({ type: [YearListItemDto], description: 'The year list, oldest first.' })
  list!: YearListItemDto[]

  @ApiProperty({ type: [OpenItemDto], description: '„Was ansteht“, highlighted first, then the newest year first.' })
  openItems!: OpenItemDto[]

  @ApiProperty({ type: [YearDiffDto], description: 'Every Abgleich of a year with a Bescheid and a version filed in the app.' })
  diffs!: YearDiffDto[]

  @ApiProperty({ type: MaskLessonsDto, nullable: true, description: 'The lessons for the masks of the latest open year.' })
  maskLessons!: MaskLessonsDto | null
}
