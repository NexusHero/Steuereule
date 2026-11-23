// Wire shapes of the self-employment path (ADR-0101). Nested facts travel as plain objects: the core
// checks their content (parseBookingDraft, suggestProfessionKind, the tax rules), not class-validator.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { USEFUL_LIVES } from '@steuereule/core'
import { BookIntegrityDto, CsvMappingDto, LossFactsDto, PartnershipShareDto, ProfessionAnswersDto, TradeTaxInputsDto, VatPeriodFactsDto, DisposalFactsDto, RetainedFactsDto } from './business-results.dto.js'

export { BookIntegrityDto }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export class BookingLineDto {
  @ApiProperty({ type: String, example: '4930', description: 'Account number in the book’s chart (SKR03/SKR04).' })
  account!: string

  @ApiProperty({ enum: ['debit', 'credit'] })
  side!: 'debit' | 'credit'

  @ApiProperty({ type: Number, example: 11900, description: 'Integer cents, always positive.' })
  amount!: number

  @ApiPropertyOptional({ type: String, example: 'vst19', description: 'Tax key (core BookingTaxKey); omitted = none.' })
  taxKey?: string | undefined

  @ApiPropertyOptional({ enum: ['gross', 'net'] })
  amountIs?: 'gross' | 'net' | undefined
}

export class BookingAssetDto {
  @ApiProperty({ type: String, example: 'Notebook' })
  label!: string

  @ApiProperty({ enum: ['linear', 'degressive', 'gwg', 'sofort'] })
  method!: 'linear' | 'degressive' | 'gwg' | 'sofort'

  @ApiPropertyOptional({ type: String, example: 'computer', description: 'Key of the official AfA table (core USEFUL_LIVES).' })
  category?: string | undefined

  @ApiPropertyOptional({ type: Number, example: 3 })
  usefulLifeYears?: number | undefined
}

/** A booking as the user (or an accepted draft) posts it; checked by the core against the book. */
export class RegularPaymentDto {
  @ApiProperty({ type: String, example: '2025-01-10', description: 'Due date after any § 108 AO shift.' }) @Matches(ISO_DATE) dueDate!: string
  @ApiProperty({ type: Number, example: 2024, description: 'The year the payment belongs to economically.' }) @IsInt() periodYear!: number
}

