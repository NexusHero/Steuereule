import { Inject, Injectable, NotFoundException } from '@nestjs/common'
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
  pdf?: Buffer
}

/**
 * Manages asynchronous PDF rendering jobs (ADR-0056: Fault Isolation).
 * Decouples heavy Headless Chromium generation from the synchronous HTTP request-response cycle.
 */
@Injectable()
export class PrintoutJobService {
  private readonly jobs = new Map<string, InternalJob>()

  constructor(@Inject(PrintoutService) private readonly printoutService: PrintoutService) {}

  async queueExport(userId: string, year: number, options: { editable?: boolean }): Promise<PrintoutJobDto> {
    return withSpan('printout_job.queue', async () => {
      const jobId = `job_${crypto.randomUUID()}`
      const statusUrl = `/v1/steuerjahre/${year}/ausdruck/jobs/${jobId}`
      const downloadUrl = `/v1/steuerjahre/${year}/ausdruck${options.editable ? '?bearbeitbar=true' : ''}`

      const job: InternalJob = {
        id: jobId,
        userId,
        year,
        status: 'queued',
        downloadUrl,
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
    const job = this.jobs.get(jobId)
    if (!job || job.userId !== userId || job.year !== year) {
      throw new NotFoundException(`Printout job ${jobId} not found`)
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
      const pdf = await this.printoutService.create(job.userId, job.year, options)
      job.pdf = Buffer.from(pdf)
      job.status = 'completed'
    } catch (err) {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : String(err)
    }
  }
}
