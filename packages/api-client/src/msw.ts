// Aggregates every generated MSW handler set behind the package's `./msw` subpath
// (see package.json's "exports"). orval writes one `<tag>.msw.ts`/`<tag>.faker.ts` pair
// per project (profile, cockpit, ...); this is the one hand-written re-export so test
// code only ever needs `@steuereule/api-client/msw`, never a per-endpoint import path.
//
// Both generated files export an all-handlers aggregator named after the shared
// OpenAPI document title (`getSteuerEuleAPIMock`) rather than their own tag — an
// orval naming quirk when every project shares one `input`. Re-exporting cockpit's
// under a tag-qualified alias avoids the name collision without hand-editing either
// generated file (which orval would overwrite on the next `generate` anyway).
export * from './generated/profile.msw'
export {
  getCockpitControllerGetCockpitSummaryResponseMock,
  getCockpitControllerGetCockpitSummaryMockHandler,
  getSteuerEuleAPIMock as getCockpitApiMock,
} from './generated/cockpit.msw'
export {
  getAuthCapabilitiesControllerGetCapabilitiesResponseMock,
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler,
  getSteuerEuleAPIMock as getAuthApiMock,
} from './generated/auth.msw'
export {
  getAccountDeletionControllerDeleteAccountResponseMock,
  getAccountDeletionControllerDeleteAccountMockHandler,
  getAccountExportControllerExportAccountResponseMock,
  getAccountExportControllerExportAccountMockHandler,
  getSteuerEuleAPIMock as getAccountApiMock,
} from './generated/account.msw'
export {
  getDeviceControllerRequestCodeResponseMock,
  getDeviceControllerRequestCodeMockHandler,
  getSteuerEuleAPIMock as getDeviceApiMock,
} from './generated/device.msw'
export {
  getInterviewControllerGetInterviewResponseMock,
  getInterviewControllerGetInterviewMockHandler,
  getInterviewControllerPostAnswerResponseMock,
  getInterviewControllerPostAnswerMockHandler,
  getSteuerEuleAPIMock as getInterviewApiMock,
} from './generated/interview.msw'
export {
  getLstbControllerGetLstbResponseMock,
  getLstbControllerGetLstbMockHandler,
  getLstbControllerSetFieldResponseMock,
  getLstbControllerSetFieldMockHandler,
  getSteuerEuleAPIMock as getLstbApiMock,
} from './generated/lstb.msw'
export {
  getReceiptControllerListMockHandler,
  getReceiptControllerSetAssignmentMockHandler,
  getSteuerEuleAPIMock as getBelegApiMock,
} from './generated/belege.msw'
export {
  getChSalaryCertificateControllerGetResponseMock,
  getChSalaryCertificateControllerGetMockHandler,
  getChSalaryCertificateControllerSetFieldResponseMock,
  getChSalaryCertificateControllerSetFieldMockHandler,
  getChSalaryCertificateControllerSetRemarksResponseMock,
  getChSalaryCertificateControllerSetRemarksMockHandler,
  getChSalaryCertificateControllerSetProvisionResponseMock,
  getChSalaryCertificateControllerSetProvisionMockHandler,
  getChSalaryCertificateControllerSetExchangeRateResponseMock,
  getChSalaryCertificateControllerSetExchangeRateMockHandler,
  getSteuerEuleAPIMock as getChLohnausweisApiMock,
} from './generated/ch-lohnausweis.msw'
export {
  getPensionControllerGetResponseMock,
  getPensionControllerGetMockHandler,
  getPensionControllerSetPensionKindResponseMock,
  getPensionControllerSetPensionKindMockHandler,
  getPensionControllerSetFieldResponseMock,
  getPensionControllerSetFieldMockHandler,
  getSteuerEuleAPIMock as getRenteApiMock,
} from './generated/rente.msw'
export {
  getFilingTypeComparisonControllerGetComparisonResponseMock,
  getFilingTypeComparisonControllerGetComparisonMockHandler,
  getSteuerEuleAPIMock as getVeranlagungsartenvergleichApiMock,
} from './generated/veranlagungsartenvergleich.msw'
export {
  getCapitalControllerGetResponseMock,
  getCapitalControllerGetMockHandler,
  getCapitalControllerSetFieldResponseMock,
  getCapitalControllerSetFieldMockHandler,
  getCapitalControllerGetMostFavourableCheckResponseMock,
  getCapitalControllerGetMostFavourableCheckMockHandler,
  getSteuerEuleAPIMock as getKapitalApiMock,
} from './generated/kapital.msw'
export {
  getRentalControllerGetResponseMock,
  getRentalControllerGetMockHandler,
  getRentalControllerCreateResponseMock,
  getRentalControllerCreateMockHandler,
  getRentalControllerSetFieldResponseMock,
  getRentalControllerSetFieldMockHandler,
  getRentalControllerSetAddressResponseMock,
  getRentalControllerSetAddressMockHandler,
  getSteuerEuleAPIMock as getVermietungApiMock,
} from './generated/vermietung.msw'
export {
  getDeadlinesControllerGetDeadlinesResponseMock,
  getDeadlinesControllerGetDeadlinesMockHandler,
  getSteuerEuleAPIMock as getFristenApiMock,
} from './generated/fristen.msw'
export {
  getTakeoverControllerGetResponseMock,
  getTakeoverControllerGetMockHandler,
  getTakeoverControllerTakeOverResponseMock,
  getTakeoverControllerTakeOverMockHandler,
  getSteuerEuleAPIMock as getUebernahmeApiMock,
} from './generated/uebernahme.msw'
export {
  getConfirmationControllerGetResponseMock,
  getConfirmationControllerGetMockHandler,
  getConfirmationControllerConfirmAnnexResponseMock,
  getConfirmationControllerConfirmAnnexMockHandler,
  getConfirmationControllerDecideProposalResponseMock,
  getConfirmationControllerDecideProposalMockHandler,
  getSteuerEuleAPIMock as getBestaetigungApiMock,
} from './generated/bestaetigung.msw'
export {
  getChildrenControllerListResponseMock,
  getChildrenControllerListMockHandler,
  getChildrenControllerCreateResponseMock,
  getChildrenControllerCreateMockHandler,
  getChildrenControllerUpdateResponseMock,
  getChildrenControllerUpdateMockHandler,
  getChildrenControllerDeleteResponseMock,
  getChildrenControllerDeleteMockHandler,
  getSteuerEuleAPIMock as getKinderApiMock,
} from './generated/kinder.msw'
export {
  getLinkControllerGetResponseMock,
  getLinkControllerGetMockHandler,
  getLinkControllerSetResponseMock,
  getLinkControllerSetMockHandler,
  getLinkControllerUpdatePersonBResponseMock,
  getLinkControllerUpdatePersonBMockHandler,
  getLinkControllerJoinWithCodeResponseMock,
  getLinkControllerJoinWithCodeMockHandler,
  getSteuerEuleAPIMock as getKopplungApiMock,
} from './generated/kopplung.msw'
export {
  getOwlModeControllerGetSettingResponseMock,
  getOwlModeControllerGetSettingMockHandler,
  getOwlModeControllerSetSettingResponseMock,
  getOwlModeControllerSetSettingMockHandler,
  getOwlModeControllerGetCardsResponseMock,
  getOwlModeControllerGetCardsMockHandler,
  getOwlModeControllerDismissCardMockHandler,
  getAdvisorControllerGetSessionResponseMock,
  getAdvisorControllerGetSessionMockHandler,
  getAdvisorControllerSendMessageResponseMock,
  getAdvisorControllerSendMessageMockHandler,
  getAdvisorControllerApplyActionResponseMock,
  getAdvisorControllerApplyActionMockHandler,
  getAdvisorControllerUndoActionResponseMock,
  getAdvisorControllerUndoActionMockHandler,
  getAdvisorControllerConnectionResponseMock,
  getAdvisorControllerConnectionMockHandler,
  getSteuerEuleAPIMock as getEulenModusApiMock,
} from './generated/eulen-modus.msw'
export {
  getAssistantsControllerListConnectedResponseMock,
  getAssistantsControllerListConnectedMockHandler,
  getAssistantsControllerRevokeResponseMock,
  getAssistantsControllerRevokeMockHandler,
  getAssistantsControllerGetClientInfoResponseMock,
  getAssistantsControllerGetClientInfoMockHandler,
  getSteuerEuleAPIMock as getAssistentenApiMock,
} from './generated/assistenten.msw'
export {
  getHouseholdControllerGetResponseMock,
  getHouseholdControllerAdoptChildrenResponseMock,
  getHouseholdControllerLeaveResponseMock,
  getHouseholdControllerEndPartnerResponseMock,
  getHouseholdControllerDeleteResponseMock,
  getHouseholdControllerAnswerResponseMock,
  getHouseholdControllerGetMockHandler,
  getHouseholdControllerAdoptChildrenMockHandler,
  getHouseholdControllerLeaveMockHandler,
  getHouseholdControllerEndPartnerMockHandler,
  getHouseholdControllerDeleteMockHandler,
  getHouseholdControllerAnswerMockHandler,
  getSteuerEuleAPIMock as getHaushaltApiMock,
} from './generated/haushalt.msw'
