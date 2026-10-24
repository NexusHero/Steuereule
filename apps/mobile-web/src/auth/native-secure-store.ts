// The native half of REQ-009 — adapts `expo-secure-store` (keychain on iOS, keystore on
// Android) to the `SessionTokenStorage` seam in session-token-storage.ts. This is the only
// module that imports the native package; the seam itself is dependency-injected so jsdom
// tests exercise it with a mock and never load the native module.
//
// Not wired into better-auth's client yet: better-auth 1.6.24 has no native session client
// (its `@better-auth/expo` package, whose `expoClient({ storage: SecureStore })` consumes a
// storage object of exactly this shape, is unavailable on 1.6.24 — see REQ-009's register
// row). This file is the layer that upgrade consumes; until then it is proven by unit test
// with a mock, NOT by a real iOS/Android device. Honest, not dead: it is the platform's
// token store, and the web fallback (session-token-storage.ts) is the already-shipped cookie
// flow — the two are the complete REQ-009 surface.
import * as SecureStore from 'expo-secure-store'
import { createSecureStoreSessionTokenStorage, type SessionTokenStorage } from './session-token-storage'

/** Keychain/keystore key the session token lives under. Namespaced to this app. */
export const SESSION_TOKEN_KEY = 'steuereule.session_token'

export function createNativeSessionTokenStorage(): SessionTokenStorage {
  return createSecureStoreSessionTokenStorage({
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  })
}
