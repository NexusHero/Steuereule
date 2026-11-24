// Builds the marketing site into a static `dist/` (SITE-1): one HTML file with the design tokens and the
// page styles inlined, plus the two brand marks. Everything the page states as a figure comes from
// @steuereule/core (limits, retention, hosting, model providers, the employee lump sum), so the page
// cannot promise more than the API enforces. No web font, no CDN: the page requests nothing from a third
// party (SITE-4). Links into the app go to `WEBSITE_APP_ORIGIN` (the app's own origin); unset, they stay
// relative, which only works when the site is served from the app's origin.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOSTING,
  MODEL_PROVIDERS,
  PRODUCT_LIMITS,
  RETENTION,
  formatCount,
  formatGigabytes,
  formatMegabytes,
  getTaxYearParameters,
} from '@steuereule/core'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = ['marke-tinte.svg', 'marke-funke.svg'] as const
/** The tax year whose lump sum the page quotes: the latest year the app prints forms for. */
const LUMP_SUM_YEAR = 2025

export interface BuildOptions {
  readonly outDir: string
  /** The app's origin, e.g. `https://app.example.de`, without a trailing slash; '' for relative links. */
  readonly appOrigin: string
}

function euro(amount: number): string {
  return `${amount.toLocaleString('de-DE')} €`
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function companyList(): string {
  const names = MODEL_PROVIDERS.map((p) => p.company)
  return `${names.slice(0, -1).join(', ')} oder ${names.at(-1)}`
}

/** The values the template's `{{name}}` placeholders take; text values are HTML-escaped. */
export function siteValues(appOrigin: string): Readonly<Record<string, string>> {
  const countries = [...new Set(MODEL_PROVIDERS.map((p) => p.country))].join(', ')
  return {
    app: appOrigin,
    employeeLumpSum: euro(getTaxYearParameters(LUMP_SUM_YEAR).lumpSums.employee),
    lumpSumYear: String(LUMP_SUM_YEAR),
    hostingProvider: HOSTING.provider,
    hostingRegion: HOSTING.region,
    hostingCountry: HOSTING.country,
    modelProviders: companyList(),
    modelCountries: countries,
    guestDataDays: String(RETENTION.guestDataDays),
    receiptFiles: formatCount(PRODUCT_LIMITS.receiptFilesPerAccount),
    receiptBytes: formatGigabytes(PRODUCT_LIMITS.receiptBytesPerAccount),
    receiptFileSize: formatMegabytes(PRODUCT_LIMITS.receiptFileBytes),
    receipts: formatCount(PRODUCT_LIMITS.receiptsPerAccount),
    receiptReads: formatCount(PRODUCT_LIMITS.receiptReadsPerDay),
    advisorPerMinute: formatCount(PRODUCT_LIMITS.advisorMessagesPerMinute),
    advisorConversations: formatCount(PRODUCT_LIMITS.advisorConversationsPerYear),
  }
}

function tokensCss(): string {
  const require = createRequire(import.meta.url)
  return readFileSync(require.resolve('@steuereule/tokens/css'), 'utf8')
}

export function renderPage(appOrigin: string): string {
  if (appOrigin !== '' && !/^https?:\/\/[^/]+$/.test(appOrigin)) {
    throw new Error(`WEBSITE_APP_ORIGIN must be an origin like https://app.example.de, got "${appOrigin}"`)
  }
  const template = readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')
  const styles = `${tokensCss()}\n${readFileSync(path.join(ROOT, 'src/site.css'), 'utf8')}`
  const values: Record<string, string> = { ...siteValues(appOrigin) }
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (name === 'styles') return styles
    const value = values[name]
    if (value === undefined) throw new Error(`Unknown placeholder {{${name}}} in src/index.html`)
    return escapeHtml(value)
  })
}

export function buildSite({ outDir, appOrigin }: BuildOptions): void {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(path.join(outDir, 'assets'), { recursive: true })
  writeFileSync(path.join(outDir, 'index.html'), renderPage(appOrigin))
  for (const asset of ASSETS) copyFileSync(path.join(ROOT, 'assets', asset), path.join(outDir, 'assets', asset))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appOrigin = (process.env.WEBSITE_APP_ORIGIN ?? '').trim().replace(/\/$/, '')
  if (appOrigin === '') console.warn('WEBSITE_APP_ORIGIN is not set: links into the app stay relative.')
  buildSite({ outDir: path.join(ROOT, 'dist'), appOrigin })
  console.log(`Built ${path.join(ROOT, 'dist')}`)
}
