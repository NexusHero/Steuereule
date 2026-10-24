// Contract-pinned MSW server for tests only (ADR-0001/0003): routes and payload shapes come
// straight from @steuereule/api-client's orval-generated mock handlers, so a test can never
// drift from the real Profile OpenAPI contract. Default GET resolves to the deterministic
// all-null profile (what a fresh guest actually gets) rather than the generated factory's
// random faker data, so tests aren't flaky; individual tests layer overrides with
// `server.use(...)` and get reset in test-setup.ts's afterEach.
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import {
  getProfileControllerGetProfileMockHandler,
  getProfileControllerPutProfileMockHandler,
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler,
  getCockpitControllerGetCockpitSummaryMockHandler,
  getDeviceControllerRequestCodeMockHandler,
  getInterviewControllerGetInterviewMockHandler,
  getLstbControllerGetLstbMockHandler,
  getBelegControllerListMockHandler,
  getChLohnausweisControllerGetMockHandler,
  getChLohnausweisControllerSetFeldMockHandler,
  getChLohnausweisControllerSetWechselkursMockHandler,
  getRenteControllerGetMockHandler,
} from '@steuereule/api-client/msw'
import { LOHNAUSWEIS_FELDER } from '@steuereule/core'
import type { ProfileResponseDto, AuthCapabilitiesDto, DeviceCodeResponseDto, InterviewStateDto, LstbResponseDto, ChLohnausweisResponseDto, RenteResponseDto } from '@steuereule/api-client'

export const EMPTY_PROFILE_RESPONSE: ProfileResponseDto = {
  firstName: null,
  lastName: null,
  steuerId: null,
  steuernummer: null,
}

/**
 * Default capability answer (REQ-008): a deployment with Google configured, which is what
 * the auth screens are normally exercised against. A test that wants the unconfigured
 * deployment overrides with `CAPABILITIES_WITHOUT_SOCIAL` via `server.use(...)`. Pinned
 * explicitly rather than left to the generated faker factory, which would return random
 * provider names and make the gating tests meaningless.
 */
export const CAPABILITIES_WITH_GOOGLE: AuthCapabilitiesDto = { socialProviders: ['google'] }
export const CAPABILITIES_WITHOUT_SOCIAL: AuthCapabilitiesDto = { socialProviders: [] }

/**
 * Default `POST /v1/device/code` answer (#238) — pinned, not the generated factory's random
 * faker data, same reasoning as the capability answer above: a QR/`user_code` assertion against
 * a random string is no assertion at all. LoginScreen's own suite renders at jsdom's default
 * window width (1024px, breakpoint `m`), so the QR column mounts and requests a code in every
 * test that renders Login unless overridden — this is what keeps that request from becoming an
 * unhandled-request error in every one of them.
 */
export const DEVICE_CODE_RESPONSE: DeviceCodeResponseDto = {
  userCode: 'K7QX-9F2M',
  deviceCode: 'test-device-code',
  // `/device` — the app's own router route (#238 AC-1), matching `verificationUri`'s real,
  // fixed value (`${WEB_APP_URL}/device`, apps/api/src/auth/better-auth.ts). Was `/geraet`
  // here before Robin's fix landed the actual path; kept in sync now that it's settled.
  verificationUriComplete: 'http://localhost:8081/device?user_code=K7QX-9F2M',
  expiresIn: 120,
  interval: 5,
}

/**
 * Default `GET .../interview` answer (REQ-015/#318 task 2): a brand-new tax year with nothing
 * answered yet, matching the real API's honest re-entry shape — pinned, not the generated
 * factory's random faker data, same reasoning as `CAPABILITIES_WITH_GOOGLE` above. Tests that
 * need mid-flow re-entry or a load error override with `server.use(...)`.
 */
export const EMPTY_INTERVIEW_STATE: InterviewStateDto = { answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 }

/**
 * Default `GET .../lstb` answer (REQ-016, ticket 08): a brand-new tax year with every field
 * `offen`, matching the real API's honest empty-mask shape — pinned, not the generated
 * factory's random faker data, same reasoning as `EMPTY_INTERVIEW_STATE` above. Tests that
 * need mid-mask re-entry or a widerspruch override with `server.use(...)`.
 */
export const EMPTY_LSTB_RESPONSE: LstbResponseDto = {
  bruttoarbeitslohn: { kind: 'offen' },
  lohnsteuer: { kind: 'offen' },
  sozialversicherung: { kind: 'offen' },
  zustand: { kind: 'unvollstaendig', offen: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'], unklar: [] },
}

/**
 * Default `GET .../ch-lohnausweis` answer (REQ-021, ticket 16): a brand-new tax year with every
 * CHF field `offen`, no Wechselkurs and no derived status/fold — matching the real API's honest
 * empty-mask shape, pinned (not the generated faker) for the same reason as `EMPTY_LSTB_RESPONSE`.
 */
export const EMPTY_CH_LOHNAUSWEIS_RESPONSE: ChLohnausweisResponseDto = {
  felder: LOHNAUSWEIS_FELDER.filter((f) => f.art === 'chf-betrag').map((f) => ({ id: f.id, ziffer: f.ziffer, kind: 'offen' as const })),
  bemerkungen: null,
  wechselkurs: null,
  status: null,
  posten: [],
  stand: null,
}

/**
 * Default `GET .../rente` answer (REQ-022, ticket 10.4): a brand-new tax year with no Rentenart
 * chosen, every field `offen`, no taxable posten and an `offen` fold — matching the real API's
 * honest empty-mask shape, pinned (not the generated faker) for the same reason as
 * `EMPTY_LSTB_RESPONSE`.
 */
export const EMPTY_RENTE_RESPONSE: RenteResponseDto = {
  art: null,
  jahresbetrag: { kind: 'offen' },
  rentenbeginnJahr: { kind: 'offen' },
  alterBeiRentenbeginn: { kind: 'offen' },
  posten: [],
  stand: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, offenePosten: 1, konflikte: 0, gegated: [] },
}

