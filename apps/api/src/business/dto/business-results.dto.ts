// Typed wire shapes of the derived results (ADR-0101): closing, VAT, trade tax, losses, assets, catalogues,
// and the profile/mapping inputs the app edits. Units are stated on every amount: `Cents` (integer cents)
// or `Eur` (euros as numbers, two decimals at most).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested, IsArray } from 'class-validator'
import { BANK_CSV_PRESETS, CATALOG_PROFESSIONS, FREE_ACTIVITIES, USEFUL_LIVES } from '@steuereule/core'

export const ASSET_CATEGORIES = Object.keys(USEFUL_LIVES) as (keyof typeof USEFUL_LIVES)[]
const EUR = { type: Number, description: 'Euros.' } as const
const CENTS = { type: Number, description: 'Integer cents.' } as const
const BY_KEY = { type: 'object', additionalProperties: { type: 'number' } } as const

// ---------------------------------------------------------------------------------------------------
// Errors and integrity

export class BookIntegrityDto {
  @ApiProperty({ type: Boolean, description: 'false: the hash chain or an entry is not as logged — shown to the user, exports refuse.' })
  ok!: boolean

  @ApiPropertyOptional({ type: String, description: 'German reason when ok is false.' })
  reason?: string

  @ApiPropertyOptional({ type: Number })
  firstBadSeq?: number
}

/**
 * Every error of the path. Business rules answer `{ statusCode, error, code, message }` (German message for
 * the user, a stable code for the app). A body that fails the DTO validation answers 400 with `fields` instead.
 */
export class BusinessErrorDto {
  @ApiProperty({ type: Number, example: 409 }) statusCode!: number
  @ApiPropertyOptional({ type: String, example: 'Conflict' }) error?: string
  @ApiPropertyOptional({ type: String, example: 'BOOK_INTEGRITY_BROKEN', description: 'Stable error code (absent only for a DTO validation 400, which carries `fields`).' })
  code?: string
  @ApiPropertyOptional({ type: String, example: 'Buchung 3 weicht vom Protokoll ab.', description: 'German, shown to the user.' })
  message?: string
  @ApiPropertyOptional({ type: Object, description: 'DTO validation only: the fields and their constraint.' })
  fields?: Record<string, unknown>
}

// ---------------------------------------------------------------------------------------------------
// Inputs the app edits

export class ProfessionAnswersDto {
  @ApiPropertyOptional({ enum: ['freiberuf', 'gewerbe'], nullable: true, description: 'What the last assessment said (Anlage S or G); null when there is none.' })
  @IsOptional() @IsIn(['freiberuf', 'gewerbe', null]) priorAssessment?: 'freiberuf' | 'gewerbe' | null
  @ApiPropertyOptional({ enum: CATALOG_PROFESSIONS, nullable: true, description: 'Katalogberuf of § 18 Abs. 1 Nr. 1 EStG (core CATALOG_PROFESSIONS).' })
  @IsOptional() @IsIn([...CATALOG_PROFESSIONS, null]) catalogProfession?: (typeof CATALOG_PROFESSIONS)[number] | null
  @ApiPropertyOptional({ type: Boolean, description: 'Comparable to a Katalogberuf in training and work (ähnlicher Beruf).' })
  @IsOptional() @IsBoolean() similarToCatalogProfession?: boolean
  @ApiPropertyOptional({ enum: FREE_ACTIVITIES, nullable: true, description: 'A free activity (wissenschaftlich, künstlerisch, …).' })
  @IsOptional() @IsIn([...FREE_ACTIVITIES, null]) freeActivity?: (typeof FREE_ACTIVITIES)[number] | null
  // The four yes/no questions: one not answered yet counts as „Nein“ for the suggestion.
  @ApiPropertyOptional({ type: Boolean, description: 'The work rests on own expert knowledge; absent = Nein.' }) @IsOptional() @IsBoolean() ownExpertWork?: boolean
  @ApiPropertyOptional({ type: Boolean, description: 'Employs qualified staff; absent = Nein.' }) @IsOptional() @IsBoolean() employsQualifiedStaff?: boolean
  @ApiPropertyOptional({ type: Boolean, description: 'Leads the staff personally and answers for each job; absent = Nein.' }) @IsOptional() @IsBoolean() leadsPersonally?: boolean
  @ApiPropertyOptional({ type: Boolean, description: 'Trades goods or runs a shop beside the profession; absent = Nein.' }) @IsOptional() @IsBoolean() tradesGoods?: boolean
}

