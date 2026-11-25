// In-memory fake of the assistant-task seam: honours the (userId, taxYear, id) scoping and the
// "only an open task can be decided" contract of the Prisma repository without a database (ADR-0004).
import type {
  AssistantTaskDecision,
  AssistantTaskRecord,
  AssistantTaskRepository,
  NewAssistantTask,
} from '../../src/assistant-task/assistant-task.repository.js'

export class FakeAssistantTaskRepository implements AssistantTaskRepository {
  private readonly rows: AssistantTaskRecord[] = []
  private counter = 0

  listForUserAndYear(userId: string, taxYear: number): Promise<AssistantTaskRecord[]> {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId && r.taxYear === taxYear).map((r) => ({ ...r })))
  }

  create(userId: string, taxYear: number, task: NewAssistantTask): Promise<AssistantTaskRecord> {
    this.counter += 1
    const record: AssistantTaskRecord = {
      id: `fake-task-${this.counter}`,
      userId,
      taxYear,
      ...task,
      status: 'offen',
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, this.counter)),
      decidedAt: null,
    }
    this.rows.push(record)
    return Promise.resolve({ ...record })
  }

  withdraw(userId: string, taxYear: number, taskId: string, clientId: string): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.id === taskId && r.userId === userId && r.taxYear === taxYear && r.clientId === clientId && r.status === 'offen')
    if (index === -1) return Promise.resolve(false)
    this.rows.splice(index, 1)
    return Promise.resolve(true)
  }

  decide(userId: string, taxYear: number, taskId: string, decision: AssistantTaskDecision): Promise<AssistantTaskRecord | null> {
    const row = this.rows.find((r) => r.id === taskId && r.userId === userId && r.taxYear === taxYear && r.status === 'offen')
    if (row === undefined) return Promise.resolve(null)
    row.status = decision
    row.decidedAt = new Date()
    return Promise.resolve({ ...row })
  }
}
