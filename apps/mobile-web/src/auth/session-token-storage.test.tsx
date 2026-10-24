// REQ-009 (Expo half) — proves the delegation *contract* of the session-token-storage seam,
// not production usage: (1) the native storage delegates set/get/remove to the injected
// `SecureStoreLike` (set → setItemAsync), so a future native client that hands it the real
// `expo-secure-store` gets keychain/keystore writes and never a plain store; and (2) the web
// fallback writes nothing to any client store — the cookie is the only copy. The seam is
// injected, so "set → setItemAsync" is asserted by handing a mock and checking the call, not by
// importing the native module into jsdom (ADR-0028: prove the effect, not the mechanism).
//
// Device-verification boundary (stated honestly, not hidden): this proves the *seam contract*
// by unit test with a mock. It does NOT prove the shipped app calls it — `createNativeSession
// TokenStorage()` / `resolveSessionTokenStorage()` have no production call site today (the
// native client does not exist yet; gated on better-auth ^1.7 `expoClient`, follow-up ticket
// 14). A real keychain round trip needs a shipped native build — out of scope here and gated in
// REQ-009's register row.
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  createSecureStoreSessionTokenStorage,
  createWebCookieSessionTokenStorage,
  resolveSessionTokenStorage,
  type SecureStoreLike,
} from './session-token-storage'
import { assertNoStorageWrites, stubStorageSetItem } from '../test-storage-guard'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockSecureStore(): SecureStoreLike & { setItemAsync: ReturnType<typeof vi.fn>; getItemAsync: ReturnType<typeof vi.fn>; deleteItemAsync: ReturnType<typeof vi.fn> } {
  return {
    setItemAsync: vi.fn(async () => {}),
    getItemAsync: vi.fn(async () => null),
    deleteItemAsync: vi.fn(async () => {}),
  }
}

describe('session-token-storage (REQ-009)', () => {
  it('writes the token to SecureStore on native (set → setItemAsync)', async () => {
    const secureStore = mockSecureStore()
    const storage = createSecureStoreSessionTokenStorage(secureStore)
    await storage.set('steuereule.session_token', 'the-token')
    expect(secureStore.setItemAsync).toHaveBeenCalledWith('steuereule.session_token', 'the-token')
  })

  it('reads and removes through SecureStore (get → getItemAsync, remove → deleteItemAsync)', async () => {
    const secureStore = mockSecureStore()
    secureStore.getItemAsync.mockResolvedValue('stored-token')
    const storage = createSecureStoreSessionTokenStorage(secureStore)
    expect(await storage.get('steuereule.session_token')).toBe('stored-token')
    await storage.remove('steuereule.session_token')
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('steuereule.session_token')
  })

  it('the web fallback is a no-op — the token stays only in the httpOnly cookie, never a client store', async () => {
    const localSetItem = stubStorageSetItem('localStorage')
    const sessionSetItem = stubStorageSetItem('sessionStorage')
    const storage = createWebCookieSessionTokenStorage()
    await storage.set('steuereule.session_token', 'should-not-land-anywhere')
    expect(await storage.get('steuereule.session_token')).toBeNull()
    await storage.remove('steuereule.session_token')
    // Neither localStorage nor sessionStorage saw a write (the guard asserts both stores).
    assertNoStorageWrites('localStorage', localSetItem)
    assertNoStorageWrites('sessionStorage', sessionSetItem)
  })

  it('resolves the platform storage: native → SecureStore, web → cookie (no-op)', async () => {
    const secureStore = mockSecureStore()
    const nativeStorage = resolveSessionTokenStorage('native', secureStore)
    await nativeStorage.set('k', 'v')
    expect(secureStore.setItemAsync).toHaveBeenCalledWith('k', 'v')

    const webStorage = resolveSessionTokenStorage('web', secureStore)
    expect(await webStorage.get('k')).toBeNull()
    expect(secureStore.getItemAsync).not.toHaveBeenCalled()
  })
})
