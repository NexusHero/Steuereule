import type { StammdatenRecord, StammdatenRepository } from '../../src/stammdaten/stammdaten.repository.js'

export class FakeStammdatenRepository implements StammdatenRepository {
  private readonly store = new Map<string, StammdatenRecord>()

  findByUserId(userId: string): Promise<StammdatenRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  speichere(userId: string, record: StammdatenRecord): Promise<StammdatenRecord> {
    this.store.set(userId, record)
    return Promise.resolve(record)
  }
}