export const server = setupServer(
  getProfileControllerGetProfileMockHandler(EMPTY_PROFILE_RESPONSE),
  getProfileControllerPutProfileMockHandler(),
  getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITH_GOOGLE),
  getInterviewControllerGetInterviewMockHandler(EMPTY_INTERVIEW_STATE),
  // REQ-016 (ticket 08) — the LStB guided mask: empty `offen` mask by default, same "fresh
  // tax year" honesty as the interview default. The PUT defaults to a generic 200 (the
  // response body is never asserted by a test that doesn't override it); tests proving the
  // widerspruch/unreadable states override with `server.use(...)`.
  getLstbControllerGetLstbMockHandler(EMPTY_LSTB_RESPONSE),
  http.put('*/v1/steuerjahre/:jahr/lstb/:feld', () =>
    HttpResponse.json(EMPTY_LSTB_RESPONSE, { status: 200 }),
  ),
  // REQ-021 (ticket 16) — the CH-Lohnausweis guided mask + fold: empty `offen` mask by default,
  // same "fresh tax year" honesty as the interview/LStB defaults.
  getChLohnausweisControllerGetMockHandler(EMPTY_CH_LOHNAUSWEIS_RESPONSE),
  getChLohnausweisControllerSetFeldMockHandler(),
  getChLohnausweisControllerSetWechselkursMockHandler(),
  // REQ-022 (ticket 10.4) — the Rentner guided mask: empty `offen` mask by default, same
  // "fresh tax year" honesty as the LStB/CH defaults. The PUTs default to a generic 200 (the
  // response body is never asserted by a test that doesn't override it).
  getRenteControllerGetMockHandler(EMPTY_RENTE_RESPONSE),
  http.put('*/v1/steuerjahre/:jahr/rente/art', () => HttpResponse.json(EMPTY_RENTE_RESPONSE, { status: 200 })),
  http.put('*/v1/steuerjahre/:jahr/rente/:feld', () => HttpResponse.json(EMPTY_RENTE_RESPONSE, { status: 200 })),
  // Default `POST .../interview/antworten` answer: a generic 200 — InterviewScreen renders the
  // next step from the local graph, not from this response body (#318 task 2's own "the graph
  // stays local" brief), so the exact `nextStep`/`openItems` values here are never asserted on
  // by a test that doesn't override this handler. Tests proving the 400/409/network paths, or
  // the exact request body sent, override with `server.use(...)`.
  http.post('*/v1/steuerjahre/:jahr/interview/antworten', () =>
    HttpResponse.json({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 }, { status: 200 }),
  ),
  // Cockpit's honest empty state ("noch keine Angaben") — a fresh guest genuinely has no
  // tax year yet, so this is what the real API returns. Present by default so shell-level
  // tests that merely pass through Cockpit don't each have to stub it; CockpitScreen's own
  // suite overrides it with real figures where the numbers are the point.
  getCockpitControllerGetCockpitSummaryMockHandler(null),
  // Ticket 10 (Slice 1) — the Beleg-Posteingang: a fresh guest genuinely has no Belege yet,
  // so the default inbox is the honest empty list. Present by default so shell-level tests
  // that pass through the Belege tab don't each have to stub it; BelegeScreen's own suite
  // overrides it with real Belege where the Zuordnung states are the point.
  getBelegControllerListMockHandler([]),
  getDeviceControllerRequestCodeMockHandler(DEVICE_CODE_RESPONSE),
  // Task 6's polling default — "still pending" (RFC 8628 `authorization_pending`, HTTP 400,
  // the exact shape `translateDeviceApiError` relays), not the generated mock's 200 `AckResponseDto`:
  // that would auto-approve every test that renders the QR column and happens to run its polling
  // timer, silently faking the very phone-approval step the poll exists to wait for. Tests that
  // need "approved"/"denied"/"expired"/an error override with `server.use(...)`.
  http.post('*/v1/device/token', () => HttpResponse.json({ error: 'authorization_pending' }, { status: 400 })),
  // better-auth's own session read — not orval-generated (better-auth owns this contract,
  // ADR-0012 §1), so it's not in @steuereule/api-client. Defaults to "no session" (`null`),
  // which is also the fail-closed default any screen deriving "verified"/"signed in" from
  // this read must land on absent a positive answer (#194, RegistrierungScreen). Tests that
  // need a real session (or a session-fetch error) override with `server.use(...)`.
  http.get('*/api/auth/get-session', () => HttpResponse.json(null)),
  // #238 — the device list's own `listSessions()` read. Defaults to an empty list, the
  // simplest answer that keeps every existing ProfilScreen-rendering test undisturbed by a
  // section it isn't testing; DeviceListSection's own suite overrides with real session rows
  // (and with an error response, for its own honest-failure test) via `server.use(...)`.
  http.get('*/api/auth/list-sessions', () => HttpResponse.json([])),
  // REQ-007 passkey half (ticket 14) — the security screen's `list-user-passkeys` read. Defaults
  // to an empty list (a fresh account genuinely has no passkeys) so every SicherheitScreen test
  // stays undisturbed by the passkey section; the passkey suite overrides with real rows (and
  // with the delete route) via `server.use(...)`.
  http.get('*/api/auth/passkey/list-user-passkeys', () => HttpResponse.json([])),
)
