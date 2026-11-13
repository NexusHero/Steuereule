import { WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS, type CommuteInputs, type CommuteRepository } from '../../src/commute/commute.repository.js'

const WORK_EXPENSE_KEYS: ReadonlySet<string> = new Set([...WORK_EXPENSE_AMOUNT_FIELDS, ...WORK_EXPENSE_NOTE_FIELDS])

export class FakeCommuteRepository implements CommuteRepository {
  private readonly store = new Map<string, CommuteInputs>()

  private key(userId: string, taxYear: number): string {
    return `${userId}:${taxYear}`
  }

  async findForUserAndYear(userId: string, taxYear: number): Promise<CommuteInputs | null> {
    return this.store.get(this.key(userId, taxYear)) ?? null
  }

  async save(userId: string, taxYear: number, inputs: CommuteInputs): Promise<CommuteInputs> {
    // Like the Prisma repository: further Werbungskosten left undefined keep what is stored.
    const existing = this.store.get(this.key(userId, taxYear))
    const kept = Object.fromEntries(Object.entries(existing ?? {}).filter(([k]) => WORK_EXPENSE_KEYS.has(k) && (inputs as unknown as Record<string, unknown>)[k] === undefined))
    const saved = { ...inputs, ...kept }
    this.store.set(this.key(userId, taxYear), saved)
    return saved
  }
}