export class FinancingComponentsDto {
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 a GewStG: Entgelte für Schulden, euros.' }) @IsOptional() @IsNumber() @Min(0) debtChargesEur?: number
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 b: Renten und dauernde Lasten, euros.' }) @IsOptional() @IsNumber() @Min(0) annuitiesEur?: number
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 c: Gewinnanteile stiller Gesellschafter, euros.' }) @IsOptional() @IsNumber() @Min(0) silentPartnerSharesEur?: number
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 d: Miete/Leasing beweglicher Wirtschaftsgüter, euros.' }) @IsOptional() @IsNumber() @Min(0) rentMovableEur?: number
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 d: dieselbe für E-Fahrzeuge und Fahrräder, euros.' }) @IsOptional() @IsNumber() @Min(0) rentMovableLowEmissionEur?: number
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 e: Miete/Pacht unbeweglicher Wirtschaftsgüter, euros.' }) @IsOptional() @IsNumber() @Min(0) rentImmovableEur?: number
  @ApiPropertyOptional({ ...EUR, description: '§ 8 Nr. 1 f: Lizenzen und Konzessionen, euros.' }) @IsOptional() @IsNumber() @Min(0) licencesEur?: number
}

export class TradeTaxInputsDto {
  @ApiPropertyOptional({ type: FinancingComponentsDto }) @IsOptional() @ValidateNested() @Type(() => FinancingComponentsDto) financing?: FinancingComponentsDto
  @ApiPropertyOptional({ ...EUR, description: 'Further additions (§ 8 Nr. 4–12 GewStG), euros.' }) @IsOptional() @IsNumber() @Min(0) otherAdditionsEur?: number
  @ApiPropertyOptional({ ...EUR, description: 'Einheitswert of the business land for § 9 Nr. 1 GewStG, euros.' }) @IsOptional() @IsNumber() @Min(0) einheitswertEur?: number
  @ApiPropertyOptional({ ...EUR, description: 'Further deductions (§ 9 Nr. 2–10), euros.' }) @IsOptional() @IsNumber() @Min(0) otherDeductionsEur?: number
  @ApiPropertyOptional({ ...EUR, description: 'Gewerbeverlust carried forward (§ 10a GewStG), euros.' }) @IsOptional() @IsNumber() @Min(0) lossCarriedForwardEur?: number
}

export class LossFactsDto {
  @ApiPropertyOptional({ ...EUR, description: 'Verbleibender Verlustvortrag of the last Feststellungsbescheid, euros.' }) @IsOptional() @IsNumber() @Min(0) carriedForwardEur?: number
  @ApiPropertyOptional({ type: Boolean, description: '§ 10d Abs. 1 Satz 5: waive the Rücktrag (as a whole).' }) @IsOptional() @IsBoolean() waiveCarryBack?: boolean
  @ApiPropertyOptional({ type: [Number], description: 'What the GdE of the year before and the second year before still offers, euros: [y−1, y−2].' })
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) roomEur?: [number, number]
  @ApiPropertyOptional({ ...EUR, description: 'A later year’s loss carried back into this year, euros.' }) @IsOptional() @IsNumber() @Min(0) carriedBackEur?: number
}

