import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { PRODUCT_LIMITS, RETENTION, formatCount, formatGigabytes, formatMegabytes } from '@steuereule/core'
import { buildSite } from '../build'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(ROOT, '../..')
const APP = 'https://app.example.test'

/** Every route path of the app's root navigator (`linking.ts`), e.g. `login`, `rechtliches/:page`. */
function appRoutes(): string[] {
  const source = readFileSync(path.join(REPO, 'apps/mobile-web/src/navigation/linking.ts'), 'utf8')
  const block = /const rootScreens[^{]*\{([\s\S]*?)\n\}/.exec(source)![1]!
  return [...block.matchAll(/^\s+\w+: '([^']*)',$/gm)].map((m) => m[1]!)
}

/** The pages `/rechtliches/:page` serves (`LEGAL_PAGES` in the app's legal texts). */
function legalPages(): string[] {
  const source = readFileSync(path.join(REPO, 'apps/mobile-web/src/screens/legal/texts.ts'), 'utf8')
  const list = /export const LEGAL_PAGES[^=]*= \[([^\]]*)\]/.exec(source)![1]!
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

function resolvesInApp(pathname: string): boolean {
  const segments = pathname.replace(/^\//, '').split('/')
  return appRoutes().some((route) => {
    const parts = route.split('/')
    if (parts.length !== segments.length) return false
    return parts.every((part, i) => (part === ':page' ? legalPages().includes(segments[i]!) : part === segments[i]))
  })
}

/** Every URL the page can make the browser load or follow: attributes, CSS url() and @import. */
function urls(html: string): string[] {
  const attributes = [...html.matchAll(/\s(?:href|src|srcset|action|poster|data)="([^"]*)"/g)].map((m) => m[1]!)
  const css = [...html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]!)
  const imports = [...html.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
  return [...attributes, ...css, ...imports]
}

/**
 * Euro amounts the page may print because they are no price of ours: the example refund in the mock, and the
 * employee lump sum the build prints from the tax parameters. Anything else with a currency fails.
 */
function notAPrice(html: string): string[] {
  const lumpSum = /Arbeitnehmer-Pauschbetrag von ([\d.]+\s€)/.exec(html)?.[1]
  return ['1.300 – 1.600 €', ...(lumpSum ? [lumpSum] : [])]
}

const isAbsolute = (url: string) => /^(?:[a-z]+:)?\/\//i.test(url)

function build(appOrigin: string): { dir: string; html: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'steuereule-website-'))
  buildSite({ outDir: dir, appOrigin })
  return { dir, html: readFileSync(path.join(dir, 'index.html'), 'utf8') }
}

describe('website build', () => {
  let dir = ''
  let html = ''
  beforeAll(() => {
    ;({ dir, html } = build(APP))
  })

  it('writes a self-contained page: no placeholder left, tokens inlined, no stylesheet or script to fetch', () => {
    expect(html).not.toMatch(/\{\{\w+\}\}/)
    expect(html).toContain('--funke:')
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/)
    expect(html).not.toMatch(/<script/)
    expect(html).not.toMatch(/@font-face|@import/)
  })

  it('requests nothing from a third-party origin (SITE-4): every absolute URL is the app', () => {
    const absolute = urls(html).filter(isAbsolute)
    expect(absolute.length).toBeGreaterThan(0)
    expect(absolute.filter((u) => !u.startsWith(`${APP}/`))).toEqual([])
    expect(html).not.toMatch(/googleapis|gstatic|cdn\./)
  })

  it('every internal link resolves: anchors to ids, files to dist, app links to app routes (SITE-2)', () => {
    const broken: string[] = []
    for (const url of urls(html)) {
      if (url.startsWith('#')) {
        if (!html.includes(`id="${url.slice(1)}"`)) broken.push(url)
      } else if (url.startsWith(`${APP}/`)) {
        if (!resolvesInApp(new URL(url).pathname)) broken.push(url)
      } else if (!existsSync(path.join(dir, url))) {
        broken.push(url)
      }
    }
    expect(broken).toEqual([])
  })

  it('links imprint, privacy policy, terms and notices on the app’s legal routes', () => {
    for (const page of legalPages()) expect(html).toContain(`href="${APP}/rechtliches/${page}"`)
  })

  it('shows the beta notice (WEB-20)', () => {
    expect(html).toMatch(/data-testid="beta-hinweis"><b>Beta<\/b>SteuerEule ist in der Testphase/)
  })

  it('prints limits and retention from the shared constants', () => {
    const limits = /data-testid="grenzen">([^<]*)</.exec(html)![1]!
    expect(limits).toContain(`bis ${formatCount(PRODUCT_LIMITS.receiptFilesPerAccount)} Dateien mit zusammen ${formatGigabytes(PRODUCT_LIMITS.receiptBytesPerAccount)}`)
    expect(limits).toContain(`höchstens ${formatMegabytes(PRODUCT_LIMITS.receiptFileBytes)}`)
    expect(limits).toContain(`bis ${formatCount(PRODUCT_LIMITS.receiptsPerAccount)} Belege`)
    expect(limits).toContain(`${PRODUCT_LIMITS.receiptReadsPerDay} Belegauslesungen`)
    expect(limits).toContain(`${PRODUCT_LIMITS.advisorMessagesPerMinute} Nachrichten pro Minute`)
    expect(limits).toContain(`${PRODUCT_LIMITS.advisorConversationsPerYear} Gespräche`)
    expect(html).toContain(`nach ${RETENTION.guestDataDays} Tagen ohne Änderung`)
    // The amount lives in the Stripe price: the page names no price of its own (ADR-0111 decision 1), in any
    // spelling, and that includes "0 €". The price section carries no amount at all; elsewhere the only euro
    // amounts are tax figures that are no price: the example refund in the mock and allowances from the law.
    expect(html).not.toMatch(/\d+,\d\d\s*€/)
    const priceSection = html.slice(html.indexOf('class="preis"'))
    expect(priceSection.length).toBeGreaterThan(0)
    expect(priceSection.slice(0, priceSection.indexOf('</section>'))).not.toMatch(/€|&euro;|\bEUR\b|\bEuro\b/i)
    const amounts = [...html.replace(/<[^>]+>/g, ' ').matchAll(/[\d.,–\s-]*\d\s*(?:€|EUR\b|Euro\b)/g)].map((match) => match[0].trim())
    expect(amounts.filter((amount) => !notAPrice(html).includes(amount))).toEqual([])
  })

  it('keeps none of the claims the code contradicts (SITE-3, SITE-5, SITE-6, SITE-7, H2-38)', () => {
    for (const claim of [
      'Server in Deutschland',
      'Server: Deutschland',
      'nur auf deinem Gerät',
      'unbegrenzt',
      'Unter 50 €',
      'Kalender-Import',
      'Zeile für Zeile',
      'formulieren den Einspruch',
      '1 Tap',
      'ein Tap',
      '1.100 €',
      '79,99',
      'Modell-Trainings',
      'kommen später',
      'ERiC',
      '/legal/',
      // Graphit: the owl has no colour of its own, and the old claim is gone from the page.
      'violett',
      'Violett',
      'Zack',
    ]) {
      expect(html, claim).not.toContain(claim)
    }
  })

  it('with relative app links the page holds no absolute URL at all', () => {
    expect(urls(build('').html).filter(isAbsolute)).toEqual([])
  })

  it('refuses an app origin that is not an origin', () => {
    expect(() => build('https://app.example.test/pfad')).toThrow(/WEBSITE_APP_ORIGIN/)
  })
})
