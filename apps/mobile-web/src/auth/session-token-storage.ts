// REQ-009 (Expo half) — where a session token lives per platform. On the web, the token is
// the `httpOnly`+`Secure`+`SameSite=None` session cookie better-auth sets (ADR-0011/0012): it
// is unreadable by client JS and must never be mirrored into `localStorage`/`sessionStorage`/
// `AsyncStorage`, so the web storage is a deliberate no-op — the browser cookie is the only
// copy, and "store the token" on web means "do nothing extra". On native there is no cookie
// jar, so the token goes to `expo-secure-store` (keychain/keystore) — and *only* there, never
// `AsyncStorage` (which is not even a dependency of this repo; the token must not live in a
// plain unencrypted store).
//
// The `SecureStoreLike` seam is dependency-injected (not `import * as SecureStore from
// 'expo-secure-store'` at module top level) so the shared module stays importable in jsdom
// tests without touching the native module, and so a test can prove "SecureStore is used" by
// handing it a mock and asserting the call — the property, not a mechanism check (ADR-0028).
//
// Honest status (no iOS device / no shipped native build): what is proven here is the *seam* —
// by unit test with a mock SecureStore, and by static absence for `AsyncStorage`. What is NOT
// proven here is a real iOS keychain round trip, which needs the better-auth ^1.7 `expoClient`
// (its `@better-auth/expo` package is unavailable on the installed 1.6.24 — see REQ-007/009's
// register rows for that upgrade gate). This file is the storage layer that upgrade consumes.
export interface SecureStoreLike {
  readonly setItemAsync: (key: string, value: string) => Promise<void>
  readonly getItemAsync: (key: string) => Promise<string | null>
  readonly deleteItemAsync: (key: string) => Promise<void>
}

export interface SessionTokenStorage {
  readonly set: (key: string, value: string) => Promise<void>
  readonly get: (key: string) => Promise<string | null>
  readonly remove: (key: string) => Promise<void>
}

/** Native: the session token lives in the OS keychain/keystore via `expo-secure-store`. */
export function createSecureStoreSessionTokenStorage(secureStore: SecureStoreLike): SessionTokenStorage {
  return {
    set: (key, value) => secureStore.setItemAsync(key, value),
    get: (key) => secureStore.getItemAsync(key),
    remove: (key) => secureStore.deleteItemAsync(key),
  }
}

/** Web: the session token is the httpOnly cookie — nothing is written to any client store, so
 *  every operation is a no-op. This is the point of REQ-009 on web: a no-op is the *honest*
 *  answer, not "write it to localStorage because that's what we can reach". */
export function createWebCookieSessionTokenStorage(): SessionTokenStorage {
  return {
    set: async () => {},
    get: async () => null,
    remove: async () => {},
  }
}

/** Picks the platform's storage. `platform` is injected (not `Platform.OS` read here) so the
 *  choice itself is unit-testable. */
export function resolveSessionTokenStorage(platform: 'web' | 'native', secureStore: SecureStoreLike): SessionTokenStorage {
  return platform === 'native' ? createSecureStoreSessionTokenStorage(secureStore) : createWebCookieSessionTokenStorage()
}