export class PartnershipShareDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) name!: string
  @ApiProperty({ enum: ['freiberuf', 'gewerbe'] }) @IsIn(['freiberuf', 'gewerbe']) kind!: 'freiberuf' | 'gewerbe'
  @ApiProperty({ ...EUR, description: 'Share of the profit per Feststellungsbescheid, euros (negative for a loss).' }) @IsNumber() profitEur!: number
  @ApiPropertyOptional({ ...EUR, description: 'Share of the Gewerbesteuer-Messbetrag (§ 35), euros.' }) @IsOptional() @IsNumber() baseAmountEur?: number
  @ApiPropertyOptional({ ...EUR, description: 'Share of the Gewerbesteuer actually due (§ 35), euros.' }) @IsOptional() @IsNumber() tradeTaxEur?: number
}

/** A CSV column: by header name (`nth` for a repeated header, 1 = first) or by position (`index`, 0 = first). */
export class CsvColumnDto {
  @ApiPropertyOptional({ type: String, example: 'Buchungstag' }) @IsOptional() @IsString() @MaxLength(100) name?: string
  @ApiPropertyOptional({ type: Number, example: 2, description: 'Which occurrence of a repeated header name, 1 = first.' }) @IsOptional() @IsInt() @Min(1) nth?: number
  @ApiPropertyOptional({ type: Number, example: 1, description: 'Column position in the header row, 0 = first; used when `name` is not given.' }) @IsOptional() @IsInt() @Min(0) @Max(200) index?: number
}

/** The column mapping of a bank CSV no preset fits (core CsvMapping). */
export class CsvMappingDto {
  @ApiProperty({ enum: [';', ',', '\t'] }) @IsIn([';', ',', '\t']) delimiter!: ';' | ',' | '\t'
  @ApiProperty({ enum: [',', '.'], description: 'Decimal separator of the amounts.' }) @IsIn([',', '.']) decimal!: ',' | '.'
  @ApiProperty({ enum: ['DD.MM.YYYY', 'DD.MM.YY', 'YYYY-MM-DD'] }) @IsIn(['DD.MM.YYYY', 'DD.MM.YY', 'YYYY-MM-DD']) dateFormat!: 'DD.MM.YYYY' | 'DD.MM.YY' | 'YYYY-MM-DD'
  @ApiProperty({ type: CsvColumnDto }) @ValidateNested() @Type(() => CsvColumnDto) bookingDate!: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) valueDate?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto, description: 'One signed amount column; or `debit` and `credit`.' }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) amount?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto, description: 'Unsigned debit (Soll) column, with `credit`.' }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) debit?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto, description: 'Unsigned credit (Haben) column, with `debit`.' }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) credit?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) counterpartyName?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) counterpartyIban?: CsvColumnDto
  @ApiProperty({ type: [CsvColumnDto], description: 'One or more columns, joined with a space.' }) @IsArray() @ValidateNested({ each: true }) @Type(() => CsvColumnDto) reference!: CsvColumnDto[]
  @ApiPropertyOptional({ type: CsvColumnDto }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) currency?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) endToEndId?: CsvColumnDto
  @ApiPropertyOptional({ type: CsvColumnDto }) @IsOptional() @ValidateNested() @Type(() => CsvColumnDto) accountIban?: CsvColumnDto
  @ApiPropertyOptional({ type: String, example: 'EUR' }) @IsOptional() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string
}

// ---------------------------------------------------------------------------------------------------
// Catalogues

export class CatalogEntryDto {
  @ApiProperty({ type: String }) key!: string
  @ApiProperty({ type: String, description: 'German label.' }) label!: string
}

export class AssetCategoryDto {
  @ApiProperty({ enum: ASSET_CATEGORIES, description: 'Key of the official AfA table (core USEFUL_LIVES).' }) key!: string
  @ApiProperty({ type: String }) label!: string
  @ApiProperty({ type: Number, description: 'Useful life in years.' }) years!: number
  @ApiProperty({ type: String, description: 'The official source of the useful life.' }) source!: string
}

