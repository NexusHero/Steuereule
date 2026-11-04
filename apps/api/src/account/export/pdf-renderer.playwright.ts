import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { chromium, type Browser } from 'playwright-core'
import type { PdfRenderer } from './pdf-renderer.js'

@Injectable()
export class PlaywrightPdfRenderer implements PdfRenderer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightPdfRenderer.name)
  private browser: Browser | undefined
  private launching: Promise<Browser> | undefined

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
    const page = await browser.newPage()
    try {
      await page.setContent(html, { waitUntil: 'load' })
      return await page.pdf({ format: 'A4', printBackground: true })
    } finally {
      await page.close()
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
