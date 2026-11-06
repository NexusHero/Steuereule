import type { TaxYearRolloverRecord, TaxYearRolloverRepository } from '../../src/uebernahme/jahresuebernahme.repository.js'

export class FakeYearTakeoverRepository implements TaxYearRolloverRepository {
  private records: TaxYearRolloverRecord[] = []

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRolloverRecord | null> {
    const found = this.records.find((r) => r.userId === userId && r.steuerjahr === steuerjahr)
    return found ? { ...found } : null
  }

  async record(userId: string, steuerjahr: number, vorjahr: number): Promise<TaxYearRolloverRecord> {
    const existing = await this.findForUserAndYear(userId, steuerjahr)
    if (existing) {
      throw new Error(`Unique constraint failed for userId=${userId}, steuerjahr=${steuerjahr}`)
    }
    const created: TaxYearRolloverRecord = {
      id: `ju-${this.records.length + 1}`,
      userId,
      steuerjahr,
      vorjahr,
      createdAt: new Date(),
    }
    this.records.push(created)
    return { ...created }
  }

  async deleteForUser(userId: string): Promise<number> {
    const before = this.records.length
    this.records = this.records.filter((r) => r.userId !== userId)
    return before - this.records.length
  }

  async listForUser(userId: string): Promise<TaxYearRolloverRecord[]> {
    return this.records.filter((r) => r.userId === userId).map((r) => ({ ...r }))
  }
}
