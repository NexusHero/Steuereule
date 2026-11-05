import type {
  OwlSettingRecord,
  OwlSettingRepository,
  OwlCardDismissalRepository,
} from '../../src/eulen-modus/eulen-modus.repository.js'

export class FakeEulenEinstellungRepository implements OwlSettingRepository {
  private readonly store = new Map<string, OwlSettingRecord>()

  findByUserId(userId: string): Promise<OwlSettingRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  setAktiviert(userId: string, aktiviert: boolean): Promise<OwlSettingRecord> {
    const record: OwlSettingRecord = {
      userId,
      aktiviert,
      aktiviertAm: aktiviert ? new Date() : null,
    }
    this.store.set(userId, record)
    return Promise.resolve(record)
  }
}

export class FakeEulenKartenVerwurfRepository implements OwlCardDismissalRepository {
  private readonly verwuerfe = new Set<string>()

  listForUserAndYear(userId: string, steuerjahr: number): Promise<string[]> {
    const prefix = `${userId}::${steuerjahr}::`
    const list: string[] = []
    for (const item of this.verwuerfe) {
      if (item.startsWith(prefix)) {
        list.push(item.slice(prefix.length))
      }
    }
    return Promise.resolve(list)
  }

  verwerfe(userId: string, steuerjahr: number, fingerprint: string): Promise<void> {
    this.verwuerfe.add(`${userId}::${steuerjahr}::${fingerprint}`)
    return Promise.resolve()
  }
}
