// #262 — DEVICE_AUTHORIZATION_DISABLED_PATHS (better-auth.ts) used to be a hand-enumerated
// list trusted by a comment ("re-check on a better-auth version bump"). Musti's verdict on
// that comment: "a comment asking a human to remember is not a control." This file proves
// the replacement control — `assertDeviceAuthorizationDisabledPathsComplete`, which reads the
// device-authorization plugin's own declared routes off its constructed `endpoints` (the same
// `.path` property better-auth's own router reads, `better-auth/dist/api/index.mjs`) — actually
// discriminates, per ADR-0021: proven red on an injected drift, green once removed, and guarded
// against the vacuous "zero routes found" pass (ADR-0021 amendment §1).
import { deviceAuthorization } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'
import {
  DEVICE_AUTHORIZATION_DISABLED_PATHS,
  assertDeviceAuthorizationDisabledPathsComplete,
  deviceAuthorizationPluginPaths,
  type DeviceAuthorizationPluginLike,
} from '../src/auth/better-auth.js'

/** Constructs the real, installed device-authorization plugin — same call shape
 *  `buildOptions()` makes in production; `expiresIn`/`verificationUri` govern
 *  behaviour, not which routes get registered. */
function realPlugin(): DeviceAuthorizationPluginLike {
  return deviceAuthorization({ expiresIn: '2m', verificationUri: 'https://web-app.example.com/device' })
}

function fakeEndpoint(path: string): { path: string } {
  return Object.assign(() => undefined, { path })
}

describe('deviceAuthorizationPluginPaths', () => {
  it('reads exactly the five routes off the real, installed better-auth device-authorization plugin', () => {
    // Not asserted against a literal copy here — that would be the exact restatement
    // #262 exists to remove. Asserted against DEVICE_AUTHORIZATION_DISABLED_PATHS
    // itself, so this test and the disabledPaths constant can never independently drift.
    expect(new Set(deviceAuthorizationPluginPaths(realPlugin()))).toEqual(new Set(DEVICE_AUTHORIZATION_DISABLED_PATHS))
  })

  it('ignores entries without a string .path (defensive — a plugin could carry non-endpoint keys)', () => {
    const plugin: DeviceAuthorizationPluginLike = {
      endpoints: {
        real: fakeEndpoint('/device/code'),
        // @ts-expect-error — deliberately malformed, proving the filter, not the type system
        malformed: { notAPath: true },
      },
    }
    expect(deviceAuthorizationPluginPaths(plugin)).toEqual(['/device/code'])
  })
})

describe('assertDeviceAuthorizationDisabledPathsComplete', () => {
  it('passes today, against the real plugin — the current list genuinely is complete', () => {
    expect(() => assertDeviceAuthorizationDisabledPathsComplete(realPlugin())).not.toThrow()
  })

  // ADR-0021: the acceptance criterion this ticket names — "a route added to the
  // plugin's declared route set that is not present in the constant (simulated in
  // the test, not by actually bumping the dependency)". Injected onto the REAL
  // plugin's own endpoint map (not a wholly synthetic one), the shape a 1.7 bump
  // adding e.g. `/device/revoke` would actually take.
  it('RED — a route the plugin declares beyond the five known ones fails, naming it', () => {
    const plugin = realPlugin()
    const drifted: DeviceAuthorizationPluginLike = {
      endpoints: { ...plugin.endpoints, deviceRevoke: fakeEndpoint('/device/revoke') },
    }

    expect(() => assertDeviceAuthorizationDisabledPathsComplete(drifted)).toThrow(/\/device\/revoke/)
    expect(() => assertDeviceAuthorizationDisabledPathsComplete(drifted)).toThrow(/DEVICE_AUTHORIZATION_DISABLED_PATHS does not cover/)
  })

  it('GREEN — removing the injected route (drift resolved) passes again', () => {
    const plugin = realPlugin()
    const drifted: DeviceAuthorizationPluginLike = {
      endpoints: { ...plugin.endpoints, deviceRevoke: fakeEndpoint('/device/revoke') },
    }
    expect(() => assertDeviceAuthorizationDisabledPathsComplete(drifted)).toThrow()

    // Break resolved by removing exactly the one entry injected above — confirming
    // what changed, not merely that a later call happens to pass (ADR-0021 amendment
    // §1: "confirm the break landed before reading the result").
    const { deviceRevoke: _removed, ...repaired } = drifted.endpoints ?? {}
    expect(() => assertDeviceAuthorizationDisabledPathsComplete({ endpoints: repaired })).not.toThrow()
  })

  it('RED — a route DEVICE_AUTHORIZATION_DISABLED_PATHS still names but the plugin no longer declares also fails', () => {
    // The other half of set-equality (the ticket: "asserts, as a set, that it equals
    // DEVICE_AUTHORIZATION_DISABLED_PATHS") — a route removed/renamed upstream, not
    // only one added, must also be caught.
    const plugin: DeviceAuthorizationPluginLike = {
      endpoints: Object.fromEntries(
        DEVICE_AUTHORIZATION_DISABLED_PATHS.filter((path) => path !== '/device/deny').map((path, i) => [`e${i}`, fakeEndpoint(path)]),
      ),
    }
    expect(() => assertDeviceAuthorizationDisabledPathsComplete(plugin)).toThrow(/\/device\/deny/)
    expect(() => assertDeviceAuthorizationDisabledPathsComplete(plugin)).toThrow(/no longer declares/)
  })

  // ADR-0021 amendment §1 — the existence branch: a check that only validates a
  // present value is vacuously satisfied by absence. Zero declared routes must be a
  // named finding, not read as "nothing to disagree with" (an empty derived set could
  // otherwise slip past a naive `declared.has(...)` comparison for the wrong reason —
  // it would still throw on the disabledButNotDeclared branch here, but for a
  // misleading message; the dedicated guard names the real, more likely cause).
  it('guards the vacuous case — zero declared routes is itself a finding, not a silent pass', () => {
    expect(() => assertDeviceAuthorizationDisabledPathsComplete({})).toThrow(/yielded zero declared paths/)
    expect(() => assertDeviceAuthorizationDisabledPathsComplete({ endpoints: {} })).toThrow(/yielded zero declared paths/)
  })
})
