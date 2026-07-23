// Reuse, not a new dependency (ADR-0013 §7): `playwright-core` already renders
// headless Chromium in this monorepo (e2e/cross-origin/run.mjs's cross-origin CORS
// smoke gate) — this adds the same library as a direct dependency of the API, because
// unlike that e2e package's CI-only smoke test, PdfRenderer runs at real request time,
// not just in CI/tests. No `pdfkit`/`pdf-lib`/standalone-`puppeteer`-class dependency
// is introduced (the ADR-0013 ruling this reuse satisfies).
//
// The browser is launched once, on module lifecycle (mirroring PrismaService's
// connection pattern — see prisma.service.ts), and a fresh page opened/closed per
// render: cheaper than a cold browser launch per request, while every render still
// gets an isolated page with no state leaking between callers' documents.
//
// Honest infra note (ADR-0013 §7, a tracked follow-up, not a blocker here): Chromium
// is a genuine runtime dependency of PdfRenderer from this point on — the API's
// production image must bundle the Chromium binary (today it's fetched into dev/CI
// caches via `playwright-core install chromium`). This seam keeps the concrete engine
// swappable if bundling Chromium proves too heavy for the deploy target.
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { chromium, type Browser } from 'playwright-core'
import type { PdfRenderer } from './pdf-renderer.js'

@Injectable()
export class PlaywrightPdfRenderer implements PdfRenderer, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightPdfRenderer.name)
  private browser: Browser | undefined
  private launching: Promise<Browser> | undefined

  async onModuleInit(): Promise<void> {
    // Launched eagerly so the first real request never pays the cold-start cost, but
    // failure here must not crash app boot (e.g. a dev box without the Chromium
    // binary installed yet) — renderPdf() re-attempts the launch lazily instead.
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
    this.launching ??= this.launch()
    this.browser = await this.launching
    return this.browser
  }

  private launch(): Promise<Browser> {
    return chromium.launch({ headless: true })
  }
}
