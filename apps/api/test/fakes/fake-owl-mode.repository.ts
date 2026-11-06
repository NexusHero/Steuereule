import type {
  OwlSettingRecord,
  OwlSettingRepository,
  OwlCardDismissalRepository,
} from '../../src/owl-mode/owl-mode.repository.js'

export class FakeOwlSettingRepository implements OwlSettingRepository {
  private readonly store = new Map<string, OwlSettingRecord>()

  findByUserId(userId: string): Promise<OwlSettingRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  setEnabled(userId: string, enabled: boolean): Promise<OwlSettingRecord> {
    const record: OwlSettingRecord = {
      userId,
      enabled,
      enabledAt: enabled ? new Date() : null,
    }
    this.store.set(userId, record)
    return Promise.resolve(record)
  }
}

export class FakeOwlCardDismissalRepository implements OwlCardDismissalRepository {
  private readonly dismissals = new Set<string>()

  listForUserAndYear(userId: string, taxYear: number): Promise<string[]> {
    const prefix = `${userId}::${taxYear}::`
    const list: string[] = []
    for (const item of this.dismissals) {
      if (item.startsWith(prefix)) {
        list.push(item.slice(prefix.length))
      }
    }
    return Promise.resolve(list)
  }

  dismiss(userId: string, taxYear: number, fingerprint: string): Promise<void> {
    this.dismissals.add(`${userId}::${taxYear}::${fingerprint}`)
    return Promise.resolve()
  }
}
