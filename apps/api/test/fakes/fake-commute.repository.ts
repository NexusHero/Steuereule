import type { CommuteInputs, CommuteRepository } from '../../src/commute/commute.repository.js'

export class FakeCommuteRepository implements CommuteRepository {
  private readonly store = new Map<string, CommuteInputs>()

  private key(userId: string, taxYear: number): string {
    return `${userId}:${taxYear}`
  }

  async findForUserAndYear(userId: string, taxYear: number): Promise<CommuteInputs | null> {
    return this.store.get(this.key(userId, taxYear)) ?? null
  }

  async save(userId: string, taxYear: number, inputs: CommuteInputs): Promise<CommuteInputs> {
    this.store.set(this.key(userId, taxYear), inputs)
    return inputs
  }
}
