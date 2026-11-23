import { describe, expect, it, vi } from 'vitest'
import { PrismaAdvisorRepository } from '../src/advisor/advisor.repository.prisma.js'
import type { EncryptedPrismaClient } from '../src/prisma/encrypted-prisma.provider.js'

// ADR-0104 L1 — updateMessageMeta must scope the write by { id, userId }, so a message owned by another
// user is never written and only rejected afterwards. Prove the WHERE clause and the no-write-on-miss.
function repoWith(updateMany: ReturnType<typeof vi.fn>, findFirst: ReturnType<typeof vi.fn>): PrismaAdvisorRepository {
  const prisma = { advisorChatMessage: { updateMany, findFirst } } as unknown as EncryptedPrismaClient
  return new PrismaAdvisorRepository(prisma)
}

const OWNED_ROW = {
  id: 'm1', userId: 'owner', taxYear: 2025, role: 'assistant', content: 'c', metaJson: '{}',
  createdAt: new Date(), status: 'complete', reasoning: null, runId: null, feedbackRating: null,
  feedbackReason: null, usageJson: null, conversationId: 'c1',
}

describe('PrismaAdvisorRepository.updateMessageMeta', () => {
  it('scopes the update to { id, userId } and does not clobber a foreign message', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 }) // not owned → nothing updated
    const findFirst = vi.fn().mockResolvedValue(null)
    const repo = repoWith(updateMany, findFirst)

    await expect(repo.updateMessageMeta('m1', 'attacker', { kind: 'none' } as never)).rejects.toThrow()
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1', userId: 'attacker' } }))
  })

  it('updates and returns the record when the caller owns the message', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const findFirst = vi.fn().mockResolvedValue(OWNED_ROW)
    const repo = repoWith(updateMany, findFirst)

    const result = await repo.updateMessageMeta('m1', 'owner', { kind: 'none' } as never)
    expect(result.id).toBe('m1')
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1', userId: 'owner' } }))
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'owner' } })
  })
})
