import type {
  OwlSettingRecord,
  OwlSettingRepository,
  OwlCardDismissalRepository,
} from '../../src/eulen-modus/eulen-modus.repository.js'

export class FakeOwlSettingRepository implements OwlSettingRepository {
  private readonly store = new Map<string, OwlSettingRecord>()

  findByUserId(userId: string): Promise<OwlSettingRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  setEnabled(userId: string, aktiviert: boolean): Promise<OwlSettingRecord> {
    const record: OwlSettingRecord = {
      userId,
      aktiviert,
      aktiviertAm: aktiviert ? new Date() : null,
    }
    this.store.set(userId, record)
    return Promise.resolve(record)
  }
}

export class FakeOwlCardDismissalRepository implements OwlCardDismissalRepository {
  private readonly dismissals = new Set<string>()

  listForUserAndYear(userId: string, steuerjahr: number): Promise<string[]> {
    const prefix = `${userId}::${steuerjahr}::`
    const list: string[] = []
    for (const item of this.dismissals) {
      if (item.startsWith(prefix)) {
        list.push(item.slice(prefix.length))
      }
    }
    return Promise.resolve(list)
  }

  dismiss(userId: string, steuerjahr: number, fingerprint: string): Promise<void> {
    this.dismissals.add(`${userId}::${steuerjahr}::${fingerprint}`)
    return Promise.resolve()
  }
}
