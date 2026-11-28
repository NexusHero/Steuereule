// The lock for the step-up rule (P6 of the beta review, API-1, API-12, H2-19; `src/auth/step-up-policy.ts`):
//
//   Every action that creates a session or credential, links an identity, grants a third party access, or exposes
//   another person's data needs a fresh session or a fresh step-up grant.
//
// Every Nest route of the running app and every endpoint of the configured better-auth instance is decided here:
// sensitive (and then it must carry the step-up, or name the mechanism that gives the same proof), or ordinary with
// the reason. A new route or endpoint fails this test until it is decided.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { PrismaClient } from '@prisma/client'
import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createBetterAuth } from '../src/auth/better-auth.js'
import { STEP_UP_ACTION_METADATA, StepUpGuard } from '../src/auth/requires-step-up.js'
import { BETTER_AUTH_NO_STEP_UP, BETTER_AUTH_SERVER_ONLY_PREFIXES, BETTER_AUTH_STEP_UP, needsStepUp, type SensitiveAction } from '../src/auth/step-up-policy.js'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'step-up-route-classification-secret'

/** Sensitive routes. Without `mechanism` they must carry `@RequiresStepUp`. */
const SENSITIVE: Readonly<Record<string, { readonly action: SensitiveAction; readonly mechanism?: string }>> = {
  'DeviceController.approve': { action: 'creates-session' },
  'DeviceController.exchangeToken': {
    action: 'creates-session',
    mechanism: 'Authenticated by an approved device code; the approval was stepped up and the minted session takes over the approver’s createdAt (API-1).',
  },
  'LinkController.joinWithCode': { action: 'exposes-other-person' },
  'LinkController.consent': { action: 'exposes-other-person' },
  'LinkController.set': {
    action: 'grants-third-party',
    mechanism: 'LinkService.set mints a new invitation code only after FreshAuthChecker.assertFreshSessionOrStepUp; choosing the Veranlagungsart alone needs none, and a caller without the check (confirmation path, interview) gets no code.',
  },
  'LinkController.withdrawConsent': { action: 'changes-consent' },
  'AccountDeletionController.deleteAccount': { action: 'ends-account', mechanism: 'FreshAuthChecker.assertFreshAuth: fresh session, step-up grant or the password in the body.' },
  'AccountExportController.exportAccount': { action: 'exports-account', mechanism: 'FreshAuthChecker.assertFreshSessionOrStepUp (ADR-0107 L1).' },
}

/** Controllers none of whose routes is sensitive under the rule, with the reason. */
const ORDINARY_CONTROLLERS: Readonly<Record<string, string>> = {
  AccountVerificationController: 'Reads whether the caller’s own address is confirmed and the deletion floor (ADR-0030).',
  AddressController: 'Street search.',
  SpeechController: 'Turns text the caller sends into audio (ADR-0115): it reads nothing of the account and changes nothing.',
  AdvisorController: 'The caller’s own conversations; the model providers get text only under the owl consent, which is not access for a third party to the account.',
  AssessmentController: 'The caller’s own Bescheid.',
  AuthCapabilitiesController: 'Static.',
  BusinessController: 'The caller’s own books. The E-Bilanz goes to the tax office as the caller’s own filing, with a verified address (API-13); no access is created.',
  CapabilitiesController: 'Static.',
  CapitalController: 'Own mask rows.',
  ChSalaryCertificateController: 'Own mask rows.',
  ChildrenController: 'The household’s children, which A and a consenting B share (ADR-0062 decision 7).',
  CockpitController: 'Reads the own year.',
  CommuteController: 'Own mask rows; Person B’s only while B has no account (A’s own record, ADR-0054).',
  ConfirmationController: 'Own markings.',
  DeadlinesController: 'Computed dates.',
  FiledElsewhereController: 'One own answer per year.',
  FilingTypeComparisonController: 'Own estimates.',
  HealthController: 'Probe.',
  HouseholdController: 'The household; permanent deletion across all years is Person A’s alone (API-3).',
  InterviewController: 'Own answers.',
  KnownEmployersController: 'Own employers.',
  LstbController: 'Own mask fields; Person B’s only while B has no account.',
  LstbScanController: 'Own scan.',
  MasterDataController: 'Own master data.',
  McpController: 'An assistant acting inside a consent that was itself stepped up (/oauth2/consent); it creates no session, credential or link.',
  OAuthDiscoveryController: 'Static metadata.',
  OwlModeController: 'Owl settings and the personal-data consent: future chat text goes to the named model providers, not to the caller, and nothing outlives the session (API-11 stays with the consent text).',
  PensionController: 'Own mask rows.',
  PrintoutController: 'Own printout.',
  ProfileController: 'Own profile.',
  ReceiptController: 'Own receipts.',
  ReceiptParseController: 'Own receipts.',
  RentalController: 'Own mask rows.',
  SubmissionController: 'The own return to the tax office, with a verified address (ADR-0103 §4); no access is created.',
  TakeoverController: 'Copies own rows of last year.',
  TaxEstimateController: 'Own estimate.',
  UnlockController: 'Stripe webhook and own unlocks.',
  YearHistoryController: 'Own years.',
}

/** Ordinary routes of controllers that also have sensitive ones. */
const ORDINARY_ROUTES: Readonly<Record<string, { readonly why: string; readonly handlers: readonly string[] }>> = {
  DeviceController: { why: 'Mints a code (no session) or shows what is pending to the claiming phone.', handlers: ['requestCode', 'getPending'] },
  LinkController: {
    why: 'Person A reads the year (B’s data only with B’s consent, API-3) or records a B without an account.',
    handlers: ['get', 'updatePersonB'],
  },
  AssistantsController: { why: 'Lists or revokes grants, or shows a client’s public name.', handlers: ['listConnected', 'revoke', 'getClientInfo'] },
}

