// Wire shapes of the self-employment path (ADR-0101). Nested facts travel as plain objects: the core
// checks their content (parseBookingDraft, suggestProfessionKind, the tax rules), not class-validator.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { USEFUL_LIVES } from '@steuereule/core'
import { BookIntegrityDto, CsvMappingDto, LossFactsDto, PartnershipShareDto, ProfessionAnswersDto, TradeTaxInputsDto } from './business-results.dto.js'

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
  taxKey?: string

  @ApiPropertyOptional({ enum: ['gross', 'net'] })
  amountIs?: 'gross' | 'net'
}

export class BookingAssetDto {
  @ApiProperty({ type: String, example: 'Notebook' })
  label!: string

  @ApiProperty({ enum: ['linear', 'degressive', 'gwg', 'sofort'] })
  method!: 'linear' | 'degressive' | 'gwg' | 'sofort'

  @ApiPropertyOptional({ type: String, example: 'computer', description: 'Key of the official AfA table (core USEFUL_LIVES).' })
  category?: string

  @ApiPropertyOptional({ type: Number, example: 3 })
  usefulLifeYears?: number
}

/** A booking as the user (or an accepted draft) posts it; checked by the core against the book. */
export class BookingDraftDto {
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
  receiptRef?: string

  @ApiProperty({ type: [BookingLineDto] })
  @IsArray()
  lines!: BookingLineDto[]

  @ApiPropertyOptional({ type: BookingAssetDto, description: 'A fixed asset: how it is depreciated.' })
  @IsOptional()
  @IsObject()
  asset?: BookingAssetDto
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
  text?: string
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
  date?: string
}

