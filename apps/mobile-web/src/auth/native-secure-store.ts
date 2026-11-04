import * as SecureStore from 'expo-secure-store'
import { createSecureStoreSessionTokenStorage, type SessionTokenStorage } from './session-token-storage'

export const SESSION_TOKEN_KEY = 'steuereule.session_token'

export function createNativeSessionTokenStorage(): SessionTokenStorage {
  return createSecureStoreSessionTokenStorage({
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  })
}
