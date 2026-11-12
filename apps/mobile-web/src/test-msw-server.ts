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
  getReceiptControllerListMockHandler,
  getChSalaryCertificateControllerGetMockHandler,
  getChSalaryCertificateControllerSetFieldMockHandler,
  getChSalaryCertificateControllerSetExchangeRateMockHandler,
  getPensionControllerGetMockHandler,
  getCapitalControllerGetMockHandler,
  getCapitalControllerGetMostFavourableCheckMockHandler,
  getRentalControllerGetMockHandler,
  getDeadlinesControllerGetDeadlinesMockHandler,
  getTakeoverControllerGetMockHandler,
  getConfirmationControllerGetMockHandler,
  getChildrenControllerListMockHandler,
  getLinkControllerGetMockHandler,
  getOwlModeControllerGetSettingMockHandler,
  getOwlModeControllerGetCardsMockHandler,
  getAdvisorControllerConnectionMockHandler,
  getAdvisorControllerGetSessionMockHandler,
  getAssistantsControllerListConnectedMockHandler,
} from '@steuereule/api-client/msw'
import { SALARY_CERTIFICATE_FIELDS } from '@steuereule/core'
import type { ProfileResponseDto, AuthCapabilitiesDto, DeviceCodeResponseDto, InterviewStateDto, LstbResponseDto, ChSalaryCertificateResponseDto, PensionResponseDto, KapitalResponseDto, RentalResponseDto, DeadlinesResponseDto, RolloverResponseDto, ConfirmationResponseDto, ChildrenResponseDto, LinkResponseDto, OwlSettingResponseDto, OwlCardsResponseDto, CommuteResponseDto } from '@steuereule/api-client'

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
  state: { kind: 'unvollstaendig', open: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'], unclear: [] },
}

/**
 * Default `GET .../ch-lohnausweis` answer (REQ-021, ticket 16): a brand-new tax year with every
 * CHF field `offen`, no Wechselkurs and no derived status/fold — matching the real API's honest
 * empty-mask shape, pinned (not the generated faker) for the same reason as `EMPTY_LSTB_RESPONSE`.
 */
export const EMPTY_CH_SALARY_CERTIFICATE_RESPONSE: ChSalaryCertificateResponseDto = {
  fields: SALARY_CERTIFICATE_FIELDS.filter((f) => f.kind === 'chf-betrag').map((f) => ({ id: f.id, digit: f.digit, kind: 'offen' as const })),
  bemerkungen: null,
  exchangeRate: null,
  status: null,
  items: [],
  foldStatus: null,
  nGre: {
    arbeitgeberName: null,
    arbeitgeberStrasse: null,
    arbeitgeberPlzOrt: null,
    familienzulagenChf: null,
    krankentaggeldChf: null,
    pkArbeitnehmerChf: null,
    pkArbeitgeberChf: null,
    krankentaggeldArbeitgeberProzent: null,
    krankentaggeldArbeitgeberChf: null,
    nbuvArbeitgeberProzent: null,
    nbuvArbeitgeberChf: null,
    specialCases: null,
  }
}

/**
 * Default `GET .../rente` answer (REQ-022, ticket 10.4): a brand-new tax year with no Rentenart
 * chosen, every field `offen`, no taxable posten and an `offen` fold — matching the real API's
 * honest empty-mask shape, pinned (not the generated faker) for the same reason as
 * `EMPTY_LSTB_RESPONSE`.
 */
export const EMPTY_PENSION_RESPONSE: PensionResponseDto = {
  kind: null,
  jahresbetrag: { kind: 'offen' },
  rentenbeginnJahr: { kind: 'offen' },
  alterBeiRentenbeginn: { kind: 'offen' },
  items: [],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 1, conflicts: 0, gated: [] },
}

/**
 * Default `GET .../kapital` answer (REQ-025, ticket 10.5): a brand-new tax year with the field
 * `offen`, no depot answer (`unbekannt`), no posten and an `offen` fold — matching the real
 * API's honest empty-mask shape, pinned (not the generated faker) for the same reason as
 * `EMPTY_RENTE_RESPONSE`. The Günstigerprüfung defaults to `null` (no tax year seeded — the
 * honest empty state).
 */
export const EMPTY_CAPITAL_RESPONSE: KapitalResponseDto = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
  requiredFields: ['kapitalertraege'],
  depot: { kind: 'unbekannt' },
  items: [],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 1, conflicts: 0, gated: [] },
  inhaber: null,
}