export class QuickEntryDto {
  @ApiProperty({ type: [QuickTotalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuickTotalDto)
  totals!: QuickTotalDto[]
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
  confirmedKind?: 'freiberuf' | 'gewerbe' | null

  @ApiPropertyOptional({ type: ProfessionAnswersDto, nullable: true, description: 'The profession questions; the core’s Freiberuf/Gewerbe suggestion is computed from them. Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfessionAnswersDto)
  professionAnswers?: ProfessionAnswersDto | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null

  @ApiPropertyOptional({ enum: ['euer', 'bilanz'] })
  @IsOptional()
  @IsIn(['euer', 'bilanz'])
  mode?: 'euer' | 'bilanz'

  @ApiPropertyOptional({ enum: ['SKR03', 'SKR04'] })
  @IsOptional()
  @IsIn(['SKR03', 'SKR04'])
  chart?: 'SKR03' | 'SKR04'

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  smallBusiness?: boolean

  @ApiPropertyOptional({ enum: ['ist', 'soll'] })
  @IsOptional()
  @IsIn(['ist', 'soll'])
  vatMethod?: 'ist' | 'soll'

  @ApiPropertyOptional({ type: String, nullable: true, example: '09162000', description: 'Amtlicher Gemeindeschlüssel.' })
  @IsOptional()
  @Matches(/^\d{8}$/)
  municipalityAgs?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true, example: 490, description: 'Hebesatz in percent, instead of the table’s.' })
  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(1500)
  multiplierOverride?: number | null

  @ApiPropertyOptional({ type: String, nullable: true, example: '2024-01-01' })
  @IsOptional()
  @Matches(ISO_DATE)
  startDate?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Umsatzsteuer prepayments of the year in cents.' })
  @IsOptional()
  @IsInt()
  vatPrepaymentsCents?: number | null

  @ApiPropertyOptional({ type: TradeTaxInputsDto, nullable: true, description: 'Gewerbesteuer inputs, euros. Replaced as a whole: send the complete object.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TradeTaxInputsDto)
  tradeTaxInputs?: TradeTaxInputsDto | null

  @ApiPropertyOptional({ type: LossFactsDto, nullable: true, description: '§ 10d facts, euros. Replaced as a whole.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LossFactsDto)
  lossFacts?: LossFactsDto | null

  @ApiPropertyOptional({ type: [PartnershipShareDto], nullable: true, description: 'Shares from partnerships (Feststellungsbescheid). Replaced as a whole.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnershipShareDto)
  partnershipShares?: PartnershipShareDto[] | null
}

export class ProfessionSuggestionDto {
  @ApiProperty({ enum: ['freiberuf', 'gewerbe', 'unklar'] })
  suggestion!: 'freiberuf' | 'gewerbe' | 'unklar'

  @ApiProperty({ type: [String] })
  reasons!: string[]

  @ApiProperty({ type: [String] })
  basis!: string[]
}

export class BusinessProfileDto {
  @ApiProperty({ enum: ['A', 'B'] })
  person!: 'A' | 'B'

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

  @ApiProperty({ type: TradeTaxInputsDto })
  tradeTaxInputs!: TradeTaxInputsDto

  @ApiProperty({ type: LossFactsDto })
  lossFacts!: LossFactsDto

  @ApiProperty({ type: [PartnershipShareDto] })
  partnershipShares!: PartnershipShareDto[]

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
  @ApiProperty({ type: [JournalLineDto] }) lines!: JournalLineDto[]
  @ApiProperty({ type: Number, nullable: true }) reversalOf!: number | null
  @ApiPropertyOptional({ type: String, description: 'nutzer | eule:… | bank:… | beleg:… | afa:… | summe | storno | eb' }) source?: string
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'The Storno that reversed this entry.' }) reversedBy?: number | null
}

export class BookDto {
  @ApiProperty({ enum: ['SKR03', 'SKR04'] }) chart!: 'SKR03' | 'SKR04'
  @ApiProperty({ enum: ['euer', 'bilanz'] }) mode!: 'euer' | 'bilanz'
  @ApiProperty({ type: String, nullable: true }) lockedThrough!: string | null
  @ApiProperty({ type: BookIntegrityDto }) integrity!: BookIntegrityDto
  @ApiProperty({ type: [JournalEntryDto] }) entries!: JournalEntryDto[]
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
  preset?: 'sparkasse' | 'ing' | 'dkb' | 'commerzbank'

  @ApiPropertyOptional({ type: CsvMappingDto, description: 'The column mapping, when no preset fits (columns by header name or position).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CsvMappingDto)
  mapping?: CsvMappingDto
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
  account?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  taxKey?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string

  @ApiPropertyOptional({ type: Boolean, description: 'Remember as a booking rule for this counterparty.' })
  @IsOptional()
  @IsBoolean()
  remember?: boolean
}

export class FixedAssetInputDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) label!: string
  @ApiProperty({ type: String, example: '0420' }) @Matches(/^\d{4,8}$/) account!: string
  @ApiProperty({ type: String, example: '2025-03-14' }) @Matches(ISO_DATE) acquisitionDate!: string
  @ApiProperty({ type: Number, description: 'Net cost in cents.' }) @IsInt() @Min(1) acquisitionCostCents!: number
  @ApiProperty({ enum: ['linear', 'degressive', 'gwg', 'sofort'] }) @IsIn(['linear', 'degressive', 'gwg', 'sofort']) method!: string
  @ApiPropertyOptional({ enum: Object.keys(USEFUL_LIVES), description: 'AfA-table category (GET …/selbststaendig/kataloge); sets the useful life when none is given.' })
  @IsOptional()
  @IsIn(Object.keys(USEFUL_LIVES))
  category?: string
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(1) @Max(50) usefulLifeYears?: number
}

export class AssetDisposalDto {
  @ApiProperty({ type: String }) @Matches(ISO_DATE) date!: string
  @ApiPropertyOptional({ type: Number, description: 'Net proceeds in cents.' }) @IsOptional() @IsInt() @Min(0) proceedsCents?: number
}


export class ProcedureDocInputDto {
  @ApiProperty({ type: Object, description: 'Values of the Verfahrensdokumentation placeholders (core VERFAHRENSDOKU_PLACEHOLDERS).' })
  @IsObject()
  values!: Record<string, string>
}

export class ProcedureDocDto {
  @ApiProperty({ type: Object }) values!: Record<string, string>
  @ApiProperty({ type: String }) text!: string
  @ApiProperty({ type: [String] }) missing!: string[]
}

export class ElsterLineDto {
  @ApiProperty({ type: String }) id!: string
  @ApiProperty({ type: String, nullable: true, description: 'Zeile as printed; null where the form has no public line numbers.' }) zeile!: string | null
  @ApiProperty({ type: [String] }) kennzahlen!: string[]
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
  forms!: ElsterFormEntryDto[]
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
  @ApiProperty({ type: [ElsterLineDto] }) lines!: ElsterLineDto[]
}

export class EBilanzDto {
  @ApiProperty({ type: String }) xbrl!: string
  @ApiProperty({ type: Boolean, enum: [false] }) transmitted!: false
  @ApiProperty({ type: String }) note!: string
}

export class MunicipalityDto {
  @ApiProperty({ type: String }) ags!: string
  @ApiProperty({ type: String }) name!: string
  @ApiProperty({ type: String }) land!: string
  @ApiProperty({ type: Number }) multiplierPercent!: number
}

export class HebesatzLookupDto {
  @ApiProperty({ enum: ['found', 'choices', 'not_found'] }) kind!: 'found' | 'choices' | 'not_found'
  @ApiPropertyOptional({ type: MunicipalityDto }) municipality?: MunicipalityDto
  @ApiPropertyOptional({ type: [MunicipalityDto] }) choices?: MunicipalityDto[]
  @ApiProperty({ type: Number, nullable: true, description: 'The year of the table the value is from.' }) tableYear!: number | null
  @ApiProperty({ type: String, nullable: true }) note!: string | null
}

/** The checkout of the self-employment tier (its own name: the client exports one schema per name). */
export class BusinessCheckoutResponseDto {
  @ApiProperty({ type: String, example: 'https://checkout.stripe.com/c/pay/cs_test_…' })
  checkoutUrl!: string
}
