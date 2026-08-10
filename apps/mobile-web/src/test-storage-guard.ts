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
 *  the Proxy cannot defeat. Caller is responsible for `vi.unstubAllGlobals()` in `afterEach`. */
export function stubStorageSetItem(storeName: ReachableStore): Mock {
  const setItem = vi.fn()
  vi.stubGlobal(storeName, { ...window[storeName], setItem })
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
 */
export function assertNoStorageWrites(storeName: ReachableStore, setItem: Mock): void {
  if (setItem.mock.calls.length === 0) return
  const written = setItem.mock.calls.map(([key, value]) => `${String(key)}=${String(value)}`).join(', ')
  throw new Error(
    `${storeName}.setItem was called ${setItem.mock.calls.length}x with [${written}] — ADR-0008 forbids ` +
      'client-side persistence of profile data. If this write is benign, name it explicitly in this ' +
      'test instead of weakening the assertion; if it carries the Steuer-ID or any profile field, this ' +
      'is a real leak.',
  )
}