export class BusinessCataloguesDto {
  @ApiProperty({ type: [CatalogEntryDto], description: 'Katalogberufe the suggestion knows (`professionAnswers.catalogProfession`).' }) professions!: CatalogEntryDto[]
  @ApiProperty({ type: [CatalogEntryDto], description: 'Free activities (`professionAnswers.freeActivity`).' }) freeActivities!: CatalogEntryDto[]
  @ApiProperty({ type: [AssetCategoryDto], description: 'AfA-table categories (`category` of an asset).' }) assetCategories!: AssetCategoryDto[]
  @ApiProperty({ enum: Object.keys(BANK_CSV_PRESETS), isArray: true, description: 'Bank CSV presets (`preset` of the bank import).' }) bankPresets!: string[]
}

// ---------------------------------------------------------------------------------------------------
// Closing

export class EuerTotalsDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ ...BY_KEY, description: 'Per EuerKey, integer cents: Einnahmen for income keys, Ausgaben for the others.' }) byKey!: Record<string, number>
  @ApiProperty({ ...BY_KEY, description: 'The not (fully) deductible part per EuerKey, integer cents.' }) nonDeductible!: Record<string, number>
  @ApiProperty(CENTS) einnahmen!: number
  @ApiProperty(CENTS) ausgaben!: number
  @ApiProperty(CENTS) ueberschuss!: number
}

export class ProfitLineDto {
  @ApiProperty({ type: String, description: 'EuerKey.' }) key!: string
  @ApiProperty(EUR) amountEur!: number
  @ApiProperty({ ...EUR, description: 'What the profit counts of it, euros.' }) countedEur!: number
  @ApiProperty({ ...EUR, description: 'Signed effect on the profit, euros.' }) effectEur!: number
}

export class EuerProfitDto {
  @ApiProperty(EUR) incomeEur!: number
  @ApiProperty(EUR) expensesEur!: number
  @ApiProperty(EUR) nonDeductibleEur!: number
  @ApiProperty(EUR) profitBeforeIabEur!: number
  @ApiProperty({ ...EUR, description: 'Gewinn, euros (negative = Verlust).' }) profitEur!: number
  @ApiProperty({ type: [ProfitLineDto] }) lines!: ProfitLineDto[]
  @ApiProperty({ type: [String], description: 'Restricted expenses entered as totals only; the user should check them.' }) openPoints!: string[]
}

export class EuerClosingDto {
  @ApiProperty({ type: EuerTotalsDto }) totals!: EuerTotalsDto
  @ApiProperty({ type: EuerProfitDto }) profit!: EuerProfitDto
}

export class IncomeStatementDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ ...BY_KEY, description: 'Per § 275 HGB position (GuV.1 …), integer cents.' }) positions!: Record<string, number>
  @ApiProperty({ ...CENTS, description: 'Jahresüberschuss (+) or Jahresfehlbetrag (−), integer cents.' }) profit!: number
}

export class EquityDevelopmentDto {
  @ApiProperty(CENTS) opening!: number
  @ApiProperty(CENTS) deposits!: number
  @ApiProperty(CENTS) withdrawals!: number
  @ApiProperty(CENTS) profit!: number
  @ApiProperty(CENTS) closing!: number
}

export class BalanceSheetDto {
  @ApiProperty({ type: Number }) year!: number
  @ApiProperty({ ...BY_KEY, description: 'Aktiva per § 266 HGB position (A.I …), integer cents.' }) aktiva!: Record<string, number>
  @ApiProperty({ ...BY_KEY, description: 'Passiva per position (P.A …), integer cents.' }) passiva!: Record<string, number>
  @ApiProperty(CENTS) totalAktiva!: number
  @ApiProperty(CENTS) totalPassiva!: number
  @ApiProperty({ type: EquityDevelopmentDto }) equity!: EquityDevelopmentDto
  @ApiProperty(CENTS) profit!: number
}

export class ClosingBalanceDto {
  @ApiProperty({ type: String }) account!: string
  @ApiProperty({ enum: ['debit', 'credit'] }) side!: 'debit' | 'credit'
  @ApiProperty(CENTS) amount!: number
}

export class DraftLineDto {
  @ApiProperty({ type: String }) account!: string
  @ApiProperty({ enum: ['debit', 'credit'] }) side!: 'debit' | 'credit'
  @ApiProperty(CENTS) amount!: number
  @ApiPropertyOptional({ type: String }) taxKey?: string
}