interface Route {
  readonly key: string
  readonly controller: string
  readonly route: string
  readonly steppedUp: boolean
}

describe('the step-up rule decides every route and every better-auth endpoint', () => {
  let app: NestFastifyApplication
  const routes: Route[] = []

  beforeAll(async () => {
    app = (await buildTestApp({ sessionsByToken: {} })).app
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as unknown as { name: string; prototype: object }
        for (const handler of Object.getOwnPropertyNames(controller.prototype)) {
          const fn: unknown = Object.getOwnPropertyDescriptor(controller.prototype, handler)?.value
          if (typeof fn !== 'function') continue
          const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined
          if (method === undefined) continue
          const guards = (Reflect.getMetadata(GUARDS_METADATA, fn) as unknown[] | undefined) ?? []
          routes.push({
            key: `${controller.name}.${handler}`,
            controller: controller.name,
            route: `${RequestMethod[method]} ${String(Reflect.getMetadata(PATH_METADATA, controller))}/${String(Reflect.getMetadata(PATH_METADATA, fn))}`,
            steppedUp: guards.includes(StepUpGuard) && typeof Reflect.getMetadata(STEP_UP_ACTION_METADATA, fn) === 'string',
          })
        }
      }
    }
  })

  afterAll(async () => {
    await app.close()
  })

  const ordinary = (r: Route) => ORDINARY_CONTROLLERS[r.controller] !== undefined || (ORDINARY_ROUTES[r.controller]?.handlers.includes(r.key.split('.')[1]!) ?? false)

  it('finds the routes of the app', () => {
    expect(routes.length).toBeGreaterThan(180)
  })

  it('every route is decided: sensitive, or ordinary with a reason — never both', () => {
    expect(routes.filter((r) => SENSITIVE[r.key] === undefined && !ordinary(r)).map((r) => `${r.key} (${r.route})`)).toEqual([])
    expect(routes.filter((r) => SENSITIVE[r.key] !== undefined && ordinary(r)).map((r) => r.key)).toEqual([])
  })

  it('every sensitive route carries @RequiresStepUp or names the mechanism that gives the same proof', () => {
    expect(routes.filter((r) => SENSITIVE[r.key] !== undefined && SENSITIVE[r.key]!.mechanism === undefined && !r.steppedUp).map((r) => r.key)).toEqual([])
  })

  it('no ordinary route carries the step-up by accident (the table would then be wrong)', () => {
    expect(routes.filter((r) => ordinary(r) && r.steppedUp).map((r) => r.key)).toEqual([])
  })

  it('names no route or controller that no longer exists', () => {
    const keys = new Set(routes.map((r) => r.key))
    const controllers = new Set(routes.map((r) => r.controller))
    expect([
      ...Object.keys(SENSITIVE).filter((key) => !keys.has(key)),
      ...Object.keys(ORDINARY_CONTROLLERS).filter((name) => !controllers.has(name)),
      ...Object.entries(ORDINARY_ROUTES).flatMap(([name, { handlers }]) => handlers.map((h) => `${name}.${h}`).filter((key) => !keys.has(key))),
    ]).toEqual([])
  })
})

describe('better-auth: every endpoint the configured instance serves is decided', () => {
  // Google and Apple configured, so `/link-social` and the provider callbacks are among the endpoints.
  const { auth } = createBetterAuth({
    prisma: {} as PrismaClient,
    secret: 'step-up-classification-secret-0123456789abcdef',
    baseUrl: 'http://localhost:3000',
    webAppUrl: 'http://localhost:8081',
    trustedOrigins: [],
    emailSender: { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendExistingAccountNotice: vi.fn(), sendUnverifiedAccountWarning: vi.fn() },
    googleClientId: 'g',
    googleClientSecret: 'g',
    appleSignInEnabled: true,
    appleClientId: 'a',
    appleClientSecret: 'a',
  })
  const endpoints = Object.values(auth.api as unknown as Record<string, { path?: unknown; options?: { metadata?: { SERVER_ONLY?: boolean } } }>)
  const httpPaths = [
    ...new Set(
      endpoints
        .filter((e) => typeof e.path === 'string' && e.options?.metadata?.SERVER_ONLY !== true)
        .map((e) => e.path as string)
        .filter((path) => !BETTER_AUTH_SERVER_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))),
    ),
  ]

  it('finds the endpoints', () => {
    expect(httpPaths.length).toBeGreaterThan(60)
    expect(httpPaths).toContain('/link-social')
  })

  it('every endpoint is either stepped up or named with the reason it needs none', () => {
    expect(httpPaths.filter((path) => BETTER_AUTH_STEP_UP[path] === undefined && BETTER_AUTH_NO_STEP_UP[path] === undefined)).toEqual([])
    expect(httpPaths.filter((path) => BETTER_AUTH_STEP_UP[path] !== undefined && BETTER_AUTH_NO_STEP_UP[path] !== undefined)).toEqual([])
  })

  it('the step-up plugin gates exactly the sensitive endpoints, including the ones H2-19 found open', () => {
    expect(httpPaths.filter((path) => needsStepUp(path)).sort()).toEqual(Object.keys(BETTER_AUTH_STEP_UP).sort())
    for (const path of ['/token', '/oauth2/create-client', '/oauth2/client/rotate-secret', '/unlink-account', '/passkey/delete-passkey']) {
      expect(needsStepUp(path), path).toBe(true)
    }
  })

  it('names no endpoint that no longer exists', () => {
    const served = new Set(endpoints.map((e) => e.path))
    expect([...Object.keys(BETTER_AUTH_STEP_UP), ...Object.keys(BETTER_AUTH_NO_STEP_UP)].filter((path) => !served.has(path))).toEqual([])
  })
})
