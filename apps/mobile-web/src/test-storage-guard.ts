// Shared helper for the ADR-0008 "no client-side persistence" test assertions (#323).
//
// Why `vi.stubGlobal`, not `vi.spyOn(window.localStorage, 'setItem')`: jsdom implements `Storage`
// behind a Proxy (needed for `localStorage.foo = 'bar'`-style magic property access) whose `get`
// trap returns the *native* bound method regardless of an own property `spyOn` adds, so a spy
// installed that way never records a single call — proven directly in #323: even a literal
// `localStorage.setItem('leak', 'steuerid')` on the very next line leaves the spy at 0 calls.
// `vi.stubGlobal` replaces the whole binding instead, which the Proxy trick cannot defeat because
// there is no Proxy left in the lookup chain at all.
import { vi, type Mock } from 'vitest'

/** Reachable client-side stores this app's web build can actually be asserted against — see
 *  `assertNoStorageWrites`'s doc comment for why "genuinely reachable" matters here. */
export type ReachableStore = 'localStorage' | 'sessionStorage'

/** Installs a `vi.stubGlobal`-backed stand-in for `window[storeName]` whose `setItem` is a spy
 *  the Proxy cannot defeat. Caller is responsible for `vi.unstubAllGlobals()` in `afterEach`.
 *
 *  Bound (#333, Musti's finding 2): this guards `window[storeName]` itself, not every path that
 *  can reach the real store. A reference captured *before* this function installs the stand-in —
 *  `const captured = window.localStorage` at module scope, say — still points at the real
 *  `Storage` object forever, so a later `captured.setItem(...)` (a handler, an effect, any time
 *  during the test, not only "before `beforeEach`") writes straight past this guard: the identity
 *  check in `assertNoStorageWrites` is satisfied — the guard genuinely is installed on
 *  `window[storeName]` — it simply isn't the object that call went through. **The bound is which
 *  reference was captured, not when the write happens.** Latent, not live: nothing in
 *  `apps/mobile-web/src` holds a storage handle today. Not closed here on purpose — wrapping
 *  `Storage.prototype.setItem` itself would reach it, but that targets the mechanism upstream of
 *  the hazard, which ADR-0028 rules against by name; `e2e/storage/no-client-persistence.mjs`
 *  (#331) is the control built to close this class, by observing a real page after every module's
 *  top-level code has already run rather than relying on a stub at all.
 *
 *  Built by delegating to the *real* store's methods, not by spreading it (#329, Musti's finding
 *  2): `{ ...window[storeName] }` copies own enumerable properties, which on jsdom's `Storage`
 *  are the stored *keys* (e.g. a leftover `preexisting` value), not the API — `getItem`,
 *  `removeItem`, `clear` and `key` live on the prototype and a spread never reaches them, and
 *  `length` needs to stay live rather than being frozen at stub-install time. The result of
 *  spreading was a stand-in with no `getItem` at all: any screen that reads storage under the
 *  guard would throw `TypeError: ... .getItem is not a function` — a confusing failure inside a
 *  privacy control, which is exactly the kind of failure whose cheapest fix is deleting the
 *  guard. Binding through to the real store means a read behaves identically with or without the
 *  guard installed, and no stored key leaks onto the stand-in. */
export function stubStorageSetItem(storeName: ReachableStore): Mock {
  const realStore = window[storeName]
  const setItem = vi.fn()
  vi.stubGlobal(storeName, {
    getItem: realStore.getItem.bind(realStore),
    removeItem: realStore.removeItem.bind(realStore),
    clear: realStore.clear.bind(realStore),
    key: realStore.key.bind(realStore),
    get length() {
      return realStore.length
    },
    setItem,
  })
  return setItem
}

/**
 * Fails with a message that names every key/value pair actually written, not merely "was
 * called". A bare `expect(setItem).not.toHaveBeenCalled()` gives whoever meets a red run nothing
 * to go on beyond a call count — the day a benign write lands (a future i18n language-detector
 * cache, a query persister) that tells them nothing, and the path of least resistance is to
 * weaken the assertion rather than investigate it. Naming the key and value lets that call be
 * made in one read: a language code is obviously benign, a Steuer-ID-shaped value is obviously
 * not (#323, Musti's steer #1).
 *
 * Checks the guard is actually wired *before* trusting its call count (#329, Musti's finding 1 —
 * #323's own defect, one level up). `setItem.mock.calls.length === 0` is equally consistent with
 * "nothing was written" and with "the stub was never installed, was installed on the wrong
 * global, or was clobbered by a later `beforeEach`" — a disconnected instrument reads exactly
 * like a clean one. Comparing `window[storeName].setItem` against the exact `Mock` the caller is
 * holding proves the global in front of the test right now is the same object being asserted on;
 * anything else means this assertion cannot observe a write at all and must not be allowed to
 * report success.
 */
export function assertNoStorageWrites(storeName: ReachableStore, setItem: Mock): void {
  if (window[storeName].setItem !== setItem) {
    throw new Error(
      `${storeName} guard is not installed — call stubStorageSetItem('${storeName}') in beforeEach ` +
        'before asserting with it. Without that, this assertion cannot observe a write and would ' +
        'pass regardless of what was written.',
    )
  }
  if (setItem.mock.calls.length === 0) return
  const written = setItem.mock.calls.map(([key, value]) => `${String(key)}=${String(value)}`).join(', ')
  throw new Error(
    `${storeName}.setItem was called ${setItem.mock.calls.length}x with [${written}] — ADR-0008 forbids ` +
      'client-side persistence of profile data. If this write is benign, name it explicitly in this ' +
      'test instead of weakening the assertion; if it carries the Steuer-ID or any profile field, this ' +
      'is a real leak.',
  )
}