export class OpeningEntryDto {
  @ApiProperty({ type: String }) date!: string
  @ApiProperty({ type: String }) documentNumber!: string
  @ApiProperty({ type: String }) text!: string
  @ApiProperty({ type: [DraftLineDto] }) lines!: DraftLineDto[]
}

export class BilanzClosingDto {
  @ApiProperty({ type: IncomeStatementDto }) incomeStatement!: IncomeStatementDto
  @ApiProperty({ type: BalanceSheetDto }) balanceSheet!: BalanceSheetDto
  @ApiProperty({ type: [ClosingBalanceDto] }) closingBalances!: ClosingBalanceDto[]
  @ApiProperty({ type: OpeningEntryDto, description: 'The Eröffnungsbilanz entry of the next year (`POST …/abschluss/eroeffnung` posts it).' }) openingEntry!: OpeningEntryDto
}

export class ClosingDto {
  @ApiProperty({ enum: ['euer', 'bilanz'] }) mode!: 'euer' | 'bilanz'
  @ApiProperty({ type: BookIntegrityDto }) integrity!: BookIntegrityDto
  @ApiProperty({ type: EuerClosingDto, nullable: true, description: 'Present for mode euer.' }) euer!: EuerClosingDto | null
  @ApiProperty({ type: BilanzClosingDto, nullable: true, description: 'Present for mode bilanz.' }) bilanz!: BilanzClosingDto | null
}

// ---------------------------------------------------------------------------------------------------
// Umsatzsteuer

export class NetByRateDto {
  @ApiPropertyOptional({ ...EUR, description: '19 %, euros.' }) standard?: number
  @ApiPropertyOptional({ ...EUR, description: '7 %, euros.' }) reduced?: number
  @ApiPropertyOptional({ ...EUR, description: '0 %, euros.' }) zero?: number
}

export class VatFiguresDto {
  @ApiProperty({ type: NetByRateDto, description: 'Taxable net turnover per rate, euros.' }) taxableNetEur!: NetByRateDto
  @ApiProperty({ type: NetByRateDto, description: '§ 13b net fees received, euros.' }) reverseChargeNetEur!: NetByRateDto
  @ApiProperty(EUR) taxFreeWithDeductionEur!: number
  @ApiProperty(EUR) taxFreeWithoutDeductionEur!: number
  @ApiProperty({ ...EUR, description: 'Turnover as Kleinunternehmer, euros.' }) smallBusinessTurnoverEur!: number
  @ApiProperty(EUR) inputVatEur!: number
}

export class OutputVatDto {
  @ApiProperty(EUR) standard!: number
  @ApiProperty(EUR) reduced!: number
  @ApiProperty(EUR) zero!: number
}

export class VatResultDto {
  @ApiProperty({ type: OutputVatDto, description: 'Output VAT per rate, euros.' }) outputVat!: OutputVatDto
  @ApiProperty(EUR) reverseChargeVatEur!: number
  @ApiProperty(EUR) inputVatDeductibleEur!: number
  @ApiProperty({ ...EUR, description: 'Umsatzsteuer of the year before the prepayments, euros.' }) vatOfYearEur!: number
  @ApiProperty(EUR) prepaymentsEur!: number
  @ApiProperty({ ...EUR, description: 'Positive = Abschlusszahlung, negative = Erstattung, euros.' }) balanceEur!: number
}

export class SmallBusinessCheckDto {
  @ApiProperty({ type: Boolean, description: 'The § 19 UStG limits are kept by the book’s turnover.' }) eligible!: boolean
  @ApiProperty({ type: Number, description: 'Limit for the year before (in the founding year: for the running year), euros.' }) priorYearLimitEur!: number
  @ApiProperty({ type: Number, description: 'Limit for the running year, euros.' }) currentYearLimitEur!: number
  @ApiProperty({ enum: ['prior_year', 'current_year'], nullable: true, description: 'Which limit is crossed.' }) crossed!: 'prior_year' | 'current_year' | null
  @ApiProperty({ type: Boolean, description: 'The business started this year (§ 19 Abs. 2 UStG nF, Abschn. 19.1 Abs. 4 UStAE).' }) foundingYear!: boolean
  @ApiProperty({ type: Boolean, description: 'The turnover of the year before is known from its book.' }) priorYearKnown!: boolean
  @ApiProperty(EUR) turnoverEur!: number
  @ApiProperty({ type: Boolean, description: 'False when the profile claims the rule although a limit is crossed.' }) matchesProfile!: boolean
}

