import { describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ setItemAsync: vi.fn(async () => {}), getItemAsync: vi.fn(async () => 'tok'), deleteItemAsync: vi.fn(async () => {}) }))
vi.mock('expo-secure-store', () => store)

import { createNativeSessionTokenStorage, SESSION_TOKEN_KEY } from './native-secure-store'

describe('the native session token storage', () => {
  it('keeps the token in the device keychain/keystore through expo-secure-store', async () => {
    const storage = createNativeSessionTokenStorage()
    await storage.set(SESSION_TOKEN_KEY, 'tok')
    expect(store.setItemAsync).toHaveBeenCalledWith(SESSION_TOKEN_KEY, 'tok')
    expect(await storage.get(SESSION_TOKEN_KEY)).toBe('tok')
    await storage.remove(SESSION_TOKEN_KEY)
    expect(store.deleteItemAsync).toHaveBeenCalledWith(SESSION_TOKEN_KEY)
  })
})