/**
 * Default `GET .../vermietung` answer (REQ-026, ticket 10.6): a brand-new tax year with no
 * objects, einordnung unbekannt and an empty fold — matching the real API's honest empty-mask
 * shape, pinned (not the generated faker) for the same reason as `EMPTY_RENTE_RESPONSE`.
 */
export const EMPTY_RENTAL_RESPONSE: RentalResponseDto = {
  classification: { kind: 'unbekannt' },
  properties: [],
  status: { kind: 'bestimmt', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, werbungskosten: 0, depreciation: 0, openItems: 0, conflicts: 0 },
}

/**
 * Default `GET .../fristen` answer (REQ-027, ticket 10.7): `keine` — the honest no-banner state
 * (the account is far from the frist), pinned not faked for the same reason as the other
 * EMPTY_* responses.
 */
export const EMPTY_DEADLINES_RESPONSE: DeadlinesResponseDto = {
  filingDeadline: '2027-08-02',
  today: '2026-10-25',
  level: 'keine',
  remainingDays: 279,
  lateFilingSurcharge: { minimumRateEur: 25, percentPerMonth: 0.25 },
}

/**
 * Default `GET .../uebernahme` answer (ticket 10.8, ADR-021): keine Kennzeichnungen — der
 * ruhige Übernahme-Hinweis erscheint nur, wenn welche da sind, gepinnt (nicht der generierte
 * Faker) aus demselben Grund wie die anderen EMPTY_*-Antworten.
 */
export const EMPTY_TAKEOVER_RESPONSE: RolloverResponseDto = {
  markings: [],
}

/** Default `GET .../bestaetigung` answer (REQ-032): nothing to confirm — no hint, nothing blocked. */
export const EMPTY_CONFIRMATION_RESPONSE: ConfirmationResponseDto = { annexes: [] }

export const EMPTY_KINDER_RESPONSE: ChildrenResponseDto = {
  kinder: [],
  count: 0,
  childBenefitSum: 0,
  totalAllowance: 0,
  swissFamilyAllowanceSum: 0,
  differentialChildBenefitSum: 0,
}

export const EMPTY_LINK_RESPONSE: LinkResponseDto = {
  filingType: 'keine',
  personBUserId: null,
  invitationCode: null,
  personB: null,
}

export const EMPTY_OWL_SETTING_RESPONSE: OwlSettingResponseDto = {
  enabled: false,
  enabledAt: null,
}

export const EMPTY_OWL_CARDS_RESPONSE: OwlCardsResponseDto = {
  enabled: false,
  cards: [],
  legalStatus: '01.01.2025',
}