export class VatReturnDto {
  @ApiProperty({ type: VatFiguresDto }) figures!: VatFiguresDto
  @ApiProperty({ type: VatResultDto }) result!: VatResultDto
  @ApiProperty({ type: Boolean, description: 'Ist-Versteuerung allowed by the turnover of the year before (§ 20 UStG).' }) cashAccountingAllowed!: boolean
  @ApiProperty({ type: SmallBusinessCheckDto }) smallBusiness!: SmallBusinessCheckDto
}

// ---------------------------------------------------------------------------------------------------
// Gewerbesteuer

export class TradeTaxResultDto {
  @ApiProperty(EUR) additionsEur!: number
  @ApiProperty(EUR) deductionsEur!: number
  @ApiProperty(EUR) tradeIncomeBeforeLossEur!: number
  @ApiProperty({ ...EUR, description: '§ 10a GewStG: Gewerbeverlust (Fehlbetrag) of earlier years used this year, euros — why the Gewerbeertrag is below Gewinn + Hinzurechnungen − Kürzungen.' }) lossUsedEur!: number
  @ApiProperty({ ...EUR, description: 'Gewerbeverlust left to carry forward (§ 10a Satz 6), euros.' }) lossRemainingEur!: number
  @ApiProperty(EUR) roundedTradeIncomeEur!: number
  @ApiProperty(EUR) allowanceEur!: number
  @ApiProperty({ ...EUR, description: 'Steuermessbetrag, whole euros.' }) baseAmountEur!: number
  @ApiProperty({ type: Number, description: 'Hebesatz in percent.' }) multiplierPercent!: number
  @ApiProperty(EUR) tradeTaxEur!: number
}

export class TradeTaxMultiplierDto {
  @ApiProperty({ type: Number, description: 'Hebesatz in percent.' }) percent!: number
  @ApiProperty({ enum: ['korrektur', 'tabelle'], description: 'The user’s correction or the official table.' }) source!: 'korrektur' | 'tabelle'
  @ApiProperty({ type: Number, nullable: true, description: 'The year of the table the value is from.' }) tableYear!: number | null
  @ApiProperty({ type: String, nullable: true }) note!: string | null
}

export class TradeTaxDto {
  @ApiProperty({ enum: ['berechnet', 'offen', 'entfaellt'] }) status!: 'berechnet' | 'offen' | 'entfaellt'
  @ApiPropertyOptional({ ...EUR, description: 'status berechnet: the Gewinn aus Gewerbebetrieb the return starts from, euros.' }) profitEur?: number
  @ApiPropertyOptional({ type: TradeTaxResultDto, description: 'status berechnet.' }) result?: TradeTaxResultDto
  @ApiPropertyOptional({ type: TradeTaxMultiplierDto, description: 'status berechnet.' }) multiplier?: TradeTaxMultiplierDto
  @ApiPropertyOptional({ type: [String], example: ['hebesatz'], description: 'status offen: what is missing.' }) missing?: string[]
  @ApiPropertyOptional({ type: String, description: 'status entfaellt: why (German).' }) reason?: string
}

// ---------------------------------------------------------------------------------------------------
// Verluste

export class LossRulesDto {
  @ApiProperty(EUR) carryBackCapEur!: number
  @ApiProperty({ type: Number }) carryBackYears!: number
  @ApiProperty(EUR) forwardBaseEur!: number
  @ApiProperty({ type: Number, description: 'Share above the Sockelbetrag, e.g. 0.7.' }) forwardRate!: number
}

