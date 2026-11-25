// The lock for „the user wins“ (ADR-0052 §7, P3 of the beta review): every route that writes, enumerated from
// the running app, either takes the one marking path (`@UserWrite` → `UserWriteMarkings`) or is named here with
// the reason it does not write a mask field as the user. A new write route fails this test until it is decided.
// And only the files listed below may hold the marking repository, so no service settles markings by hand again.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { SCREENS } from '@steuereule/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { USER_WRITE_SCREENS } from '../src/common/user-write.decorator.js'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'user-write-routes-test-secret'

/** Controllers none of whose write routes writes a mask field as the user. */
const CONTROLLERS_WITHOUT_MASK_WRITES: Readonly<Record<string, string>> = {
  BusinessController: 'The book has no marking layer (ADR-0101): bookings are never edited, and a booking draft is decided on „Prüfen & bestätigen“.',
  AdvisorController: 'The owl writes through ConfirmationService (writeConfirmedByAdvisor / restoreByAdvisor), which sets the marking itself; the rest are chats and notes.',
  OwlModeController: 'Owl settings and consents, no tax fields.',
  ConfirmationController: 'This is the marking path itself: confirming, deciding proposals and tasks.',
  McpController: 'The user’s assistant, a non-user writer: every entry goes through ConfirmationService.write and decideWriting.',
  TakeoverController: 'The year carry-over is a non-user writer (ADR-0052 amendment 1): it goes through decideWriting.',
  SubmissionController: 'Records that the return was filed; no mask field.',
  UnlockController: 'Stripe webhook; no mask field.',
  PrintoutController: 'Reads the return and starts a checkout; no mask field.',
  ReceiptController: 'Documents. Taking a document’s values back restores them through ConfirmationService.restoreByAdvisor.',
  ReceiptParseController: 'Reading a document prepares owl drafts; moving it restores and applies through ConfirmationService.',
  FiledElsewhereController: 'Whether a year was filed elsewhere; no mask field.',
  AccountDeletionController: 'Deletes the account with its markings (P7 owns the lifecycle).',
  AssistantsController: 'Revokes an assistant; no mask field.',
  AddressController: 'Address search; reads only.',
  DeviceController: 'Device sign-in; no mask field.',
}

/**
 * Who may hold the marking repository, and why. Everyone else reads markings through ConfirmationService and
 * leaves the user's writes to `UserWriteMarkings`.
 */
const MARKING_REPOSITORY_HOLDERS: Readonly<Record<string, string>> = {
  'confirmation/confirmation.service.ts': 'the non-user writers and the user’s decisions on „Prüfen & bestätigen“',
  'confirmation/user-write-markings.ts': 'the user’s own writes on the masks',
  'takeover/takeover.service.ts': 'reads what the year carry-over marked',
  'lstb/lstb.service.ts': 'a scanned certificate sets its own „Aus Beleg“ provenance',
  'printout/printout.service.ts': 'reads what is unconfirmed before printing',
  'cockpit/cockpit.service.ts': 'reads what is unconfirmed for the cockpit',
}

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : []
  })
}

interface WriteRoute {
  readonly controller: string
  readonly handler: string
  readonly route: string
  readonly screens: readonly string[] | undefined
}

describe('every write route takes the one marking path or says why not', () => {
  let app: NestFastifyApplication
  const routes: WriteRoute[] = []

  beforeAll(async () => {
    app = (await buildTestApp({ sessionsByToken: {} })).app
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as unknown as { name: string; prototype: object }
        for (const handler of Object.getOwnPropertyNames(controller.prototype)) {
          // Descriptors, not property reads: a getter on the prototype must not run here.
          const fn: unknown = Object.getOwnPropertyDescriptor(controller.prototype, handler)?.value
          if (typeof fn !== 'function') continue
          const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined
          if (method === undefined || method === RequestMethod.GET || method === RequestMethod.HEAD || method === RequestMethod.OPTIONS) continue
          routes.push({
            controller: controller.name,
            handler,
            route: `${RequestMethod[method]} ${String(Reflect.getMetadata(PATH_METADATA, controller))}/${String(Reflect.getMetadata(PATH_METADATA, fn))}`,
            screens: Reflect.getMetadata(USER_WRITE_SCREENS, fn) as readonly string[] | undefined,
          })
        }
      }
    }
  })

  afterAll(async () => {
    await app.close()
  })

  it('finds the write routes of the app', () => {
    expect(routes.length).toBeGreaterThan(80)
    expect(routes.filter((r) => r.screens !== undefined).length).toBeGreaterThanOrEqual(39)
  })

  it('a route is either a @UserWrite of its masks or belongs to a controller named with its reason', () => {
    const undecided = routes.filter((r) => r.screens === undefined && CONTROLLERS_WITHOUT_MASK_WRITES[r.controller] === undefined).map((r) => `${r.controller}.${r.handler} (${r.route})`)
    expect(undecided).toEqual([])
  })

  it('a named controller has no @UserWrite route, and every named controller still exists', () => {
    expect(routes.filter((r) => r.screens !== undefined && CONTROLLERS_WITHOUT_MASK_WRITES[r.controller] !== undefined).map((r) => r.controller)).toEqual([])
    const controllers = new Set(routes.map((r) => r.controller))
    expect(Object.keys(CONTROLLERS_WITHOUT_MASK_WRITES).filter((name) => !controllers.has(name))).toEqual([])
  })

  it('@UserWrite names real masks', () => {
    const unknown = routes.flatMap((r) => (r.screens ?? []).filter((s) => !(SCREENS as readonly string[]).includes(s)).map((s) => `${r.controller}.${r.handler}: ${s}`))
    expect(unknown).toEqual([])
  })

  it('every mask the user edits in the app is covered by at least one @UserWrite route', () => {
    // The booking drafts are decided on „Prüfen & bestätigen“, never edited on a mask.
    const covered = new Set(routes.flatMap((r) => r.screens ?? []))
    expect(SCREENS.filter((s) => s !== 'buchung' && !covered.has(s))).toEqual([])
  })

  it('only the files named here hold the marking repository', () => {
    const holders = sourceFiles(SRC)
      .filter((file) => /@Inject\(PROVENANCE_REPOSITORY\)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .sort()
    expect(holders).toEqual(Object.keys(MARKING_REPOSITORY_HOLDERS).sort())
  })
})