export const EMPTY_COMMUTE_RESPONSE: CommuteResponseDto = { inputs: null, workdays: null, commuterAllowance: null }

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
  http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [] }, { status: 200 })),
  http.get('*/v1/steuerjahre/:jahr/arbeitsweg', () => HttpResponse.json(EMPTY_COMMUTE_RESPONSE, { status: 200 })),
  http.put('*/v1/steuerjahre/:jahr/lstb/:feld', () =>
    HttpResponse.json(EMPTY_LSTB_RESPONSE, { status: 200 }),
  ),
  // #450 Teil 6F — the optional church tax lines (Zeilen 6 und 7): nothing entered by default.
  http.get('*/v1/steuerjahre/:jahr/lstb-kirchensteuer', () =>
    HttpResponse.json({ kirchensteuer: null, kirchensteuerEhegatte: null }, { status: 200 }),
  ),
  http.put('*/v1/steuerjahre/:jahr/lstb-kirchensteuer', async ({ request }) => HttpResponse.json(await request.json(), { status: 200 })),
  // REQ-021 (ticket 16) — the CH-Lohnausweis guided mask + fold: empty `offen` mask by default,
  // same "fresh tax year" honesty as the interview/LStB defaults.
  getChSalaryCertificateControllerGetMockHandler(EMPTY_CH_SALARY_CERTIFICATE_RESPONSE),
  getChSalaryCertificateControllerSetFieldMockHandler(),
  getChSalaryCertificateControllerSetExchangeRateMockHandler(),
  // REQ-022 (ticket 10.4) — the Rentner guided mask: empty `offen` mask by default, same
  // "fresh tax year" honesty as the LStB/CH defaults. The PUTs default to a generic 200 (the
  // response body is never asserted by a test that doesn't override it).
  getPensionControllerGetMockHandler(EMPTY_PENSION_RESPONSE),
  http.put('*/v1/steuerjahre/:jahr/rente/art', () => HttpResponse.json(EMPTY_PENSION_RESPONSE, { status: 200 })),
  http.put('*/v1/steuerjahre/:jahr/rente/:feld', () => HttpResponse.json(EMPTY_PENSION_RESPONSE, { status: 200 })),
  // REQ-025 (ticket 10.5) — the Kapital guided mask + Günstigerprüfung: empty `offen` mask and
  // a null comparison by default, same "fresh tax year" honesty as the Rente defaults.
  getCapitalControllerGetMockHandler(EMPTY_CAPITAL_RESPONSE),
  http.put('*/v1/steuerjahre/:jahr/kapital/:feld', () => HttpResponse.json(EMPTY_CAPITAL_RESPONSE, { status: 200 })),
  getCapitalControllerGetMostFavourableCheckMockHandler(null),
  // REQ-026 (ticket 10.6) — the Vermietung guided mask: empty object list by default, same
  // "fresh tax year" honesty as the Rente defaults. The POST/PUTs default to a generic 200
  // (the response body is never asserted by a test that doesn't override it).
  getRentalControllerGetMockHandler(EMPTY_RENTAL_RESPONSE),
  http.post('*/v1/steuerjahre/:jahr/vermietung/objekte', () => HttpResponse.json(EMPTY_RENTAL_RESPONSE, { status: 201 })),
  http.put('*/v1/steuerjahre/:jahr/vermietung/objekte/:objektId/adresse', () => HttpResponse.json(EMPTY_RENTAL_RESPONSE, { status: 200 })),
  http.put('*/v1/steuerjahre/:jahr/vermietung/objekte/:objektId/:feld', () => HttpResponse.json(EMPTY_RENTAL_RESPONSE, { status: 200 })),
  getChildrenControllerListMockHandler(EMPTY_KINDER_RESPONSE),
  getLinkControllerGetMockHandler(EMPTY_LINK_RESPONSE),
  http.put('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(EMPTY_LINK_RESPONSE, { status: 200 })),
  http.put('*/v1/steuerjahre/:jahr/kopplung/person-b', () => HttpResponse.json(EMPTY_LINK_RESPONSE, { status: 200 })),
  getOwlModeControllerGetSettingMockHandler(EMPTY_OWL_SETTING_RESPONSE),
  getOwlModeControllerGetCardsMockHandler(EMPTY_OWL_CARDS_RESPONSE),
  getAdvisorControllerConnectionMockHandler({ state: 'connected', provider: 'Gemini', model: 'gemini-test', checkedAt: '2026-01-01T00:00:00.000Z' }),
  getAdvisorControllerGetSessionMockHandler({
    enabled: false,
    greeting: 'Hallo! Ich bin deine SteuerEule.',
    openCards: [],
    conversationId: 'conversation-1',
    conversations: [{ id: 'conversation-1', title: null, createdAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2026-01-01T00:00:00.000Z' }],
    context: { usedTokens: 0, maxTokens: 6000, percent: 0, level: 'ok', canSummarize: false },
    notes: [],
    situation: { text: '', updatedAt: null },
    messages: [],
    quickChips: ['Kanzlei-Endprüfung starten', 'Homeoffice vs. Arbeitszimmer prüfen'],
    legalSources: [],
  }),
  // REQ-027 (ticket 10.7) — der Fristen-Warnmodus: `keine` by default (the honest no-banner
  // state, ADR-0039 — a fresh account far from the frist shows nothing), pinned not faked;
  // banner tests override with `server.use(...)`.
  getDeadlinesControllerGetDeadlinesMockHandler(EMPTY_DEADLINES_RESPONSE),
  // Ticket 10.8 (ADR-021) — die Jahresübernahme: leer by default (keine Kennzeichnungen — der
  // ruhige Hinweis erscheint nur, wenn welche da sind); das Bestätigen defaultet auf ein
  // generisches 200 (Tests, die den Fluss prüfen, überschreiben mit `server.use(...)`).
  getTakeoverControllerGetMockHandler(EMPTY_TAKEOVER_RESPONSE),
  getConfirmationControllerGetMockHandler(EMPTY_CONFIRMATION_RESPONSE),
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
  getReceiptControllerListMockHandler([]),
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
  // ADR-0052 §10 — connected assistants read defaults to an empty list.
  getAssistantsControllerListConnectedMockHandler([]),
  // #451 slice 3 — the Arbeitstage mask reads the address for the holiday region; a fresh
  // account has none, so the default is the honest empty answer, not random faker data.
  http.get('*/v1/stammdaten', () =>
    HttpResponse.json({
      geburtsdatum: null, strasse: null, hausnummer: null, hausnummerZusatz: null, plz: null, wohnort: null, beruf: null,
      religion: null, familienstand: null, familienstandSeit: null, iban: null, kontoinhaber: null, finanzamt: null, telefon: null,
      missing: [],
    }),
  ),
)