export class BookingDraftDto {
  @ApiPropertyOptional({ type: RegularPaymentDto, description: '§ 11 Abs. 1 Satz 2 EStG: a regular payment around the turn of the year, counted in the EÜR of the year it belongs to.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegularPaymentDto)
  regularPayment?: RegularPaymentDto | undefined

  @ApiProperty({ type: String, example: '2025-03-14' })
  @Matches(ISO_DATE)
  date!: string

  @ApiProperty({ type: String, example: 'R-2025-031' })
  @IsString()
  @MaxLength(40)
  documentNumber!: string

  @ApiProperty({ type: String, example: 'Bürobedarf' })
  @IsString()
  @MaxLength(200)
  text!: string

  @ApiPropertyOptional({ type: String, description: 'Reference to a stored receipt (Beleg id).' })
  @IsOptional()
  @IsString()
  receiptRef?: string | undefined

  @ApiProperty({ type: [BookingLineDto] })
  @IsArray()
  lines!: readonly BookingLineDto[]

  @ApiPropertyOptional({ type: String, example: 'ATU12345678', description: 'The counterparty’s foreign VAT id (Zusammenfassende Meldung, § 18a UStG).' })
  @IsOptional()
  @Matches(/^[A-Z]{2}[0-9A-Z+*]{2,12}$/)
  counterpartyVatId?: string | undefined

  @ApiPropertyOptional({ type: BookingAssetDto, description: 'A fixed asset: how it is depreciated.' })
  @IsOptional()
  @IsObject()
  asset?: BookingAssetDto | undefined
}

export class ReversalDto {
  @ApiProperty({ type: String, example: '2025-04-02' })
  @Matches(ISO_DATE)
  date!: string

  @ApiProperty({ type: String, example: 'ST-1' })
  @IsString()
  @MaxLength(40)
  documentNumber!: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string | undefined
}

export class QuickTotalDto {
  @ApiProperty({ type: String, example: 'ausgaben_telekommunikation', description: 'Core EuerKey.' })
  @IsString()
  key!: string

  @ApiProperty({ type: Number, example: 48000, description: 'Integer cents.' })
  @IsInt()
  @Min(1)
  amountCents!: number

  @ApiPropertyOptional({ type: String, example: '2025-12-31' })
  @IsOptional()
  @Matches(ISO_DATE)
  date?: string | undefined
}

export class QuickEntryDto {
  @ApiProperty({ type: [QuickTotalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuickTotalDto)
  totals!: readonly QuickTotalDto[]
}

export class CarCommuteDto {
  @ApiProperty({ type: Number, description: 'One-way distance home–business, full km.' }) @IsInt() @Min(0) @Max(1000) distanceKm!: number
  @ApiProperty({ type: Number, description: 'Days the trip was made.' }) @IsInt() @Min(0) @Max(366) days!: number
}

/** The facts of a business car for its private use (ADR-0101 §22, § 6 Abs. 1 Nr. 4 EStG). */
export class CompanyCarInputDto {
  @ApiProperty({ enum: ['verbrenner', 'elektro', 'hybrid'] }) @IsIn(['verbrenner', 'elektro', 'hybrid']) drive!: 'verbrenner' | 'elektro' | 'hybrid'
  @ApiProperty({ type: String, example: '2024-03-01', description: 'Acquisition date.' }) @Matches(ISO_DATE) acquired!: string
  @ApiProperty({ type: Number, description: 'Bruttolistenpreis with the extras, euros.' }) @IsInt() @Min(1) @Max(10_000_000) listPriceGrossEur!: number
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) @Max(1000) co2GPerKm?: number | undefined
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) @Max(2000) electricRangeKm?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'Battery capacity in kWh: the battery deduction of a car bought before 2023 without a fraction (§ 6 Abs. 1 Nr. 4 Satz 2 Nr. 1 EStG).' }) @IsOptional() @Min(0) @Max(500) batteryKwh?: number | undefined
  @ApiProperty({ type: Boolean, description: 'More than half of the use is business.' }) @IsBoolean() businessShareOver50!: boolean
  @ApiProperty({ type: Number, description: 'Months in the business assets this year.' }) @IsInt() @Min(1) @Max(12) monthsInBusiness!: number
  @ApiProperty({ enum: ['pauschal', 'fahrtenbuch'] }) @IsIn(['pauschal', 'fahrtenbuch']) method!: 'pauschal' | 'fahrtenbuch'
  @ApiPropertyOptional({ type: Number, description: 'Total costs of the car in the year with the AfA, euros.' }) @IsOptional() @IsInt() @Min(0) totalCostsEur?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'The AfA inside the total costs, euros; an electric or hybrid car counts it at its fraction.' }) @IsOptional() @IsInt() @Min(0) depreciationEur?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'Logbook: leasing rates inside the total costs, euros; an electric or hybrid car counts them at its fraction.' }) @IsOptional() @IsInt() @Min(0) leasingEur?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'Logbook: private share of the km, 0–1.' }) @IsOptional() @Min(0) @Max(1) privateShare?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'Logbook: km of the year.' }) @IsOptional() @IsInt() @Min(0) totalKm?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'Logbook: costs that carried input VAT, euros.' }) @IsOptional() @IsInt() @Min(0) costsWithInputVatEur?: number | undefined
  @ApiPropertyOptional({ type: CarCommuteDto }) @IsOptional() @ValidateNested() @Type(() => CarCommuteDto) commute?: CarCommuteDto | undefined
}

export class LockDto {
  @ApiProperty({ type: String, example: '2025-06-30', description: 'Festschreibung through this day; only moves forward.' })
  @Matches(ISO_DATE)
  through!: string
}

