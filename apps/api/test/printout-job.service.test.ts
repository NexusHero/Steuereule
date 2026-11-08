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
