import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { chromium, type Browser } from 'playwright-core'
import {
  computeAdaptivePdfConcurrency,
  detectContainerMemoryBytes,
  isUnderMemoryPressure,
} from '../../config/runtime-capacity.js'
import type { PdfRenderer } from './pdf-renderer.js'

@Injectable()
export class PlaywrightPdfRenderer implements PdfRenderer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightPdfRenderer.name)
  protected readonly containerMemoryBytes: number = detectContainerMemoryBytes()
  protected readonly maxConcurrentRenders: number = computeAdaptivePdfConcurrency({
    containerMemoryBytes: this.containerMemoryBytes,
  })
  private browser: Browser | undefined
  private launching: Promise<Browser> | undefined
  private activeRenders = 0
  private readonly waitQueue: Array<() => void> = []

  async onModuleInit(): Promise<void> {
    try {
      this.browser = await this.launch()
    } catch (error) {
      this.logger.warn(
        `Chromium did not launch at boot (PDF export will retry lazily on first use): ${String(error)}`,
      )
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close()
  }

  async renderPdf(html: string): Promise<Buffer> {
    const browser = this.browser ?? (await this.getOrLaunch())
    await this.acquireRenderSlot()
    try {
      const page = await browser.newPage()
      try {
        await page.setContent(html, { waitUntil: 'load' })
        return await page.pdf({ format: 'A4', printBackground: true })
      } finally {
        await page.close()
      }
    } finally {
      this.releaseRenderSlot()
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
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve)
    })
  }

  private releaseRenderSlot(): void {
    this.activeRenders -= 1
    while (this.waitQueue.length > 0 && this.canStartRenderNow()) {
      const next = this.waitQueue.shift()!
      this.activeRenders += 1
      next()
    }
  }

  private async getOrLaunch(): Promise<Browser> {
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
