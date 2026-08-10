// Control proofs for #329's two findings (Musti's retroactive T1 record on #329, posted after
// #323 merged — a fix to a control that is not itself proven by breaking it is what got us here
// twice, so per ADR-0021 both fixes below are proven red-without / green-with, not just asserted
// to have changed).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertNoStorageWrites, stubStorageSetItem } from './test-storage-guard'

describe('#329 finding 1 — assertNoStorageWrites must detect its own disconnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    // Some of the cases below write to the *real* jsdom localStorage/sessionStorage on purpose
    // (that is the point of a disconnected-guard proof) — clean up so nothing leaks into a later
    // test file that shares this jsdom window.
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('control: reproduces the exact pre-fix defect one level up — a disconnected mock reads as "nothing written" even after a real, unguarded leak', () => {
    // No stubStorageSetItem call here: `disconnected` is never installed as window.localStorage's
    // setItem, so it is exactly the "guard never wired" case Musti measured against `main`.
    const disconnected = vi.fn()
    window.localStorage.setItem('leak', 'steuerid') // a genuine, unguarded write
    expect(disconnected.mock.calls.length).toBe(0) // the shape of the old, silent-pass defect

    // The fixed assertNoStorageWrites must refuse to certify this as clean.
    expect(() => assertNoStorageWrites('localStorage', disconnected)).toThrow(/guard is not installed/)
  })

  it('throws, naming the store, when the guard was never installed for sessionStorage either', () => {
    const disconnected = vi.fn()
    expect(() => assertNoStorageWrites('sessionStorage', disconnected)).toThrow(/sessionStorage guard is not installed/)
  })

  it('throws when the mock handed in is not the one currently installed — e.g. a stale reference from a previous beforeEach', () => {
    stubStorageSetItem('localStorage') // installs *some* stub — just not the one below
    const staleReference = vi.fn()
    expect(() => assertNoStorageWrites('localStorage', staleReference)).toThrow(/guard is not installed/)
  })

  it('fix: passes once the guard is genuinely installed and nothing was written', () => {
    const setItem = stubStorageSetItem('localStorage')
    expect(() => assertNoStorageWrites('localStorage', setItem)).not.toThrow()
  })

  it('still reports a real leak by name once the guard is genuinely installed — the wiring check does not swallow real findings', () => {
    const setItem = stubStorageSetItem('localStorage')
    window.localStorage.setItem('leak', 'steuerid')
    expect(() => assertNoStorageWrites('localStorage', setItem)).toThrow(/leak=steuerid/)
  })
})

describe('#329 finding 2 — the stand-in must keep the real Storage API, not just swap setItem', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('control: a bare spread stand-in loses getItem/removeItem/clear/length and leaks pre-existing keys onto its own properties — the exact shape #329 found', () => {
    window.localStorage.setItem('preexisting', 'value')
    const setItem = vi.fn()
    // Reproduces the pre-fix `{ ...window.localStorage, setItem }` construction directly, without
    // going through stubStorageSetItem (which is already fixed) — this is the control.
    const spreadStandIn = { ...window.localStorage, setItem }
    expect(Object.keys(spreadStandIn)).toEqual(['preexisting', 'setItem'])
    expect(spreadStandIn.getItem).toBeUndefined()
    expect(spreadStandIn.length).toBeUndefined()
  })

  it('fix: getItem/removeItem/clear/key/length on the installed stub delegate to the real store', () => {
    window.localStorage.setItem('a', '1')
    window.localStorage.setItem('b', '2')
    stubStorageSetItem('localStorage')

    // A read under the guard behaves exactly as it does without it — the acceptance criterion
    // from Musti's finding-2 comment.
    expect(window.localStorage.getItem('a')).toBe('1')
    expect(window.localStorage.length).toBe(2)
    expect([window.localStorage.key(0), window.localStorage.key(1)].sort()).toEqual(['a', 'b'])

    window.localStorage.removeItem('a')
    expect(window.localStorage.getItem('a')).toBeNull()
    expect(window.localStorage.length).toBe(1)

    window.localStorage.clear()
    expect(window.localStorage.length).toBe(0)
    expect(window.localStorage.getItem('b')).toBeNull()
  })

  it('does not copy a pre-existing key onto the stand-in as an own property', () => {
    window.localStorage.setItem('preexisting', 'value')
    stubStorageSetItem('localStorage')
    expect(Object.prototype.hasOwnProperty.call(window.localStorage, 'preexisting')).toBe(false)
  })
})
