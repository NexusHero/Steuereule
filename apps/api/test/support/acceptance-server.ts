// Boots the real app for a DB-gated acceptance or integration suite: `buildApp()` from
// src/main.ts on an ephemeral loopback port (never `.inject()`), the app's own PrismaService,
// both rate limiters reset and the suite's own rows deleted after every case, the app closed
// at the end.
//
// The environment is applied the moment `useAcceptanceServer()` is called — while the test
// file is still being collected — and src/main.js is only imported inside `beforeAll`. The app
// must never be loaded before the suite's own secrets and URLs are in place, so this module
// imports nothing from src/ that reads the environment at load time.
//
// `app`, `baseUrl` and `prisma` are live bindings of the one server of the importing test
// file (Vitest isolates modules per file); they are set once `beforeAll` has run.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, expect } from 'vitest'
import { resetRateLimiters } from './reset-rate-limiters.js'

export let app: NestFastifyApplication
export let baseUrl: string
export let prisma: PrismaClient

export interface AcceptanceServerOptions {
  /** Set on `process.env` before the app is imported; every suite passes its own secrets and URL. */
  readonly env: Readonly<Record<string, string>> & { readonly CORS_ALLOWED_ORIGINS: string }
  /** Deletes the rows the suite's cases leave behind; runs after every case, after the rate limiters are reset. */
  readonly cleanup: () => Promise<void>
}

export function useAcceptanceServer(options: AcceptanceServerOptions): void {
  Object.assign(process.env, options.env)

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    resetRateLimiters(app)
    await options.cleanup()
  })

  afterAll(async () => {
    await app.close()
  })
}

/**
 * Signs up a fresh account over real HTTP and returns its session cookie and userId. Node's
 * fetch() sends Sec-Fetch-Mode, so the call carries the allowed Origin like a real browser.
 */
export async function signUp(
  email: string,
  account: { readonly password?: string; readonly name?: string } = {},
): Promise<{ cookie: string; userId: string }> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: process.env.CORS_ALLOWED_ORIGINS! },
    body: JSON.stringify({ email, password: account.password ?? 'a-fine-strong-password-1', name: account.name ?? 'Test User' }),
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { user: { id: string } }
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!
  return { cookie, userId: body.user.id }
}
