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
  getLstbControllerSetFeldResponseMock,
  getLstbControllerSetFeldMockHandler,
  getSteuerEuleAPIMock as getLstbApiMock,
} from './generated/lstb.msw'
export {
  getBelegControllerListMockHandler,
  getBelegControllerSetZuordnungMockHandler,
  getSteuerEuleAPIMock as getBelegApiMock,
} from './generated/belege.msw'
export {
  getChLohnausweisControllerGetResponseMock,
  getChLohnausweisControllerGetMockHandler,
  getChLohnausweisControllerSetFeldResponseMock,
  getChLohnausweisControllerSetFeldMockHandler,
  getChLohnausweisControllerSetBemerkungenResponseMock,
  getChLohnausweisControllerSetBemerkungenMockHandler,
  getChLohnausweisControllerSetVorsorgeResponseMock,
  getChLohnausweisControllerSetVorsorgeMockHandler,
  getChLohnausweisControllerSetWechselkursResponseMock,
  getChLohnausweisControllerSetWechselkursMockHandler,
  getSteuerEuleAPIMock as getChLohnausweisApiMock,
} from './generated/ch-lohnausweis.msw'
export {
  getRenteControllerGetResponseMock,
  getRenteControllerGetMockHandler,
  getRenteControllerSetRentenartResponseMock,
  getRenteControllerSetRentenartMockHandler,
  getRenteControllerSetFeldResponseMock,
  getRenteControllerSetFeldMockHandler,
  getSteuerEuleAPIMock as getRenteApiMock,
} from './generated/rente.msw'
export {
  getVeranlagungsartenvergleichControllerGetVergleichResponseMock,
  getVeranlagungsartenvergleichControllerGetVergleichMockHandler,
  getSteuerEuleAPIMock as getVeranlagungsartenvergleichApiMock,
} from './generated/veranlagungsartenvergleich.msw'
