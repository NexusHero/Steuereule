export * from './generated/profile'
export * from './generated/profile.schemas'
export * from './generated/auth'
export * from './generated/auth.schemas'
export * from './generated/capabilities'
export * from './generated/capabilities.schemas'
export * from './generated/cockpit'
export * from './generated/cockpit.schemas'
export * from './generated/account'
export * from './generated/account.schemas'
export * from './generated/device'
export * from './generated/device.schemas'
export * from './generated/interview'
export * from './generated/interview.schemas'
export * from './generated/lstb'
export * from './generated/lstb.schemas'
export * from './generated/belege'
export * from './generated/belege.schemas'
export * from './generated/ch-lohnausweis'
export * from './generated/ch-lohnausweis.schemas'
export * from './generated/rente'
export * from './generated/rente.schemas'
export * from './generated/veranlagungsartenvergleich'
export * from './generated/veranlagungsartenvergleich.schemas'
export * from './generated/kapital'
export type {
  CapitalFieldDto as KapitalFeldDto,
  DepotClassificationDto as DepotEinordnungDto,
  CapitalItemDto as KapitalPostenDto,
  CapitalStatusDto as KapitalStandDto,
  CapitalResponseDto as KapitalResponseDto,
  PutCapitalFieldDto as PutKapitalFeldDto,
  MostFavourableCheckDto as GuenstigerpruefungDto,
  MostFavourableCheckSourceDto as GuenstigerpruefungHerkunftDto,
  CapitalControllerGetMostFavourableCheckParams,
} from './generated/kapital.schemas'
export * from './generated/steuerschaetzung'
export * from './generated/steuerschaetzung.schemas'
export * from './generated/arbeitsweg'
export * from './generated/arbeitsweg.schemas'
export * from './generated/bescheid'
export * from './generated/bescheid.schemas'
export * from './generated/vermietung'
export * from './generated/vermietung.schemas'
export * from './generated/selbststaendig'
export * from './generated/selbststaendig.schemas'
export * from './generated/fristen'
export * from './generated/fristen.schemas'
export * from './generated/uebernahme'
export * from './generated/uebernahme.schemas'
export * from './generated/bestaetigung'
export * from './generated/bestaetigung.schemas'
export * from './generated/freischaltung'
export * from './generated/freischaltung.schemas'
export * from './generated/adressen'
export * from './generated/adressen.schemas'
export * from './generated/stammdaten'
export * from './generated/stammdaten.schemas'
export * from './generated/ausdruck'
export * from './generated/ausdruck.schemas'
export * from './generated/kinder'
export * from './generated/kinder.schemas'
export * from './generated/kopplung'
export * from './generated/kopplung.schemas'
export * from './generated/eulen-modus'
export * from './generated/eulen-modus.schemas'
export * from './generated/assistenten'
export * from './generated/assistenten.schemas'
export * from './generated/abgabe'
export * from './generated/abgabe.schemas'
export * from './generated/verlauf'
// The Abgleich shapes and RangeDto are the Bescheid's and the estimate's; only the Verlauf's own are re-exported here.
export {
  AssessmentLessonDtoPerson,
  HistoryDeltaDtoKind,
  HistoryDeltaDtoReason,
  HistoryFigureDtoSource,
  HistoryFigureDtoTier,
  LessonMaskDtoScreen,
  LessonNextYearDtoSource,
  OpenItemDtoKind,
  WorkExpenseFiguresDtoPartsSource,
  YearDiffDtoPerson,
  YearHistoryEntryDtoFilingType,
  YearHistoryEntryDtoPersonsItem,
  YearHistoryEntryDtoTier,
  YearListItemDtoFilingType,
  YearListItemDtoKind,
  YearListItemDtoNoDiffReason,
  YearListItemDtoStatus,
} from './generated/verlauf.schemas'
export type {
  AppealDeadlineDto,
  AssessmentLessonDto,
  ExchangeRateNoteDto,
  HistoryDeltaDto,
  HistoryFigureDto,
  HouseholdNetFiguresDto,
  LessonMaskDto,
  LessonNextYearDto,
  LessonRecognisedDto,
  MaskLessonsDto,
  NetFiguresDto,
  OpenItemDto,
  PositionRefDto,
  RefundFiguresDto,
  TaxRateFiguresDto,
  WorkExpenseFiguresDto,
  WorkExpensePartsDto,
  YearDiffDto,
  YearHistoryEntryDto,
  YearHistoryResponseDto,
  YearListItemDto,
  YearNetDto,
  YearWorkExpensesDto,
} from './generated/verlauf.schemas'
// ADR-0099: the Verlauf's hints, events, groups and Unterlagen.
export {
  AppealHistoryEntryDtoOutcome,
  AppealHistoryEntryDtoPerson,
  AppealHistoryEntryDtoReason,
  CapitalFavourableCheckDtoRecommendation,
  CapitalFavourableCheckDtoStatement,
  CoupleComparisonDtoFiledAs,
  CoupleComparisonDtoStatement,
  CoupleComparisonDtoStatus,
  CrossBorderYearDtoPerson,
  FiledElsewhereDtoAnswer,
  FiledElsewhereResponseDtoStatus,
  LifeEventDtoKind,
  LifeEventDtoPerson,
  LossCarryForwardDtoStatus,
  PutFiledElsewhereDtoAnswer,
  RecurringItemDtoReceipt,
  RecurringItemDtoStatus,
  RepeatedCutDtoPerson,
  YearDeadlineDtoKind,
} from './generated/verlauf.schemas'
export type {
  AcquisitionRelatedDto,
  AppealHistoryEntryDto,
  AssessmentDocumentDto,
  AssessmentWaitDto,
  CapitalFavourableCheckDto,
  CapitalGroupDto,
  CapitalYearDto,
  CoupleComparisonDto,
  CrossBorderGroupDto,
  CrossBorderYearDto,
  FiledElsewhereDto,
  FiledElsewhereResponseDto,
  HistoryGroupsDto,
  LifeEventDto,
  LossCarryForwardDto,
  PensionGroupDto,
  PensionYearDto,
  PrepaymentSeriesDto,
  PrepaymentYearDto,
  PutFiledElsewhereDto,
  RecurringChecklistDto,
  RecurringDetailDto,
  RecurringItemDto,
  RecurringItemFieldDto,
  RentalDepreciationRateDto,
  RentalGroupDto,
  RentalGroupPropertyDto,
  RentalPropertyYearDto,
  RepeatedCutDto,
  RepeatedCutYearDto,
  SwissShareDto,
  YearDeadlineDto,
  YearDocumentsDto,
} from './generated/verlauf.schemas'
export { configureApiClient, resetApiClientConfig, getApiClientBaseUrl, type ApiClientConfig } from './http-client'
export {
  getReceiptFileUrl,
  uploadReceiptFile,
  fetchReceiptFileBlob,
  type UploadReceiptFileInput,
  type UploadReceiptFileResult,
  type FetchReceiptFileResult,
} from './receipt-files'
export * from './generated/haushalt'
export * from './generated/haushalt.schemas'
