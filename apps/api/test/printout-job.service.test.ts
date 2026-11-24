import { describe, expect, it, vi } from 'vitest'
import { PrintoutJobService } from '../src/printout/printout-job.service.js'
import type { PrintoutService } from '../src/printout/printout.service.js'

describe('PrintoutJobService (ADR-0056: Async PDF Fault Isolation)', () => {
  it('enqueues a job immediately with 202-ready payload and returns statusUrl', async () => {
    const fakePrintoutService = {
      create: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])), // %PDF
    } as unknown as PrintoutService

    const service = new PrintoutJobService(fakePrintoutService)
    const result = await service.queueExport('user_123', 2025, {})

    expect(result.jobId).toMatch(/^job_[0-9a-f-]{36}$/)
    expect(result.status).toBe('queued')
    expect(result.statusUrl).toBe(`/v1/steuerjahre/2025/ausdruck/jobs/${result.jobId}`)

    // Query immediate status
    const status = await service.getJobStatus('user_123', 2025, result.jobId)
    expect(['queued', 'processing', 'completed']).toContain(status.status)
  })

  it('rejects status lookup for a mismatched user or non-existent job', async () => {
    const fakePrintoutService = { create: vi.fn() } as unknown as PrintoutService
    const service = new PrintoutJobService(fakePrintoutService)

    const job = await service.queueExport('user_owner', 2025, {})

    // Attacker trying to view another user's job
    await expect(service.getJobStatus('user_attacker', 2025, job.jobId)).rejects.toThrow('not found')
  })
})

describe('PrintoutJobService bounds (ADR-0109)', () => {
  const finished = () => ({ create: vi.fn().mockResolvedValue(new Uint8Array([37])) }) as unknown as PrintoutService
  const settle = () => new Promise((resolve) => setImmediate(resolve))

  it('holds at most a few jobs per account, and says when to come back', async () => {
    const service = new PrintoutJobService({ create: vi.fn(() => new Promise(() => undefined)) } as unknown as PrintoutService)
    for (let i = 0; i < 3; i += 1) await service.queueExport('u1', 2025, {})
    await expect(service.queueExport('u1', 2025, {})).rejects.toMatchObject({ code: 'PRINTOUT_JOBS_BUSY', details: { retryAfterSeconds: 15 } })
    await expect(service.queueExport('u2', 2025, {})).resolves.toBeDefined()
  })

  it('forgets a job whose result was read after a short grace, and one nobody read after the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const service = new PrintoutJobService(finished())
      const read = await service.queueExport('u1', 2025, {})
      const unread = await service.queueExport('u1', 2025, {})
      await settle()
      expect((await service.getJobStatus('u1', 2025, read.jobId)).status).toBe('completed')
      vi.setSystemTime(Date.now() + 61_000)
      await expect(service.getJobStatus('u1', 2025, read.jobId)).rejects.toThrow('not found')
      expect((await service.getJobStatus('u1', 2025, unread.jobId)).status).toBe('completed')
      vi.setSystemTime(Date.now() + 11 * 60_000)
      await expect(service.getJobStatus('u1', 2025, unread.jobId)).rejects.toThrow('not found')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not keep the rendered bytes', async () => {
    const service = new PrintoutJobService(finished())
    const job = await service.queueExport('u1', 2025, {})
    await settle()
    const internal = (service as unknown as { jobs: Map<string, Record<string, unknown>> }).jobs.get(job.jobId)!
    expect(internal.pdf).toBeUndefined()
  })
})
