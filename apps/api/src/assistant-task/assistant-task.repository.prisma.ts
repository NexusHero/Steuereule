import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type {
  AssistantTaskDecision,
  AssistantTaskKind,
  AssistantTaskRecord,
  AssistantTaskRepository,
  AssistantTaskStatus,
  NewAssistantTask,
} from './assistant-task.repository.js'

const RESOURCE = 'assistent-aufgabe'

function toRecord(row: {
  id: string
  userId: string
  taxYear: number
  kind: string
  text: string
  assistant: string
  clientId: string
  status: string
  createdAt: Date
  decidedAt: Date | null
}): AssistantTaskRecord {
  return { ...row, kind: row.kind as AssistantTaskKind, status: row.status as AssistantTaskStatus }
}

@Injectable()
export class PrismaAssistantTaskRepository implements AssistantTaskRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, taxYear: number): Promise<AssistantTaskRecord[]> {
    const rows = await this.prisma.assistantTask.findMany({ where: { userId, taxYear }, orderBy: { createdAt: 'asc' } })
    return rows.map(toRecord)
  }

  async create(userId: string, taxYear: number, task: NewAssistantTask): Promise<AssistantTaskRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.assistantTask.create({ data: { userId, taxYear, kind: task.kind, text: task.text, assistant: task.assistant, clientId: task.clientId } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: RESOURCE } }),
    ])
    return toRecord(row)
  }

  async withdraw(userId: string, taxYear: number, taskId: string, clientId: string): Promise<boolean> {
    // Check and delete are one statement: only an open task of this assistant goes (H2-24).
    const [removed] = await this.prisma.$transaction([
      this.prisma.assistantTask.deleteMany({ where: { id: taskId, userId, taxYear, clientId, status: 'offen' } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: RESOURCE } }),
    ])
    return removed.count === 1
  }

  async decide(userId: string, taxYear: number, taskId: string, decision: AssistantTaskDecision): Promise<AssistantTaskRecord | null> {
    const existing = await this.prisma.assistantTask.findFirst({ where: { id: taskId, userId, taxYear, status: 'offen' } })
    if (existing === null) return null
    const [row] = await this.prisma.$transaction([
      this.prisma.assistantTask.update({ where: { id: taskId }, data: { status: decision, decidedAt: new Date() } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: RESOURCE } }),
    ])
    return toRecord(row)
  }
}