/**
 * PUT merges: a field left out keeps what is stored, `null` clears it. The nested objects
 * (professionAnswers, tradeTaxInputs, lossFacts, partnershipShares) are replaced as a whole.
 */
export class BusinessProfileInputDto {
  @ApiPropertyOptional({ enum: ['freiberuf', 'gewerbe'], nullable: true, description: 'The kind the user confirms.' })
  @IsOptional()
  @IsIn(['freiberuf', 'gewerbe', null])
  confirmedKind?: 'freiberuf' | 'gewerbe' | null | undefined

  @ApiPropertyOptional({ type: ProfessionAnswersDto, nullable: true, description: 'The profession questions; the core’s Freiberuf/Gewerbe suggestion is computed from them. Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfessionAnswersDto)
  professionAnswers?: ProfessionAnswersDto | null | undefined

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null | undefined

  @ApiPropertyOptional({ enum: ['euer', 'bilanz'] })
  @IsOptional()
  @IsIn(['euer', 'bilanz'])
  mode?: 'euer' | 'bilanz' | undefined

  @ApiPropertyOptional({ enum: ['SKR03', 'SKR04'] })
  @IsOptional()
  @IsIn(['SKR03', 'SKR04'])
  chart?: 'SKR03' | 'SKR04' | undefined

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  smallBusiness?: boolean | undefined

  @ApiPropertyOptional({ enum: ['ist', 'soll'] })
  @IsOptional()
  @IsIn(['ist', 'soll'])
  vatMethod?: 'ist' | 'soll' | undefined

  @ApiPropertyOptional({ type: String, nullable: true, example: '09162000', description: 'Amtlicher Gemeindeschlüssel.' })
  @IsOptional()
  @Matches(/^\d{8}$/)
  municipalityAgs?: string | null | undefined

  @ApiPropertyOptional({ type: Number, nullable: true, example: 490, description: 'Hebesatz in percent, instead of the table’s.' })
  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(1500)
  multiplierOverride?: number | null | undefined

  @ApiPropertyOptional({ type: String, nullable: true, example: '2024-01-01' })
  @IsOptional()
  @Matches(ISO_DATE)
  startDate?: string | null | undefined

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Umsatzsteuer prepayments of the year in cents; absent or null = the Voranmeldungen’s total.' })
  @IsOptional()
  @IsInt()
  vatPrepaymentsCents?: number | null | undefined

  @ApiPropertyOptional({ type: VatPeriodFactsDto, nullable: true, description: 'The Voranmeldung facts. Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => VatPeriodFactsDto)
  vatPeriodFacts?: VatPeriodFactsDto | null | undefined

  @ApiPropertyOptional({ type: DisposalFactsDto, nullable: true, description: 'Sale or giving up of the business (§ 16, § 34 EStG). Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DisposalFactsDto)
  disposalFacts?: DisposalFactsDto | null | undefined

  @ApiPropertyOptional({ type: RetainedFactsDto, nullable: true, description: 'Thesaurierung (§ 34a EStG), Bilanz only. Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetainedFactsDto)
  retainedFacts?: RetainedFactsDto | null | undefined

  @ApiPropertyOptional({ type: TradeTaxInputsDto, nullable: true, description: 'Gewerbesteuer inputs, euros. Replaced as a whole: send the complete object.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TradeTaxInputsDto)
  tradeTaxInputs?: TradeTaxInputsDto | null | undefined

  @ApiPropertyOptional({ type: LossFactsDto, nullable: true, description: '§ 10d facts, euros. Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LossFactsDto)
  lossFacts?: LossFactsDto | null | undefined

  @ApiPropertyOptional({ type: [PartnershipShareDto], nullable: true, description: 'Shares from partnerships (Feststellungsbescheid). Replaced as a whole.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnershipShareDto)
  partnershipShares?: readonly PartnershipShareDto[] | null | undefined
}

export class ProfessionSuggestionDto {
  @ApiProperty({ enum: ['freiberuf', 'gewerbe', 'unklar'] })
  suggestion!: 'freiberuf' | 'gewerbe' | 'unklar'

  @ApiProperty({ type: [String] })
  reasons!: readonly string[]

  @ApiProperty({ type: [String] })
  basis!: readonly string[]
}

export class BusinessListItemDto {
  @ApiProperty({ type: Number, description: 'The business number of the person, from 1.' }) business!: number
  @ApiProperty({ type: String, nullable: true }) name!: string | null
  @ApiProperty({ enum: ['freiberuf', 'gewerbe'], nullable: true }) kind!: 'freiberuf' | 'gewerbe' | null
  @ApiProperty({ enum: ['euer', 'bilanz'] }) mode!: 'euer' | 'bilanz'
}

export class NewBusinessDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120, description: 'What the user calls the business.' })
  @IsString()
  @Length(1, 120)
  name!: string
}

export class BusinessProfileDto {
  @ApiProperty({ enum: ['A', 'B'] })
  person!: 'A' | 'B'

  @ApiProperty({ type: Number, description: 'The business number of the person, from 1 (ADR-0101 §22).' })
  business!: number

  @ApiProperty({ enum: ['freiberuf', 'gewerbe'], nullable: true })
  confirmedKind!: 'freiberuf' | 'gewerbe' | null

  @ApiProperty({ type: ProfessionAnswersDto, nullable: true })
  professionAnswers!: ProfessionAnswersDto | null

  @ApiProperty({ type: ProfessionSuggestionDto, nullable: true })
  suggestion!: ProfessionSuggestionDto | null

  @ApiProperty({ type: String, nullable: true })
  name!: string | null

  @ApiProperty({ enum: ['euer', 'bilanz'] })
  mode!: 'euer' | 'bilanz'

  @ApiProperty({ enum: ['SKR03', 'SKR04'] })
  chart!: 'SKR03' | 'SKR04'

  @ApiProperty({ type: Boolean })
  smallBusiness!: boolean

  @ApiProperty({ enum: ['ist', 'soll'] })
  vatMethod!: 'ist' | 'soll'

  @ApiProperty({ type: String, nullable: true })
  municipalityAgs!: string | null

  @ApiProperty({ type: Number, nullable: true })
  multiplierOverride!: number | null

  @ApiProperty({ type: String, nullable: true })
  startDate!: string | null

  @ApiProperty({ type: Number, nullable: true })
  vatPrepaymentsCents!: number | null

  @ApiProperty({ type: VatPeriodFactsDto })
  vatPeriodFacts!: VatPeriodFactsDto

  @ApiProperty({ type: DisposalFactsDto, nullable: true })
  disposalFacts!: DisposalFactsDto | null

  @ApiProperty({ type: RetainedFactsDto, nullable: true })
  retainedFacts!: RetainedFactsDto | null

  @ApiProperty({ type: TradeTaxInputsDto })
  tradeTaxInputs!: TradeTaxInputsDto

  @ApiProperty({ type: LossFactsDto })
  lossFacts!: LossFactsDto

  @ApiProperty({ type: [PartnershipShareDto] })
  partnershipShares!: readonly PartnershipShareDto[]

  @ApiProperty({ type: Boolean, description: 'A book exists: chart and mode are fixed once something is booked.' })
  bookExists!: boolean
}

export class JournalLineDto {
  @ApiProperty({ type: String }) account!: string
  @ApiProperty({ enum: ['debit', 'credit'] }) side!: 'debit' | 'credit'
  @ApiProperty({ type: Number, description: 'Cents.' }) amount!: number
  @ApiProperty({ type: String }) taxKey!: string
  @ApiProperty({ enum: ['base', 'tax'], nullable: true }) taxPart!: 'base' | 'tax' | null
}

export class JournalEntryDto {
  @ApiProperty({ type: Number }) number!: number
  @ApiProperty({ type: String }) date!: string
  @ApiProperty({ type: String }) documentNumber!: string
  @ApiProperty({ type: String, nullable: true }) receiptRef!: string | null
  @ApiProperty({ type: String }) text!: string
  @ApiProperty({ type: [JournalLineDto] }) lines!: readonly JournalLineDto[]
  @ApiProperty({ type: Number, nullable: true }) reversalOf!: number | null
  @ApiPropertyOptional({ type: String, description: 'nutzer | eule:… | bank:… | beleg:… | afa:… | summe | storno | eb' }) source?: string | undefined
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'The Storno that reversed this entry.' }) reversedBy?: number | null | undefined
}

export class BookDto {
  @ApiProperty({ enum: ['SKR03', 'SKR04'] }) chart!: 'SKR03' | 'SKR04'
  @ApiProperty({ enum: ['euer', 'bilanz'] }) mode!: 'euer' | 'bilanz'
  @ApiProperty({ type: String, nullable: true }) lockedThrough!: string | null
  @ApiProperty({ type: BookIntegrityDto }) integrity!: BookIntegrityDto
  @ApiProperty({ type: [JournalEntryDto] }) entries!: readonly JournalEntryDto[]
}

export class BankImportDto {
  @ApiProperty({ enum: ['csv', 'camt053'] })
  @IsIn(['csv', 'camt053'])
  format!: 'csv' | 'camt053'

  @ApiProperty({ type: String, description: 'The file content as text (UTF-8).' })
  @IsString()
  @MaxLength(900_000)
  content!: string

  @ApiPropertyOptional({ enum: ['sparkasse', 'ing', 'dkb', 'commerzbank'] })
  @IsOptional()
  @IsIn(['sparkasse', 'ing', 'dkb', 'commerzbank'])
  preset?: 'sparkasse' | 'ing' | 'dkb' | 'commerzbank' | undefined

  @ApiPropertyOptional({ type: CsvMappingDto, description: 'The column mapping, when no preset fits (columns by header name or position).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CsvMappingDto)
  mapping?: CsvMappingDto | undefined
}

export class BankImportResultDto {
  @ApiProperty({ type: Number }) added!: number
  @ApiProperty({ type: Number }) duplicates!: number
  @ApiProperty({ type: Number, description: 'Transactions dated in another year (not imported into this book).' }) outsideYear!: number
}

export class BookingSuggestionDto {
  @ApiProperty({ type: String }) ruleId!: string
  @ApiProperty({ type: String }) account!: string
  @ApiProperty({ type: String }) taxKey!: string
  @ApiProperty({ type: String }) text!: string
}

export class BankTransactionDataDto {
  @ApiProperty({ type: String, nullable: true }) accountIban!: string | null
  @ApiProperty({ type: String }) bookingDate!: string
  @ApiProperty({ type: String, nullable: true }) valueDate!: string | null
  @ApiProperty({ type: Number, description: 'Signed integer cents: positive is money in, negative money out.' }) amount!: number
  @ApiProperty({ type: String }) currency!: string
  @ApiProperty({ type: String, nullable: true }) counterpartyName!: string | null
  @ApiProperty({ type: String, nullable: true }) counterpartyIban!: string | null
  @ApiProperty({ type: String }) reference!: string
  @ApiProperty({ type: String, nullable: true }) endToEndId!: string | null
  @ApiProperty({ type: String, nullable: true }) bankReference!: string | null
}

export class BankTransactionDto {
  @ApiProperty({ type: String }) id!: string
  @ApiProperty({ enum: ['offen', 'gebucht', 'ignoriert'] }) status!: 'offen' | 'gebucht' | 'ignoriert'
  @ApiProperty({ type: Number, nullable: true }) entryNumber!: number | null
  @ApiProperty({ type: () => BankTransactionDataDto }) transaction!: BankTransactionDataDto
  @ApiProperty({ type: BookingSuggestionDto, nullable: true }) suggestion!: BookingSuggestionDto | null
}

export class AcceptBankTransactionDto {
  @ApiPropertyOptional({ type: String, description: 'Account; defaults to the suggestion.' })
  @IsOptional()
  @Matches(/^\d{4,8}$/)
  account?: string | undefined

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  taxKey?: string | undefined

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string | undefined

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string | undefined

  @ApiPropertyOptional({ type: Boolean, description: 'Remember as a booking rule for this counterparty.' })
  @IsOptional()
  @IsBoolean()
  remember?: boolean | undefined
}

const DATE_OPT = { type: String, example: '2024-05-01' }

/** A building in the business assets (§ 7 Abs. 4, 5a EStG). */
export class BuildingFactsDto {
  @ApiProperty({ enum: ['betrieb', 'wohnen'], description: "'betrieb': not used for living (Abs. 4 Nr. 1); 'wohnen': living (Nr. 2, Abs. 5a)." }) @IsIn(['betrieb', 'wohnen']) use!: 'betrieb' | 'wohnen'
  @ApiProperty({ ...DATE_OPT, description: 'Completion (Fertigstellung).' }) @Matches(ISO_DATE) completed!: string
  @ApiPropertyOptional({ ...DATE_OPT, description: 'Bauantrag: 3 % for a business building only when filed after 31.3.1985.' }) @IsOptional() @Matches(ISO_DATE) applicationFiled?: string | undefined
  @ApiPropertyOptional({ ...DATE_OPT, description: 'Baubeginn (Abs. 5a).' }) @IsOptional() @Matches(ISO_DATE) constructionStarted?: string | undefined
  @ApiPropertyOptional({ ...DATE_OPT, description: 'Purchase contract of a building bought by the end of its completion year (Abs. 5a).' }) @IsOptional() @Matches(ISO_DATE) contractSigned?: string | undefined
}

/** The § 7g EStG Sonder-AfA (Abs. 5) and cut of the cost (Abs. 2). */
export class SpecialDepreciationDto {
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' }, description: 'Year → Sonder-AfA in cents, the acquisition year and the four after it.' }) @IsObject() byYear!: Record<string, number>
  @ApiPropertyOptional({ type: Number, description: 'Cut of the cost by the IAB added back, cents (§ 7g Abs. 2).' }) @IsOptional() @IsInt() @Min(0) costReduction?: number | undefined
  @ApiPropertyOptional({ type: Number, description: 'Profit of the business year before the acquisition, euros (§ 7g Abs. 6 Nr. 1: at most 200.000 €).' }) @IsOptional() @Min(-100_000_000) @Max(100_000_000) priorYearProfitEur?: number | undefined
}

/** The Vorsteuerberichtigung of an asset (§ 15a UStG). */
export class VatCorrectionDto {
  @ApiProperty({ type: Number, description: 'Input VAT on the acquisition cost, cents.' }) @IsInt() @Min(0) inputVatCents!: number
  @ApiProperty({ type: Number, description: 'Share originally deducted, 0–1.' }) @Min(0) @Max(1) originalShare!: number
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'Year → deductible share as it turned out, 0–1.' }) @IsObject() shareByYear!: Record<string, number>
  @ApiPropertyOptional({ type: Number, description: 'The share the sale or Entnahme allows (1 taxable, 0 tax-free); dated by the disposal.' }) @IsOptional() @Min(0) @Max(1) disposalShare?: number | undefined
}

export class AssetFactsDto {
  @ApiPropertyOptional({ type: SpecialDepreciationDto, nullable: true }) @IsOptional() @ValidateNested() @Type(() => SpecialDepreciationDto) specialDepreciation?: SpecialDepreciationDto | null | undefined
  @ApiPropertyOptional({ type: VatCorrectionDto, nullable: true }) @IsOptional() @ValidateNested() @Type(() => VatCorrectionDto) vatCorrection?: VatCorrectionDto | null | undefined
}

export class FixedAssetInputDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) label!: string
  @ApiProperty({ type: String, example: '0420' }) @Matches(/^\d{4,8}$/) account!: string
  @ApiProperty({ type: String, example: '2025-03-14' }) @Matches(ISO_DATE) acquisitionDate!: string
  @ApiProperty({ type: Number, description: 'Net cost in cents.' }) @IsInt() @Min(1) acquisitionCostCents!: number
  @ApiProperty({
    enum: ['linear', 'degressive', 'elektrofahrzeug', 'gwg', 'sofort', 'building', 'building_degressive'],
    description: "'elektrofahrzeug': § 7 Abs. 2a EStG, 75/10/5/5/3/2 % for an electric vehicle bought 1.7.2025–31.12.2027; 'building' and 'building_degressive' need `building`.",
  })
  @IsIn(['linear', 'degressive', 'elektrofahrzeug', 'gwg', 'sofort', 'building', 'building_degressive'])
  method!: string
  @ApiPropertyOptional({ enum: Object.keys(USEFUL_LIVES), description: 'AfA-table category (GET …/selbststaendig/kataloge); sets the useful life when none is given.' })
  @IsOptional()
  @IsIn(Object.keys(USEFUL_LIVES))
  category?: string | undefined
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(1) @Max(50) usefulLifeYears?: number | undefined
  @ApiPropertyOptional({ type: BuildingFactsDto }) @IsOptional() @ValidateNested() @Type(() => BuildingFactsDto) building?: BuildingFactsDto | undefined
  @ApiPropertyOptional({ type: SpecialDepreciationDto }) @IsOptional() @ValidateNested() @Type(() => SpecialDepreciationDto) specialDepreciation?: SpecialDepreciationDto | undefined
}

export class AssetDisposalDto {
  @ApiProperty({ type: String }) @Matches(ISO_DATE) date!: string
  @ApiPropertyOptional({ type: Number, description: 'Net proceeds in cents.' }) @IsOptional() @IsInt() @Min(0) proceedsCents?: number | undefined
}


export class ProcedureDocInputDto {
  @ApiProperty({ type: Object, description: 'Values of the Verfahrensdokumentation placeholders (core VERFAHRENSDOKU_PLACEHOLDERS).' })
  @IsObject()
  values!: Record<string, string>
}

export class ProcedureDocDto {
  @ApiProperty({ type: Object }) values!: Record<string, string>
  @ApiProperty({ type: String }) text!: string
  @ApiProperty({ type: [String] }) missing!: readonly string[]
}

export class ElsterLineDto {
  @ApiProperty({ type: String }) id!: string
  @ApiProperty({ type: String, nullable: true, description: 'Zeile as printed; null where the form has no public line numbers.' }) zeile!: string | null
  @ApiProperty({ type: [String] }) kennzahlen!: readonly string[]
  @ApiProperty({ type: String }) label!: string
  @ApiProperty({ type: String, nullable: true, description: 'Column heading where one Zeile holds several boxes (vom / bis, CHF / EUR); null otherwise.' }) column!: string | null
  // A raw schema: the union of number and word has no class for Nest's reflection to follow.
  @ApiProperty({ type: 'object', oneOf: [{ type: 'number' }, { type: 'string' }], nullable: true, description: 'Euros as a number (two decimals at most); a word („Ja“) where the field takes one; null = nothing to enter.' } as never) value!: number | string | null
}

export class ElsterInstanceDto {
  @ApiProperty({ type: String, description: 'Pass back as `instanz`: the child or property id, A / B, or the copy number.' }) id!: string
  @ApiProperty({ enum: ['person', 'child', 'property', 'copy'] }) kind!: 'person' | 'child' | 'property' | 'copy'
  @ApiProperty({ enum: ['A', 'B'], nullable: true }) person!: 'A' | 'B' | null
  @ApiProperty({ type: String, nullable: true, description: "The child's first name or the property's street." }) name!: string | null
  @ApiProperty({ type: Number, description: '1-based position among the copies of the form.' }) number!: number
}

export class ElsterFormEntryDto {
  @ApiProperty({ type: String, description: 'A business form (anlage-euer …) or a Vordruck of the income-tax return (est-1-a, anlage-n …).' }) form!: string
  @ApiProperty({ enum: ['business', 'income-tax'] }) group!: 'business' | 'income-tax'
  @ApiProperty({ type: ElsterInstanceDto, nullable: true, description: 'Which copy; null for a form filed once.' }) instance!: ElsterInstanceDto | null
}

export class ElsterFormListDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ type: [ElsterFormEntryDto], description: 'The forms with at least one value, business forms first, then the return in the order of the paper printout.' })
  forms!: readonly ElsterFormEntryDto[]
}

export class ElsterHelpDto {
  @ApiProperty({ type: String }) form!: string
  @ApiProperty({ type: ElsterInstanceDto, nullable: true }) instance!: ElsterInstanceDto | null
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ enum: ['published', 'not_published', 'not_available'] }) status!: 'published' | 'not_published' | 'not_available'
  @ApiProperty({ type: String, nullable: true }) note!: string | null
  @ApiProperty({ type: String, nullable: true }) sourceUrl!: string | null
  @ApiProperty({ type: Boolean, description: 'false: no official Zeile numbers (Anlage S/G, GewSt 1 A, unpublished year) — name the field by its label („Feld in Mein ELSTER: …“).' })
  lineNumbersAvailable!: boolean
  @ApiProperty({ type: [ElsterLineDto] }) lines!: readonly ElsterLineDto[]
}

export class EBilanzDto {
  @ApiProperty({ type: String }) xbrl!: string
  @ApiProperty({ type: Boolean, enum: [false] }) transmitted!: false
  @ApiProperty({ type: Boolean, description: 'The operator set up the ERiC sidecar and certificate: the data set can be validated and sent.' }) transmissionReady!: boolean
  @ApiProperty({ type: String }) note!: string
}

export class EBilanzTransmitDto {
  @ApiProperty({ enum: ['validieren', 'senden'] })
  @IsIn(['validieren', 'senden'])
  mode!: 'validieren' | 'senden'
}

export class EBilanzTransmissionDto {
  @ApiProperty({ enum: ['ok', 'abgelehnt', 'nicht_eingerichtet'] }) status!: 'ok' | 'abgelehnt' | 'nicht_eingerichtet'
  @ApiPropertyOptional({ enum: ['validieren', 'senden'] }) mode?: 'validieren' | 'senden' | undefined
  @ApiPropertyOptional({ type: String, nullable: true, description: 'The ELSTER transfer ticket after sending.' }) ticket?: string | null | undefined
  @ApiPropertyOptional({ type: String, nullable: true }) protocol?: string | null | undefined
  @ApiPropertyOptional({ type: [String], description: 'ERiC’s messages on a refusal.' }) messages?: readonly string[] | undefined
  @ApiPropertyOptional({ type: [String], description: 'What the operator still has to set up.' }) missing?: readonly string[] | undefined
}

export class MunicipalityDto {
  @ApiProperty({ type: String }) ags!: string
  @ApiProperty({ type: String }) name!: string
  @ApiProperty({ type: String }) land!: string
  @ApiProperty({ type: Number }) multiplierPercent!: number
}

export class HebesatzLookupDto {
  @ApiProperty({ enum: ['found', 'choices', 'not_found'] }) kind!: 'found' | 'choices' | 'not_found'
  @ApiPropertyOptional({ type: MunicipalityDto }) municipality?: MunicipalityDto | undefined
  @ApiPropertyOptional({ type: [MunicipalityDto] }) choices?: readonly MunicipalityDto[] | undefined
  @ApiProperty({ type: Number, nullable: true, description: 'The year of the table the value is from.' }) tableYear!: number | null
  @ApiProperty({ type: String, nullable: true }) note!: string | null
}

/** The checkout of the self-employment tier (its own name: the client exports one schema per name). */
export class BusinessCheckoutResponseDto {
  @ApiProperty({ type: String, example: 'https://checkout.stripe.com/c/pay/cs_test_…' })
  checkoutUrl!: string
}
