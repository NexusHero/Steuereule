import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { createResettableRateLimitStorage, type ResettableRateLimitStorage } from '../auth/rate-limit-storage.js'
import { TooManyRequestsError } from '../common/domain-error.js'
import crypto from 'node:crypto'
import { PrintoutJobDto, type PrintoutJobStatus } from './dto/printout.dto.js'
import { PrintoutService } from './printout.service.js'
import { withSpan } from '../telemetry/tracer.js'

interface InternalJob {
  readonly id: string
  readonly userId: string
  readonly year: number
  status: PrintoutJobStatus
  downloadUrl?: string
  error?: string
  /** The job is forgotten after this moment (epoch ms). */
  expiresAt: number
}

/** A job nobody asks about is dropped after this long; one whose result was read after `FETCHED_GRACE_MS`. */
export const PRINTOUT_JOB_TTL_MS = 10 * 60_000
const FETCHED_GRACE_MS = 60_000
/**
 * Jobs one account may hold at once (running or waiting to be read); each runs Chromium. The jobs live in the
 * process, their count in the shared storage, so an account whose requests reach several instances still holds
 * three in all (ADR-0109).
 */
export const MAX_PRINTOUT_JOBS_PER_USER = 3

const placesOf = (userId: string): string => `printout-jobs:${userId}`

/**
 * Manages asynchronous PDF rendering jobs (ADR-0056: Fault Isolation).
 * Decouples heavy Headless Chromium generation from the synchronous HTTP request-response cycle.
 */
@Injectable()
export class PrintoutJobService {
  private readonly jobs = new Map<string, InternalJob>()

  private readonly places: ResettableRateLimitStorage

  constructor(
    @Inject(PrintoutService) private readonly printoutService: PrintoutService,
    @Optional() @Inject(BETTER_AUTH_BUNDLE) bundle?: BetterAuthBundle,
  ) {
    // Without the bundle (a unit test) the count lives in this process, like the jobs.
    this.places = bundle?.rateLimitStorage ?? createResettableRateLimitStorage({ redisUrl: '' })
  }

  async queueExport(userId: string, year: number, options: { editable?: boolean }): Promise<PrintoutJobDto> {
    return withSpan('printout_job.queue', async () => {
      this.evictExpired()
      const jobId = `job_${crypto.randomUUID()}`
      if (!(await this.places.hold(placesOf(userId), jobId, PRINTOUT_JOB_TTL_MS / 1000, MAX_PRINTOUT_JOBS_PER_USER))) {
        throw new TooManyRequestsError('PRINTOUT_JOBS_BUSY', 'Es laufen schon mehrere Ausdrucke. Warte, bis sie fertig sind, und versuch es noch mal.', { retryAfterSeconds: 15 })
      }
      const statusUrl = `/v1/steuerjahre/${year}/ausdruck/jobs/${jobId}`
      const downloadUrl = `/v1/steuerjahre/${year}/ausdruck${options.editable ? '?bearbeitbar=true' : ''}`

      const job: InternalJob = {
        id: jobId,
        userId,
        year,
        status: 'queued',
        downloadUrl,
        expiresAt: Date.now() + PRINTOUT_JOB_TTL_MS,
      }
      this.jobs.set(jobId, job)

      // Asynchronously trigger rendering in the event loop queue without blocking the HTTP thread
      setImmediate(() => {
        void this.processJob(jobId, options)
      })

      return {
        jobId,
        status: 'queued',
        statusUrl,
      }
    }, { 'tax.year': year, 'user.id': userId })
  }

  async getJobStatus(userId: string, year: number, jobId: string): Promise<PrintoutJobDto> {
    this.evictExpired()
    const job = this.jobs.get(jobId)
    if (!job || job.userId !== userId || job.year !== year) {
      throw new NotFoundException(`Printout job ${jobId} not found`)
    }
    // The result was read: the job stays a minute for a retry whose answer got lost, then goes.
    if (job.status === 'completed' || job.status === 'failed') {
      job.expiresAt = Math.min(job.expiresAt, Date.now() + FETCHED_GRACE_MS)
      await this.places.release(placesOf(userId), job.id, FETCHED_GRACE_MS / 1000)
    }

    const result: PrintoutJobDto = {
      jobId: job.id,
      status: job.status,
      statusUrl: `/v1/steuerjahre/${year}/ausdruck/jobs/${job.id}`,
      ...(job.status === 'completed' && job.downloadUrl ? { downloadUrl: job.downloadUrl } : {}),
      ...(job.error ? { error: job.error } : {}),
    }
    return result
  }

  private async processJob(jobId: string, options: { editable?: boolean }): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.status = 'processing'
    try {
      // The bytes are not kept: the download URL renders again, so holding them only cost memory.
      await this.printoutService.create(job.userId, job.year, options)
      job.status = 'completed'
    } catch (err) {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : String(err)
    }
  }

  /** Lazily, on every call: no timer, so nothing keeps the process busy and a scaled-to-zero instance forgets with it. */
  private evictExpired(): void {
    const now = Date.now()
    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= now) this.jobs.delete(id)
    }
  }
}
