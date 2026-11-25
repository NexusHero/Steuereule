// The lock for limits on costly routes (P8 of the beta review, API-6, H2-12, H2-14): every route, enumerated from
// the running app, either is named as costly (it renders a PDF, asks a model, sends mail, starts ERiC, builds an
// export or parses an upload) and carries a per-account throttle on the shared storage, or is named here with
// the reason it costs no more than a database read. A new route fails this test until it is decided.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { ThrottlerGuard } from '@nestjs/throttler'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'costly-route-throttle-test-secret'

type Effect = 'pdf' | 'model' | 'mail' | 'eric' | 'export' | 'parse' | 'payment' | 'abuse'

/** Costly routes: each must carry a throttle, unless `limiter` names the limit it has instead. */
const COSTLY: Readonly<Record<string, { readonly effect: Effect; readonly limiter?: string }>> = {
  'AdvisorController.sendMessage': { effect: 'model' },
  'AdvisorController.streamMessage': { effect: 'model' },
  'AdvisorController.summarizeConversation': { effect: 'model' },
  'ReceiptParseController.parseReceipt': { effect: 'model' },
  'ReceiptParseController.reassign': { effect: 'model' },
  'PrintoutController.printout': { effect: 'pdf' },
  'PrintoutController.exportAsync': { effect: 'pdf' },
  'PrintoutController.checkout': { effect: 'payment' },
  'AccountExportController.exportAccount': { effect: 'pdf' },
  'BusinessController.importBank': { effect: 'parse' },
  'BusinessController.gobd': { effect: 'export' },
  'BusinessController.eBilanz': { effect: 'export' },
  'BusinessController.eBilanzFile': { effect: 'export' },
  'BusinessController.transmitEBilanz': { effect: 'eric' },
  'BusinessController.checkout': { effect: 'payment' },
  'ReceiptController.create': { effect: 'parse' },
  'ReceiptController.upload': { effect: 'parse' },
  'AccountDeletionController.deleteAccount': { effect: 'abuse' },
  'AddressController.search': { effect: 'abuse' },
  'LinkController.joinWithCode': { effect: 'abuse' },
  'DeviceController.requestCode': { effect: 'abuse' },
  'DeviceController.getPending': { effect: 'abuse' },
  'DeviceController.approve': { effect: 'abuse' },
  // Polled by the device; bounded per address (H2-16).
  'DeviceController.exchangeToken': { effect: 'abuse' },
  // Public, unauthenticated (H2-17).
  'AssistantsController.getClientInfo': { effect: 'abuse' },
  'McpController.streamable': { effect: 'model', limiter: 'McpRateLimiter: sessions per account and calls per tool (ADR-0052)' },
  'McpController.sse': { effect: 'model', limiter: 'McpRateLimiter: sessions per account and calls per tool (ADR-0052)' },
  'McpController.messages': { effect: 'model', limiter: 'McpRateLimiter: sessions per account and calls per tool (ADR-0052)' },
}

/** Controllers none of whose routes is costly. Mail is sent only by better-auth, which has its own limiter. */
const CHEAP_CONTROLLERS: Readonly<Record<string, string>> = {
  AssessmentController: 'Bescheid fields from the database.',
  AuthCapabilitiesController: 'Static.',
  CapabilitiesController: 'Static.',
  CapitalController: 'Mask rows.',
  ChSalaryCertificateController: 'Mask rows.',
  ChildrenController: 'Mask rows.',
  CockpitController: 'Reads and sums the year.',
  CommuteController: 'Mask rows.',
  ConfirmationController: 'Markings.',
  DeadlinesController: 'Computed dates.',
  FiledElsewhereController: 'One answer per year.',
  FilingTypeComparisonController: 'Two estimates in the core, no I/O beyond the reads.',
  HealthController: 'Probe, cached 1.5 s.',
  HouseholdController: 'Mask rows.',
  InterviewController: 'Answers; guests are limited per address on every write (ADR-0106 D8).',
  KnownEmployersController: 'A list from the database.',
  LstbController: 'Mask fields.',
  LstbScanController: 'Confirms a scan already read through ReceiptParseController.',
  MasterDataController: 'Mask rows.',
  OAuthDiscoveryController: 'Static metadata.',
  OwlModeController: 'Owl settings, consents and the rule cards; no model call.',
  PensionController: 'Mask rows.',
  ProfileController: 'Mask rows.',
  RentalController: 'Mask rows.',
  SubmissionController: 'Freezes the filed version; ERiC is not started here.',
  TakeoverController: 'Copies last year’s rows.',
  TaxEstimateController: 'The core estimate over the year’s rows.',
  UnlockController: 'Stripe webhook, signed.',
  YearHistoryController: 'Reads the years; no estimate for a year without data (OPS-4).',
}

