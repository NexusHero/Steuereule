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
