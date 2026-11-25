// H2-11: creating an advisor note wrote a WRITE row into the access trail, updating or deleting one did
// not. Each change now writes its row in the same transaction as the change itself.
import { describe, expect, it } from 'vitest'
import { PrismaAdvisorRepository } from '../src/advisor/advisor.repository.prisma.js'

function prismaRecording() {
  const steps: string[] = []
  const note = { id: 'n1', userId: 'u', taxYear: 2025, text: 'Neu.', author: 'user', createdAt: new Date(), updatedAt: new Date() }
  const op = (name: string, value: unknown) => {
    const promise = Promise.resolve(value)
    return Object.assign(promise, { step: name })
  }
  const prisma = {
    advisorNote: {
      updateMany: () => op('advisorNote.updateMany', { count: 1 }),
      deleteMany: () => op('advisorNote.deleteMany', { count: 1 }),
      findFirst: async () => note,
    },
    taxDataAccessLog: {
      create: (args: { data: { userId: string; action: string; resource: string } }) => op(`log:${args.data.action}:${args.data.resource}:${args.data.userId}`, {}),
    },
    $transaction: async (ops: (Promise<unknown> & { step: string })[]) => {
      steps.push(`transaction[${ops.map((o) => o.step).join(', ')}]`)
      return Promise.all(ops)
    },
  }
  return { steps, repository: new PrismaAdvisorRepository(prisma as never) }
}

describe('PrismaAdvisorRepository note changes (H2-11)', () => {
  it('an update writes the note and its WRITE row in one transaction', async () => {
    const { steps, repository } = prismaRecording()
    const updated = await repository.updateNote('n1', 'u', 'Neu.', 'user')
    expect(updated?.text).toBe('Neu.')
    expect(steps).toEqual(['transaction[advisorNote.updateMany, log:WRITE:berater_notiz:u]'])
  })

  it('a delete removes the note and writes its WRITE row in one transaction', async () => {
    const { steps, repository } = prismaRecording()
    expect(await repository.deleteNote('n1', 'u')).toBe(true)
    expect(steps).toEqual(['transaction[advisorNote.deleteMany, log:WRITE:berater_notiz:u]'])
  })
})
