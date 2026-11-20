import { applyDecorators, Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import type { BankCsvPreset, BookingTaxKey, ProfessionAnswers, VerfahrensdokuPlaceholder } from '@steuereule/core'
import { BANK_CSV_PRESETS, CATALOG_PROFESSIONS, FREE_ACTIVITIES, FREE_ACTIVITY_LABELS, PROFESSION_LABELS, USEFUL_LIVES, parseBookingDraft } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { toCoreMapping } from './csv-mapping.js'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { UnlockService } from '../unlock/unlock.service.js'
import { firstBusinessOf, type BusinessPerson, type BusinessRef } from './business.repository.js'
import { BusinessService, type LossFacts, type PartnershipShare, type TradeTaxInputs } from './business.service.js'
import { ElsterHelpService } from './elster-help.service.js'
import {
  AcceptBankTransactionDto,
  AssetDisposalDto,
  BankImportDto,
  BankImportResultDto,
  BankTransactionDto,
  BookDto,
  BusinessCheckoutResponseDto,
  BookingDraftDto,
  BusinessProfileDto,
  BusinessListItemDto,
  NewBusinessDto,
  CompanyCarInputDto,
  BusinessProfileInputDto,
  EBilanzDto,
  ElsterFormListDto,
  ElsterHelpDto,
  FixedAssetInputDto,
  HebesatzLookupDto,
  JournalEntryDto,
  LockDto,
  ProcedureDocDto,
  ProcedureDocInputDto,
  QuickEntryDto,
  ReversalDto,
} from './dto/business.dto.js'
import {
  SpecialTariffsDto,
  VatPrepaymentsDto,
  CompanyCarResultDto,
  AssetsResponseDto,
  BusinessCataloguesDto,
  BusinessErrorDto,
  ClosingDto,
  FixedAssetDto,
  LossesDto,
  TradeTaxDto,
  VatReturnDto,
} from './dto/business-results.dto.js'

const ERROR_TEXT: Readonly<Record<number, string>> = {
  400: 'The body fails validation (`fields`) or a business rule (`code`, German `message`), e.g. BOOKING_UNBALANCED, LEDGER_PERIOD_LOCKED.',
  402: 'SELF_EMPLOYMENT_NOT_UNLOCKED: the year is not paid at the self-employment tier.',
  403: 'SELF_EMPLOYMENT_DISABLED (switch off) or SELF_EMPLOYMENT_NOT_DECLARED (no self-employment in the interview).',
  404: 'The entry, transaction, asset or form does not exist for this account.',
  409: 'BOOK_INTEGRITY_BROKEN (hash chain or entry not as logged), BOOK_FRAME_FIXED, a draft or transaction already done.',
  503: 'PAYMENT_NOT_CONFIGURED or PAYMENT_TIER_NOT_CONFIGURED.',
}

/** The error statuses of an endpoint, each with the one error body (`code`, `message`). */
function Errors(...statuses: number[]): MethodDecorator & ClassDecorator {
  return applyDecorators(...statuses.map((status) => ApiResponse({ status, type: BusinessErrorDto, description: ERROR_TEXT[status] ?? 'Error.' })))
}

function personOf(raw: string | undefined): BusinessPerson {
  if (raw === undefined || raw === '' || raw === 'A') return 'A'
  if (raw === 'B') return 'B'
  throw new InvalidInputError('PERSON_INVALID', '„person“ ist A oder B.')
}

/** ADR-0101 §22: the business of the person, from 1 (default). */
function refOf(rawPerson: string | undefined, rawBusiness: string | undefined): BusinessRef {
  const person = personOf(rawPerson)
  if (rawBusiness === undefined || rawBusiness === '') return firstBusinessOf(person)
  const business = Number(rawBusiness)
  if (!Number.isSafeInteger(business) || business < 1 || business > 99) throw new InvalidInputError('BUSINESS_INVALID', '„betrieb“ ist eine Zahl ab 1.')
  return { person, business }
}

const YEAR = { name: 'jahr', type: Number, example: 2025 } as const
const PERSON = { name: 'person', required: false, enum: ['A', 'B'], description: 'Whose business: A (default) or B of a joint return.' } as const
const BUSINESS = { name: 'betrieb', required: false, type: Number, description: 'Which business of the person, from 1 (default); ADR-0101 §22.' } as const

/** The self-employment path (ADR-0101), behind SELBSTSTAENDIGE_ENABLED: 403 while the switch is off. */
@ApiTags('selbststaendig')
@ApiParam(YEAR)
@ApiQuery(PERSON)
@ApiQuery(BUSINESS)
@ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
@Errors(400, 403)
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class BusinessController {
  constructor(
    @Inject(BusinessService) private readonly service: BusinessService,
    @Inject(UnlockService) private readonly unlock: UnlockService,
    @Inject(ElsterHelpService) private readonly elsterHelp: ElsterHelpService,
  ) {}

  @Get(':jahr/selbststaendig/betriebe')
  @RequiresAccount()
  @ApiOkResponse({ type: BusinessListItemDto, isArray: true, description: 'The businesses of the person in the year, at least the first.' })
  businesses(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string): Promise<BusinessListItemDto[]> {
    return this.service.listBusinesses(userId, year, personOf(person)) as unknown as Promise<BusinessListItemDto[]>
  }

  @Post(':jahr/selbststaendig/betriebe')
  @HttpCode(201)
  @RequiresAccount()
  @ApiBody({ type: NewBusinessDto })
  @ApiOkResponse({ type: BusinessProfileDto, description: 'The new business with the next number.' })
  addBusiness(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: NewBusinessDto, @Query('person') person?: string): Promise<BusinessProfileDto> {
    return this.service.addBusiness(userId, year, personOf(person), dto.name) as unknown as Promise<BusinessProfileDto>
  }

  @Post(':jahr/selbststaendig/betriebe/:nummer/entfernen')
  @HttpCode(204)
  @ApiParam({ name: 'nummer', type: Number, description: 'The business number, from 2.' })
  @RequiresAccount()
  @Errors(409)
  async removeBusiness(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('nummer', ParseIntPipe) business: number, @Query('person') person?: string): Promise<void> {
    await this.service.removeBusiness(userId, year, refOf(person, String(business)))
  }

  @Get(':jahr/selbststaendig/kataloge')
  @RequiresAccount()
  @ApiOkResponse({ type: BusinessCataloguesDto, description: 'The lists the inputs take: Katalogberufe, free activities, AfA-table categories, bank CSV presets.' })
  catalogues(): BusinessCataloguesDto {
    return {
      professions: CATALOG_PROFESSIONS.map((key) => ({ key, label: PROFESSION_LABELS[key] })),
      freeActivities: FREE_ACTIVITIES.map((key) => ({ key, label: FREE_ACTIVITY_LABELS[key] })),
      assetCategories: Object.entries(USEFUL_LIVES).map(([key, life]) => ({ key, label: life.label, years: life.years, source: life.source })),
      bankPresets: Object.keys(BANK_CSV_PRESETS),
    }
  }

  @Get(':jahr/selbststaendig')
  @RequiresAccount()
  @ApiOkResponse({ type: BusinessProfileDto, description: 'The business profile with the core’s Freiberuf/Gewerbe suggestion and its reasons.' })
  profile(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<BusinessProfileDto> {
    return this.service.getProfile(userId, year, refOf(person, business)) as unknown as Promise<BusinessProfileDto>
  }

  @Put(':jahr/selbststaendig')
  @HttpCode(200)
  @RequiresAccount()
  @ApiBody({ type: BusinessProfileInputDto })
  @ApiOkResponse({ type: BusinessProfileDto })
  @Errors(409)
  saveProfile(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: BusinessProfileInputDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<BusinessProfileDto> {
    return this.service.saveProfile(userId, year, refOf(person, business), {
      ...dto,
      professionAnswers: dto.professionAnswers as ProfessionAnswers | null | undefined,
      tradeTaxInputs: dto.tradeTaxInputs as TradeTaxInputs | null | undefined,
      lossFacts: dto.lossFacts as LossFacts | null | undefined,
      partnershipShares: dto.partnershipShares as PartnershipShare[] | null | undefined,
    }) as unknown as Promise<BusinessProfileDto>
  }

  @Get(':jahr/selbststaendig/buch')
  @RequiresAccount()
  @ApiOkResponse({ type: BookDto, description: 'Every entry of the year; `integrity` is checked on every read (hash chain, numbering).' })
  book(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<BookDto> {
    return this.service.getBook(userId, year, refOf(person, business)) as unknown as Promise<BookDto>
  }

  @Post(':jahr/selbststaendig/buchungen')
  @HttpCode(201)
  @RequiresAccount()
  @ApiBody({ type: BookingDraftDto })
  @ApiOkResponse({ type: JournalEntryDto, description: 'The posted entry (VAT lines added by its tax keys).' })
  @Errors(409)
  post(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: BookingDraftDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<JournalEntryDto> {
    const parsed = parseBookingDraft(JSON.stringify(dto))
    if (!parsed.ok) throw new InvalidInputError('BOOKING_DRAFT_INVALID', parsed.reason)
    return this.service.post(userId, year, refOf(person, business), parsed.draft) as unknown as Promise<JournalEntryDto>
  }

  @Post(':jahr/selbststaendig/buchungen/:nummer/storno')
  @HttpCode(201)
  @RequiresAccount()
  @ApiParam({ name: 'nummer', type: Number })
  @ApiBody({ type: ReversalDto })
  @ApiOkResponse({ type: JournalEntryDto, description: 'The Storno entry; the original stays unchanged (GoBD).' })
  @Errors(404, 409)
  reverse(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('nummer', ParseIntPipe) number: number,
    @Body() dto: ReversalDto,
    @Query('person') person?: string,
    @Query('betrieb') business?: string,
  ): Promise<JournalEntryDto> {
    return this.service.reverse(userId, year, refOf(person, business), number, dto) as unknown as Promise<JournalEntryDto>
  }

  @Post(':jahr/selbststaendig/schnellerfassung')
  @HttpCode(201)
  @RequiresAccount()
  @ApiBody({ type: QuickEntryDto })
  @ApiOkResponse({ type: [JournalEntryDto], description: 'One booking per EÜR total (ADR-0101 §6).' })
  @Errors(409)
  quickEntry(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: QuickEntryDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<JournalEntryDto[]> {
    return this.service.quickEntry(userId, year, refOf(person, business), dto.totals) as unknown as Promise<JournalEntryDto[]>
  }

  @Post(':jahr/selbststaendig/festschreibung')
  @HttpCode(200)
  @RequiresAccount()
  @ApiBody({ type: LockDto })
  @ApiOkResponse({ type: BookDto })
  @Errors(409)
  lock(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: LockDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<BookDto> {
    return this.service.lock(userId, year, refOf(person, business), dto.through) as unknown as Promise<BookDto>
  }

  @Post(':jahr/selbststaendig/bank/import')
  @HttpCode(201)
  @RequiresAccount()
  @ApiBody({ type: BankImportDto })
  @ApiOkResponse({ type: BankImportResultDto, description: 'New transactions are stored once per fingerprint; re-imports add nothing twice.' })
  importBank(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: BankImportDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<BankImportResultDto> {
    return this.service.importBank(userId, year, refOf(person, business), { format: dto.format, content: dto.content, preset: dto.preset as BankCsvPreset | undefined, mapping: dto.mapping ? toCoreMapping(dto.mapping, dto.content) : undefined })
  }

  @Get(':jahr/selbststaendig/bank')
  @RequiresAccount()
  @ApiOkResponse({ type: [BankTransactionDto], description: 'Imported transactions with a booking suggestion from the rules.' })
  bank(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<BankTransactionDto[]> {
    return this.service.listBank(userId, year, refOf(person, business)) as unknown as Promise<BankTransactionDto[]>
  }

  @Post(':jahr/selbststaendig/bank/:umsatzId/buchen')
  @HttpCode(201)
  @RequiresAccount()
  @ApiParam({ name: 'umsatzId', type: String })
  @ApiBody({ type: AcceptBankTransactionDto })
  @ApiOkResponse({ type: JournalEntryDto })
  @Errors(404, 409)
  acceptBank(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('umsatzId') id: string,
    @Body() dto: AcceptBankTransactionDto,
    @Query('person') person?: string,
    @Query('betrieb') business?: string,
  ): Promise<JournalEntryDto> {
    return this.service.acceptBank(userId, year, refOf(person, business), id, { ...dto, taxKey: dto.taxKey as BookingTaxKey | undefined }) as unknown as Promise<JournalEntryDto>
  }

  @Post(':jahr/selbststaendig/bank/:umsatzId/ignorieren')
  @HttpCode(204)
  @RequiresAccount()
  @ApiParam({ name: 'umsatzId', type: String })
  @Errors(404)
  async ignoreBank(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('umsatzId') id: string, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<void> {
    await this.service.ignoreBank(userId, year, refOf(person, business), id)
  }

  @Get(':jahr/selbststaendig/anlagen')
  @RequiresAccount()
  @ApiOkResponse({ type: AssetsResponseDto, description: 'The asset register of the year with the core’s depreciation; a row `id` is the asset id `…/anlagen/{anlageId}/abgang` takes.' })
  assets(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<AssetsResponseDto> {
    return this.service.assets(userId, year, refOf(person, business)) as unknown as Promise<AssetsResponseDto>
  }

  @Post(':jahr/selbststaendig/anlagen')
  @HttpCode(201)
  @RequiresAccount()
  @ApiBody({ type: FixedAssetInputDto })
  @ApiOkResponse({ type: FixedAssetDto })
  createAsset(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: FixedAssetInputDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<FixedAssetDto> {
    return this.service.createAsset(userId, year, refOf(person, business), dto) as unknown as Promise<FixedAssetDto>
  }

  @Post(':jahr/selbststaendig/anlagen/:anlageId/abgang')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'anlageId', type: String })
  @ApiBody({ type: AssetDisposalDto })
  @ApiOkResponse({ type: FixedAssetDto })
  @Errors(404)
  disposeAsset(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Param('anlageId') id: string, @Body() dto: AssetDisposalDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<FixedAssetDto> {
    return this.service.disposeAsset(userId, year, refOf(person, business), id, dto) as unknown as Promise<FixedAssetDto>
  }

  @Post(':jahr/selbststaendig/anlagen/abschreibung')
  @HttpCode(201)
  @RequiresAccount()
  @ApiOkResponse({ type: [JournalEntryDto], description: 'Books the year’s depreciation and disposals, once per asset and year.' })
  @Errors(409)
  bookDepreciation(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<JournalEntryDto[]> {
    return this.service.bookDepreciation(userId, year, refOf(person, business)) as unknown as Promise<JournalEntryDto[]>
  }

  @Get(':jahr/selbststaendig/abschluss')
  @RequiresAccount()
  @ApiOkResponse({ type: ClosingDto, description: 'EÜR totals and profit, or GuV, Bilanz, closing balances and the opening entry of the next year.' })
  closing(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<ClosingDto> {
    return this.service.closing(userId, year, refOf(person, business)) as unknown as Promise<ClosingDto>
  }

  @Post(':jahr/selbststaendig/abschluss/eroeffnung')
  @HttpCode(201)
  @RequiresAccount()
  @ApiOkResponse({ type: JournalEntryDto, description: 'The Eröffnungsbilanz entry posted into the next year’s book.' })
  @Errors(409)
  carryForward(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<JournalEntryDto> {
    return this.service.carryForward(userId, year, refOf(person, business)) as unknown as Promise<JournalEntryDto>
  }

  @Post(':jahr/selbststaendig/firmenwagen')
  @HttpCode(200)
  @RequiresAccount()
  @ApiBody({ type: CompanyCarInputDto })
  @ApiOkResponse({ type: CompanyCarResultDto, description: 'The private use of a business car (1 %-Regel or Fahrtenbuch), the commute and the VAT; nothing is booked.' })
  companyCar(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: CompanyCarInputDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<CompanyCarResultDto> {
    return this.service.companyCar(userId, year, refOf(person, business), dto) as unknown as Promise<CompanyCarResultDto>
  }

  @Post(':jahr/selbststaendig/firmenwagen/buchen')
  @RequiresAccount()
  @ApiBody({ type: CompanyCarInputDto })
  @ApiOkResponse({ type: JournalEntryDto, isArray: true, description: 'The Entnahme and the non-deductible commute, dated 31.12.' })
  @Errors(409)
  bookCompanyCar(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: CompanyCarInputDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<JournalEntryDto[]> {
    return this.service.bookCompanyCar(userId, year, refOf(person, business), dto) as unknown as Promise<JournalEntryDto[]>
  }

  @Get(':jahr/selbststaendig/sondertarife')
  @RequiresAccount()
  @ApiOkResponse({ type: SpecialTariffsDto, description: '§ 16 gain with § 34, and the § 34a Thesaurierung of the business, as the estimate takes them.' })
  async specialTariffs(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<SpecialTariffsDto> {
    const result = await this.service.specialTariffs(userId, year, refOf(person, business))
    return { disposal: result.disposal, retained: result.retained === 'nur_bilanz' ? null : result.retained, retainedOnlyBilanz: result.retained === 'nur_bilanz' } as SpecialTariffsDto
  }

  @Get(':jahr/selbststaendig/umsatzsteuer/voranmeldungen')
  @RequiresAccount()
  @ApiOkResponse({ type: VatPrepaymentsDto, description: 'The Voranmeldungen of the year with their Kennzahlen, the Sondervorauszahlung and the Zusammenfassende Meldungen; nothing is transmitted.' })
  vatPrepayments(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<VatPrepaymentsDto> {
    return this.service.vatPrepayments(userId, year, refOf(person, business)) as unknown as Promise<VatPrepaymentsDto>
  }

  @Get(':jahr/selbststaendig/umsatzsteuer')
  @RequiresAccount()
  @ApiOkResponse({ type: VatReturnDto, description: 'Umsatzsteuer-Jahreserklärung from the book and the prepayments sum.' })
  vat(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<VatReturnDto> {
    return this.service.vatReturn(userId, year, refOf(person, business)) as unknown as Promise<VatReturnDto>
  }

  @Get(':jahr/selbststaendig/gewerbesteuer')
  @RequiresAccount()
  @ApiOkResponse({ type: TradeTaxDto, description: 'Gewerbesteuer-Erklärung: status berechnet | offen (missing) | entfaellt (Freiberuf).' })
  tradeTax(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<TradeTaxDto> {
    return this.service.tradeTax(userId, year, refOf(person, business)) as unknown as Promise<TradeTaxDto>
  }

  @Get(':jahr/selbststaendig/gewerbesteuer/hebesatz')
  @RequiresAccount()
  @ApiQuery({ name: 'gemeinde', type: String, example: 'Neustadt' })
  @ApiQuery({ name: 'land', type: String, required: false, example: 'BY' })
  @ApiOkResponse({ type: HebesatzLookupDto, description: 'One municipality, or several as choices; the table year says where the value is from.' })
  hebesatz(@Param('jahr', ParseTaxYearPipe) year: number, @Query('gemeinde') name?: string, @Query('land') land?: string): HebesatzLookupDto {
    if (!name || name.trim().length < 2) throw new InvalidInputError('MUNICIPALITY_TOO_SHORT', 'Für die Gemeinde mindestens zwei Buchstaben eingeben.')
    return this.service.lookupHebesatz(year, name, land) as HebesatzLookupDto
  }

  @Get(':jahr/selbststaendig/verluste')
  @RequiresAccount()
  @ApiOkResponse({ type: LossesDto, description: '§ 10d: facts, rules of the year, Verlustvortrag used, a new loss and its Rücktrag (or the waiver).' })
  losses(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<LossesDto> {
    return this.service.losses(userId, year, refOf(person, business)) as unknown as Promise<LossesDto>
  }

  @Get(':jahr/selbststaendig/elster')
  @RequiresAccount()
  @ApiOkResponse({ type: ElsterFormListDto, description: 'The forms of the whole return that carry a value for this household and year, each copy (person, child, property) on its own.' })
  @Errors(402, 404, 409)
  elsterForms(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<ElsterFormListDto> {
    return this.elsterHelp.forms(userId, year, refOf(person, business)) as unknown as Promise<ElsterFormListDto>
  }

  @Get(':jahr/selbststaendig/elster/:formular')
  @RequiresAccount()
  @ApiParam({ name: 'formular', type: String, description: 'A business form (anlage-euer, anlage-s, anlage-g, ust-2-a, gewst-1-a, anlage-sonstiges) or a Vordruck of the return (est-1-a, anlage-n, anlage-kind, anlage-v …).' })
  @ApiQuery({ name: 'instanz', required: false, type: String, description: 'Which copy, as the listing names it (`instance.id`); the first copy by default.' })
  @ApiOkResponse({ type: ElsterHelpDto, description: 'Per line: Zeile, Kennzahl, label and the value to type into Mein ELSTER; unpublished years say so.' })
  @Errors(402, 404, 409)
  elster(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('formular') form: string,
    @Query('person') person?: string,
    @Query('betrieb') business?: string,
    @Query('instanz') instance?: string,
  ): Promise<ElsterHelpDto> {
    return this.elsterHelp.help(userId, year, refOf(person, business), form, instance === '' ? undefined : instance) as unknown as Promise<ElsterHelpDto>
  }

  @Get(':jahr/selbststaendig/export/gobd')
  @RequiresAccount()
  // The 200 is a zip; the errors stay JSON (no ApiProduces, which would type them as zip too).
  @ApiOkResponse({ description: 'Z3 data export (§ 147 Abs. 6 AO): index.xml, buchungen.csv, konten.csv, protokoll.csv.', content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } } })
  @Errors(402, 409)
  async gobd(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Res({ passthrough: true }) reply: FastifyReply, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<Buffer> {
    const zip = await this.service.gobdExport(userId, year, refOf(person, business))
    reply.header('Content-Disposition', `attachment; filename="datenueberlassung-${year}.zip"`)
    reply.type('application/zip')
    return zip
  }

  @Get(':jahr/selbststaendig/verfahrensdokumentation')
  @RequiresAccount()
  @ApiOkResponse({ type: ProcedureDocDto })
  procedureDoc(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<ProcedureDocDto> {
    return this.service.procedureDoc(userId, year, refOf(person, business)) as unknown as Promise<ProcedureDocDto>
  }

  @Put(':jahr/selbststaendig/verfahrensdokumentation')
  @HttpCode(200)
  @RequiresAccount()
  @ApiBody({ type: ProcedureDocInputDto })
  @ApiOkResponse({ type: ProcedureDocDto })
  saveProcedureDoc(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Body() dto: ProcedureDocInputDto, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<ProcedureDocDto> {
    return this.service.saveProcedureDoc(userId, year, refOf(person, business), dto.values as Partial<Record<VerfahrensdokuPlaceholder, string>>) as unknown as Promise<ProcedureDocDto>
  }

  @Get(':jahr/selbststaendig/e-bilanz')
  @RequiresAccount()
  @ApiOkResponse({ type: EBilanzDto, description: 'Preview of the XBRL data set; not transmitted (ADR-0101 §17).' })
  @Errors(409)
  eBilanz(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<EBilanzDto> {
    return this.service.eBilanz(userId, year, refOf(person, business), false)
  }

  @Get(':jahr/selbststaendig/e-bilanz/datei')
  @RequiresAccount()
  @ApiOkResponse({ description: 'The XBRL instance as a file (not transmitted).', content: { 'application/xml': { schema: { type: 'string' } } } })
  @Errors(402, 409)
  async eBilanzFile(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number, @Res({ passthrough: true }) reply: FastifyReply, @Query('person') person?: string, @Query('betrieb') business?: string): Promise<string> {
    const { xbrl } = await this.service.eBilanz(userId, year, refOf(person, business), true)
    reply.header('Content-Disposition', `attachment; filename="e-bilanz-${year}.xbrl"`)
    reply.type('application/xml')
    return xbrl
  }

  @Post(':jahr/selbststaendig/checkout')
  @HttpCode(201)
  @RequiresAccount()
  @ApiOkResponse({ type: BusinessCheckoutResponseDto, description: 'Stripe Checkout at the self-employment price (STRIPE_PRICE_ID_SELBSTSTAENDIG).' })
  @Errors(503)
  checkout(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<BusinessCheckoutResponseDto> {
    return this.unlock.startCheckout(userId, year)
  }
}
