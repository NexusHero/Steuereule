import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOSTING, MODEL_PROVIDERS, PRODUCT_LIMITS, RETENTION } from '@steuereule/core'
import { MAX_CONVERSATIONS_PER_YEAR } from '../src/advisor/advisor-shared.js'
import { AdvisorController } from '../src/advisor/advisor.controller.js'
import { SESSION_ABSOLUTE_MAX_AGE_MS, SESSION_IDLE_EXPIRES_IN_SECONDS } from '../src/auth/session-lifetime.js'
import { COOKIE_MAX_AGE_SECONDS } from '../src/auth/user-context.guard.js'
import { GUEST_RETENTION_DAYS } from '../src/guest/guest-retention.js'
import { DEFAULT_PARSE_DAILY_LIMIT } from '../src/receipt/receipt-parse.controller.js'
import { MAX_RECEIPT_BYTES_PER_ACCOUNT, MAX_RECEIPT_FILES_PER_ACCOUNT, MAX_RECEIPTS_PER_ACCOUNT } from '../src/receipt/receipt.service.js'
import { MAX_RECEIPT_FILE_BYTES } from '../src/receipt/storage/magic-bytes.js'

// The privacy text and the website print `PRODUCT_LIMITS` and `RETENTION` from @steuereule/core (P9). This
// test keeps the constants the API enforces equal to those printed figures: a changed limit fails here
// until the shared figure (and with it every text) changes too.
const DAY_SECONDS = 24 * 60 * 60

describe('the figures the texts print are the figures the API enforces', () => {
  it('receipt limits', () => {
    expect(MAX_RECEIPT_FILE_BYTES).toBe(PRODUCT_LIMITS.receiptFileBytes)
    expect(MAX_RECEIPT_FILES_PER_ACCOUNT).toBe(PRODUCT_LIMITS.receiptFilesPerAccount)
    expect(MAX_RECEIPT_BYTES_PER_ACCOUNT).toBe(PRODUCT_LIMITS.receiptBytesPerAccount)
    expect(MAX_RECEIPTS_PER_ACCOUNT).toBe(PRODUCT_LIMITS.receiptsPerAccount)
    expect(DEFAULT_PARSE_DAILY_LIMIT).toBe(PRODUCT_LIMITS.receiptReadsPerDay)
  })

  it('owl limits', () => {
    expect(MAX_CONVERSATIONS_PER_YEAR).toBe(PRODUCT_LIMITS.advisorConversationsPerYear)
    const handler = AdvisorController.prototype.sendMessage
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(PRODUCT_LIMITS.advisorMessagesPerMinute)
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000)
  })

  it('retention periods', () => {
    expect(GUEST_RETENTION_DAYS).toBe(RETENTION.guestDataDays)
    expect(COOKIE_MAX_AGE_SECONDS).toBe(RETENTION.guestCookieDays * DAY_SECONDS)
    expect(SESSION_IDLE_EXPIRES_IN_SECONDS).toBe(RETENTION.sessionIdleDays * DAY_SECONDS)
    expect(SESSION_ABSOLUTE_MAX_AGE_MS).toBe(RETENTION.sessionAbsoluteDays * DAY_SECONDS * 1000)
  })

  it('backup periods match the Cloud SQL configuration', () => {
    const main = readFileSync(new URL('../../../infra/gcp/main.tf', import.meta.url), 'utf8')
    const backups = [...main.matchAll(/retained_backups\s*=\s*(\d+)/g)].map((m) => Number(m[1]))
    const pitr = [...main.matchAll(/transaction_log_retention_days\s*=\s*(\d+)/g)].map((m) => Number(m[1]))
    // The tax-data instance comes first in main.tf, the receipt key store second.
    expect(backups).toEqual([RETENTION.databaseBackups, RETENTION.keystoreBackups])
    expect(pitr).toEqual([RETENTION.databasePitrDays, RETENTION.keystorePitrDays])
  })

  it('hosting region matches the Terraform default', () => {
    const variables = readFileSync(new URL('../../../infra/gcp/variables.tf', import.meta.url), 'utf8')
    expect(/variable "region" \{[^}]*default\s*=\s*"([^"]+)"/.exec(variables)?.[1]).toBe(HOSTING.region)
  })

  it('model providers: every provider the runtime config can resolve is named', () => {
    const source = readFileSync(new URL('../src/ki/ai-runtime-config.service.ts', import.meta.url), 'utf8')
    const kinds = /export type AiProviderKind = ([^\n]+)/.exec(source)![1]!
    const real = [...kinds.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((k) => k !== 'deterministic' && k !== 'fake')
    expect(real.sort()).toEqual(MODEL_PROVIDERS.map((p) => p.id).sort())
  })

  it('sign-in providers: every provider the auth setup can switch on is a named recipient in the privacy text', () => {
    const auth = readFileSync(new URL('../src/auth/better-auth.ts', import.meta.url), 'utf8')
    const privacy = readFileSync(new URL('../../mobile-web/src/screens/legal/texts.ts', import.meta.url), 'utf8')
    const providers = [...new Set([...auth.matchAll(/socialProviders\.([a-z]+)\s*=/g)].map((match) => match[1] ?? ''))].sort()
    expect(providers).toEqual(['apple', 'google'])
    const recipient: Record<string, string> = { apple: 'Apple Distribution International Ltd.', google: 'Google Ireland Ltd.' }
    for (const provider of providers) expect(privacy, provider).toContain(recipient[provider] ?? `no recipient known for ${provider}`)
  })
})
