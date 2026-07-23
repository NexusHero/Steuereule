// In-memory fake — mirrors FakeProfileRepository's per-userId Map. Lets HTTP-level
// tests (account.http.test.ts) control exactly which userId "has an account" without
// a live better-auth/Postgres User row.
import type { AccountIdentity, AccountIdentityRepository } from '../../src/account/account-identity.repository.js'

export class FakeAccountIdentityRepository implements AccountIdentityRepository {
  private readonly store = new Map<string, AccountIdentity>()

  seed(userId: string, identity: AccountIdentity): void {
    this.store.set(userId, identity)
  }

  findByUserId(userId: string): Promise<AccountIdentity | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }
}
