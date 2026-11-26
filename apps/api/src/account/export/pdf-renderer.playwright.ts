import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { chromium, type Browser } from 'playwright-core'
import {
  computeAdaptivePdfConcurrency,
  detectContainerMemoryBytes,
  isUnderMemoryPressure,
} from '../../config/runtime-capacity.js'
import { UnavailableError } from '../../common/domain-error.js'
import type { PdfRenderer } from './pdf-renderer.js'

const RETRY_AFTER_SECONDS = 30

/** The only resources the export page may load: those written into the HTML itself. */
export function isInlineResource(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('blob:')
}

@Injectable()
export class PlaywrightPdfRenderer implements PdfRenderer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightPdfRenderer.name)
  protected readonly containerMemoryBytes: number = detectContainerMemoryBytes()
  protected readonly maxConcurrentRenders: number = computeAdaptivePdfConcurrency({
    containerMemoryBytes: this.containerMemoryBytes,
  })
  private browser: Browser | undefined
  private launching: Promise<Browser> | undefined
  /** Set once on shutdown: from then on no launch starts, and none that is in flight is left running (#290). */
  private destroyed = false
  private activeRenders = 0
  private readonly waitQueue: Array<{ start: () => void; timer: NodeJS.Timeout }> = []
  /** Exports waiting for a Chromium slot; more are turned away at once instead of piling up in memory (ADR-0109). */
  protected readonly maxQueuedRenders: number = 8
  protected readonly queueWaitMs: number = 30_000
  /** A render that has not produced bytes by now is abandoned, so a stuck page cannot hold a slot for ever. */
  protected readonly renderTimeoutMs: number = 60_000

  async onModuleInit(): Promise<void> {
    try {
      await this.getOrLaunch()
    } catch (error) {
      this.logger.warn(
        `Chromium did not launch at boot (PDF export will retry lazily on first use): ${String(error)}`,
      )
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true
    const launching = this.launching
    const launched = this.browser
    await launched?.close()
    // A launch still in flight lands after this method would have returned, and its browser would never be
    // closed: wait for it and close what it yields (the one already closed above is not closed twice).
    const late = await launching?.catch(() => undefined)
    if (late !== undefined && late !== launched) await late.close()
  }

  private assertRunning(): void {
    if (this.destroyed) throw new UnavailableError('EXPORT_SHUTTING_DOWN', 'Der Server wird gerade beendet. Versuch es gleich noch mal.', { retryAfterSeconds: RETRY_AFTER_SECONDS })
  }

  async renderPdf(html: string): Promise<Buffer> {
    this.assertRunning()
    const browser = this.browser ?? (await this.getOrLaunch())
    await this.acquireRenderSlot()
    try {
      return await this.render(browser, html)
    } catch (error) {
      this.forgetDeadBrowser(browser)
      throw error
    } finally {
      this.releaseRenderSlot()
    }
  }

  /**
   * A failed render leaves the cached handle in place when the document was bad and the browser is fine; one
   * whose connection is gone is dropped, with the launch promise that produced it, so the next call launches
   * a new one instead of failing on the dead handle for the life of the process (#288).
   */
  private forgetDeadBrowser(browser: Browser): void {
    if (browser.isConnected() || this.browser !== browser) return
    this.browser = undefined
    this.launching = undefined
  }

  private async render(browser: Browser, html: string): Promise<Buffer> {
    // Defence in depth (API-7): the export HTML is escaped, but should a value ever slip through, it runs no
    // script and fetches nothing. Only inline data: and blob: resources load.
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
    await context.route('**/*', (route) => (isInlineResource(route.request().url()) ? route.continue() : route.abort('blockedbyclient')))
    const page = await context.newPage()
    let timer: NodeJS.Timeout | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new UnavailableError('EXPORT_RENDER_TIMEOUT', 'Der PDF-Export hat zu lange gedauert. Versuch es später noch mal.', { retryAfterSeconds: RETRY_AFTER_SECONDS })),
          this.renderTimeoutMs,
        )
      })
      const render = (async (): Promise<Buffer> => {
        await page.setContent(html, { waitUntil: 'load', timeout: this.renderTimeoutMs })
        return page.pdf({ format: 'A4', printBackground: true })
      })()
      // The losing branch must not become an unhandled rejection (closing the page rejects it).
      render.catch(() => undefined)
      return await Promise.race([render, timeout])
    } finally {
      clearTimeout(timer)
      await page.close().catch(() => undefined)
      await context.close().catch(() => undefined)
    }
  }

  protected hasMemoryHeadroom(): boolean {
    return !isUnderMemoryPressure({ containerMemoryBytes: this.containerMemoryBytes })
  }

  private canStartRenderNow(): boolean {
    if (this.activeRenders === 0) {
      // Always allow at least 1 render so the queue can never deadlock.
      return true
    }
    return this.activeRenders < this.maxConcurrentRenders && this.hasMemoryHeadroom()
  }

  private acquireRenderSlot(): Promise<void> {
    if (this.canStartRenderNow()) {
      this.activeRenders += 1
      return Promise.resolve()
    }
    if (this.waitQueue.length >= this.maxQueuedRenders) throw this.busy()
    return new Promise<void>((resolve, reject) => {
      const entry = {
        start: resolve,
        timer: setTimeout(() => {
          this.waitQueue.splice(this.waitQueue.indexOf(entry), 1)
          reject(this.busy())
        }, this.queueWaitMs),
      }
      this.waitQueue.push(entry)
    })
  }

  private releaseRenderSlot(): void {
    this.activeRenders -= 1
    while (this.waitQueue.length > 0 && this.canStartRenderNow()) {
      const next = this.waitQueue.shift()!
      clearTimeout(next.timer)
      this.activeRenders += 1
      next.start()
    }
  }

  private busy(): UnavailableError {
    return new UnavailableError('EXPORT_BUSY', 'Gerade werden viele Exporte erstellt. Versuch es in einer Minute noch mal.', { retryAfterSeconds: RETRY_AFTER_SECONDS })
  }

  private async getOrLaunch(): Promise<Browser> {
    this.assertRunning()
    if (this.browser) return this.browser
    this.launching ??= this.launch().catch((error: unknown) => {
      this.launching = undefined
      throw error
    })
    this.browser = await this.launching
    return this.browser
  }

  protected launch(): Promise<Browser> {
    return chromium.launch({ headless: true })
  }
}
