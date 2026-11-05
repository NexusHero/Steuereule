import type { MasterDataRecord, MasterDataRepository } from '../../src/stammdaten/stammdaten.repository.js'

export class FakeStammdatenRepository implements MasterDataRepository {
  private readonly store = new Map<string, MasterDataRecord>()

  findByUserId(userId: string): Promise<MasterDataRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  speichere(userId: string, record: MasterDataRecord): Promise<MasterDataRecord> {
    this.store.set(userId, record)
    return Promise.resolve(record)
  }
}
