import type { UserKeyStore, WrappedUserKey } from '../../src/keystore/user-key-store.js'

/** In-memory keystore database (ADR-0059) for fast unit tests. */
export class InMemoryUserKeyStore implements UserKeyStore {
  private readonly keys = new Map<string, WrappedUserKey>()
  readonly destroyed: string[] = []

  async find(userId: string): Promise<WrappedUserKey | null> {
    return this.keys.get(userId) ?? null
  }

  async createIfAbsent(userId: string, candidate: WrappedUserKey): Promise<WrappedUserKey> {
    const existing = this.keys.get(userId)
    if (existing) return existing
    this.keys.set(userId, candidate)
    return candidate
  }

  async destroy(userId: string): Promise<boolean> {
    this.destroyed.push(userId)
    return this.keys.delete(userId)
  }
}