export class LossYearDto {
  @ApiProperty(EUR) carryBackDeductedEur!: number
  @ApiProperty(EUR) carryForwardDeductedEur!: number
  @ApiProperty(EUR) gdeAfterLossesEur!: number
  @ApiProperty({ ...EUR, description: 'This year’s loss as a positive amount; 0 in a profit year.' }) newLossEur!: number
  @ApiProperty(EUR) remainingCarryForwardEur!: number
}

export class CarryBackDto {
  @ApiProperty(EUR) intoYearBeforeEur!: number
  @ApiProperty(EUR) intoSecondYearBeforeEur!: number
  @ApiProperty({ ...EUR, description: 'What goes forward into the Feststellung.' }) remainingEur!: number
}

export class LossesDto {
  @ApiProperty({ type: LossFactsDto }) facts!: LossFactsDto
  @ApiProperty({ type: LossRulesDto }) rules!: LossRulesDto
  @ApiProperty({ ...EUR, description: 'The business profit of the year from the book, euros.' }) businessProfitEur!: number
  @ApiProperty({ type: LossYearDto }) year!: LossYearDto
  @ApiProperty({ type: CarryBackDto, nullable: true, description: 'Only in a loss year.' }) carryBack!: CarryBackDto | null
}

// ---------------------------------------------------------------------------------------------------
// Anlagen

export class AssetRegisterColumnsDto {
  @ApiProperty(CENTS) acquisitionCost!: number
  @ApiProperty(CENTS) openingBookValue!: number
  @ApiProperty(CENTS) additions!: number
  @ApiProperty(CENTS) depreciation!: number
  @ApiProperty({ ...CENTS, description: 'Book value that left with a disposal in the year, integer cents.' }) disposals!: number
  @ApiProperty(CENTS) closingBookValue!: number
}

export class AssetRegisterRowDto extends AssetRegisterColumnsDto {
  @ApiProperty({ type: String, description: 'The asset id: the same id `POST …/anlagen/{anlageId}/abgang` takes.' }) id!: string
  @ApiProperty({ type: String }) label!: string
  @ApiProperty({ type: String, description: 'Asset account in the book’s chart.' }) account!: string
  @ApiProperty({ type: String }) acquisitionDate!: string
}

export class AssetRegisterDto {
  @ApiProperty({ type: [AssetRegisterRowDto] }) rows!: AssetRegisterRowDto[]
  @ApiProperty({ type: AssetRegisterColumnsDto }) totals!: AssetRegisterColumnsDto
}

export class FixedAssetDto {
  @ApiProperty({ type: String, description: 'The id `POST …/anlagen/{anlageId}/abgang` takes.' }) id!: string
  @ApiProperty({ type: Number, description: 'Year of acquisition.' }) taxYear!: number
  @ApiProperty({ enum: ['A', 'B'] }) person!: 'A' | 'B'
  @ApiProperty({ type: String }) label!: string
  @ApiProperty({ type: String }) account!: string
  @ApiProperty({ type: String }) acquisitionDate!: string
  @ApiProperty({ ...CENTS, description: 'Net acquisition cost, integer cents.' }) acquisitionCost!: number
  @ApiProperty({ enum: ['linear', 'degressive', 'gwg', 'sofort', 'building'] }) method!: string
  @ApiProperty({ enum: ASSET_CATEGORIES, nullable: true }) category!: string | null
  @ApiProperty({ type: Number, nullable: true }) usefulLifeYears!: number | null
  @ApiProperty({ type: String, nullable: true, description: 'JSON: { byYear: { [year]: cents }, costReduction: cents }.' }) specialDepreciation!: string | null
  @ApiProperty({ type: String, nullable: true, description: 'JSON: { date, proceedsCents }.' }) disposal!: string | null
}

export class AssetsResponseDto {
  @ApiProperty({ type: AssetRegisterDto }) register!: AssetRegisterDto
  @ApiProperty({ type: [FixedAssetDto] }) records!: FixedAssetDto[]
}

