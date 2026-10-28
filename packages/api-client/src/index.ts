// @steuereule/api-client — the typed OpenAPI client + TanStack Query hooks for the
// Profile, Auth-capability, Cockpit and Device-authorization APIs (ADR-0001). Generated from
// apps/api/openapi.json via orval; never hand-write a hook or type here — regenerate instead
// (see orval.config.ts). MSW handlers/faker factories are intentionally NOT re-exported from
// this entry — import them from the `@steuereule/api-client/msw` subpath in tests only, so
// production code never pulls in msw/faker.
export * from './generated/profile'
export * from './generated/profile.schemas'
export * from './generated/auth'
export * from './generated/auth.schemas'
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
// kapital.schemas is re-exported explicitly rather than `export *`: orval emits its own copy of
// `UnschaerfeDto`/`UnschaerfeDtoKind`/`UnschaerfeDtoGrund` here (the Günstigerprüfung DTO reuses
// the Veranlagungsartenvergleich's margin type), which would collide with the identical names
// already re-exported above. Those three are the SAME ADR-0034 margin — consumers get them from
// `veranlagungsartenvergleich.schemas`; everything else is named here.
export type {
  KapitalFeldDto,
  DepotEinordnungDto,
  KapitalPostenDto,
  KapitalStandDto,
  KapitalResponseDto,
  PutKapitalFeldDto,
  GuenstigerpruefungDto,
  GuenstigerpruefungHerkunftDto,
  KapitalControllerGetGuenstigerpruefungParams,
} from './generated/kapital.schemas'
export * from './generated/bescheid'
export * from './generated/bescheid.schemas'
export * from './generated/vermietung'
export * from './generated/vermietung.schemas'
export * from './generated/fristen'
export * from './generated/fristen.schemas'
export * from './generated/uebernahme'
export * from './generated/uebernahme.schemas'
export * from './generated/freischaltung'
export * from './generated/freischaltung.schemas'
export * from './generated/stammdaten'
export * from './generated/stammdaten.schemas'
export * from './generated/ausdruck'
export * from './generated/ausdruck.schemas'
export { configureApiClient, resetApiClientConfig, getApiClientBaseUrl, type ApiClientConfig } from './http-client'
