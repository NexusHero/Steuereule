// The native half of REQ-009 — adapts `expo-secure-store` (keychain on iOS, keystore on
// Android) to the `SessionTokenStorage` seam in session-token-storage.ts. This is the only
// module that imports the native package; the seam itself is dependency-injected so jsdom
// tests exercise it with a mock and never load the native module.
//
// Honest status: this is a *prepared integration point*, not a wired production path. No
// production call site instantiates `createNativeSessionTokenStorage()` /
// `resolveSessionTokenStorage()` today — deliberately, because the native client does not
// exist yet (no Expo client / dev build). The seam's contract (set → setItemAsync,
// get → getItemAsync, remove → deleteItemAsync) is proven by a delegation unit test with a
// mock, NOT by a real iOS/Android keychain round trip. The native build that will consume
// this storage object arrives with better-auth ^1.7's `@better-auth/expo`
// `expoClient({ storage })` — gated on follow-up ticket 14
// (`.scratch/roadmap-1.0/issues/14-passkey-webauthn-better-auth-upgrade.md`) or a dedicated
// native ticket. The shipped *web* session flow is better-auth's own `createAuthClient`
// (`credentials: 'include'` cookie flow, auth-client.ts), which never instantiates this
// module nor the web no-op in session-token-storage.ts.
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
