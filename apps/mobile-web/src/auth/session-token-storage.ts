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

export function createSecureStoreSessionTokenStorage(secureStore: SecureStoreLike): SessionTokenStorage {
  return {
    set: (key, value) => secureStore.setItemAsync(key, value),
    get: (key) => secureStore.getItemAsync(key),
    remove: (key) => secureStore.deleteItemAsync(key),
  }
}

export function createWebCookieSessionTokenStorage(): SessionTokenStorage {
  return {
    set: async () => {},
    get: async () => null,
    remove: async () => {},
  }
}

export function resolveSessionTokenStorage(platform: 'web' | 'native', secureStore: SecureStoreLike): SessionTokenStorage {
  return platform === 'native' ? createSecureStoreSessionTokenStorage(secureStore) : createWebCookieSessionTokenStorage()
}