/** The cheap routes of controllers that also have costly ones, with the reason per controller. */
const CHEAP_ROUTES: Readonly<Record<string, { readonly why: string; readonly handlers: readonly string[] }>> = {
  AdvisorController: {
    why: 'Conversations, notes and drafts from the database; `connection` is cached per process for 60 s; no model call.',
    handlers: [
      'listModels', 'setConversationModel', 'getSession', 'runEvents', 'stopRun', 'clearConversation', 'connection', 'opening', 'search', 'saveSituation',
      'listNotes', 'createNote', 'updateNote', 'deleteNote', 'undoNoteChange', 'listConversations', 'createConversation', 'renameConversation',
      'deleteConversation', 'setFeedback', 'applyBatch', 'applyAction', 'undoAction', 'dismissAction',
    ],
  },
  BusinessController: {
    why: 'Book entries and the computed views of one year; the ELSTER help lists values, it renders and sends nothing.',
    handlers: [
      'businesses', 'addBusiness', 'removeBusiness', 'catalogues', 'profile', 'saveProfile', 'book', 'post', 'reverse', 'quickEntry', 'lock', 'bank',
      'acceptBank', 'ignoreBank', 'assets', 'createAsset', 'setAssetFacts', 'disposeAsset', 'bookDepreciation', 'closing', 'carryForward', 'companyCar',
      'bookCompanyCar', 'payroll', 'addPayrollRun', 'specialTariffs', 'vatPrepayments', 'vat', 'tradeTax', 'hebesatz', 'losses', 'elsterForms', 'elster',
      'procedureDoc', 'saveProcedureDoc',
    ],
  },
  PrintoutController: {
    why: '`check` measures overflows without rendering (API-6); the values, the job status and the cached template are reads.',
    handlers: ['check', 'liveValues', 'getJob', 'template'],
  },
  ReceiptController: { why: 'Reads and assignments; the file download streams a stored blob.', handlers: ['list', 'downloadFile', 'setAssignment', 'delete'] },
  AssistantsController: { why: 'Lists and revokes assistant grants.', handlers: ['listConnected', 'revoke'] },
  McpController: { why: 'Ends or probes an MCP session.', handlers: ['streamableOther'] },
  LinkController: { why: 'The coupling of the year and Person B’s facts.', handlers: ['get', 'set', 'updatePersonB', 'consent'] },
}

interface Route {
  readonly key: string
  readonly controller: string
  readonly route: string
  readonly throttled: boolean
}

const isThrottlerGuard = (guard: unknown): boolean =>
  guard === ThrottlerGuard || (typeof guard === 'function' && guard.prototype instanceof ThrottlerGuard)

describe('every costly route carries a limit, every other route says why it needs none', () => {
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
          const guards = [...((Reflect.getMetadata(GUARDS_METADATA, fn) as unknown[] | undefined) ?? []), ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? [])]
          const limit: unknown = Reflect.getMetadata('THROTTLER:LIMITdefault', fn)
          routes.push({
            key: `${controller.name}.${handler}`,
            controller: controller.name,
            route: `${RequestMethod[method]} ${String(Reflect.getMetadata(PATH_METADATA, controller))}/${String(Reflect.getMetadata(PATH_METADATA, fn))}`,
            throttled: guards.some(isThrottlerGuard) && typeof limit === 'number',
          })
        }
      }
    }
  })

  afterAll(async () => {
    await app.close()
  })

  it('finds the routes of the app', () => {
    expect(routes.length).toBeGreaterThan(180)
  })

  it('every route is decided: costly, or cheap with a reason', () => {
    const cheap = (r: Route) => CHEAP_CONTROLLERS[r.controller] !== undefined || (CHEAP_ROUTES[r.controller]?.handlers.includes(r.key.split('.')[1]!) ?? false)
    const undecided = routes.filter((r) => COSTLY[r.key] === undefined && !cheap(r)).map((r) => `${r.key} (${r.route})`)
    expect(undecided).toEqual([])
    const both = routes.filter((r) => COSTLY[r.key] !== undefined && cheap(r)).map((r) => r.key)
    expect(both).toEqual([])
  })

  it('every costly route has a per-account throttle or names its own limiter', () => {
    const unlimited = routes.filter((r) => COSTLY[r.key] !== undefined && COSTLY[r.key]!.limiter === undefined && !r.throttled).map((r) => `${r.key} (${r.route})`)
    expect(unlimited).toEqual([])
  })

  it('names no route or controller that no longer exists', () => {
    const keys = new Set(routes.map((r) => r.key))
    const controllers = new Set(routes.map((r) => r.controller))
    const stale = [
      ...Object.keys(COSTLY).filter((key) => !keys.has(key)),
      ...Object.keys(CHEAP_CONTROLLERS).filter((name) => !controllers.has(name)),
      ...Object.entries(CHEAP_ROUTES).flatMap(([name, { handlers }]) => handlers.map((h) => `${name}.${h}`).filter((key) => !keys.has(key))),
    ]
    expect(stale).toEqual([])
  })
})
