// HTTP face of #476: SSE with sequence ids, re-attaching to a run, stop, feedback and clearing.
// Fake repositories and a scripted engine; the controller, guards' seams and the SSE writer are real.
import { ValidationPipe, type ExecutionContext } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'
import type { AdvisorStreamEvent } from '@steuereule/core'
import { afterEach, describe, expect, it } from 'vitest'
import { AdvisorController, FastifyThrottlerGuard } from '../src/advisor/advisor.controller.js'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { InMemoryAdvisorRunLog } from '../src/advisor/run/advisor-run-log.js'
import { AdvisorRunService } from '../src/advisor/run/advisor-run.service.js'
import { BETTER_AUTH_BUNDLE } from '../src/auth/auth.tokens.js'
import { AUTH_CONTEXT_REQUEST_KEY, USER_ID_KIND_REQUEST_KEY, USER_ID_REQUEST_KEY, UserContextGuard } from '../src/auth/user-context.guard.js'
import { DomainErrorFilter } from '../src/common/domain-error.filter.js'
import { buildAdvisorTestKit, doneEvent, ScriptedAdvisorEngine, type ScriptStep } from './fakes/advisor-test-kit.js'

const token = (text: string): AdvisorStreamEvent => ({ event: 'token', data: { text } })
const BASE = '/v1/steuerjahre/2025/advisor'

interface SseFrame {
  readonly id: number | null
  readonly event: string
  readonly data: unknown
}

function parseSse(body: string): SseFrame[] {
  return body
    .split('\n\n')
    .map((block) => block.split('\n').filter((line) => !line.startsWith(':')))
    .filter((lines) => lines.some((line) => line.startsWith('event:')))
    .map((lines) => {
      const field = (name: string): string | undefined => lines.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim()
      const id = field('id')
      return { id: id === undefined ? null : Number(id), event: field('event')!, data: JSON.parse(field('data') ?? 'null') as unknown }
    })
}

let app: NestFastifyApplication | undefined
let currentUser = 'user-http-1'

async function boot(script: readonly ScriptStep[]) {
  const kit = buildAdvisorTestKit(new ScriptedAdvisorEngine(script))
  const runs = new AdvisorRunService(kit.service, new InMemoryAdvisorRunLog(), kit.advisorRepo)
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }])],
    controllers: [AdvisorController],
    providers: [
      { provide: AdvisorService, useValue: kit.service },
      { provide: AdvisorRunService, useValue: runs },
      { provide: BETTER_AUTH_BUNDLE, useValue: { sessionCookieName: 'se.session', auth: { api: { getSession: async () => null } } } },
      { provide: APP_FILTER, useClass: DomainErrorFilter },
      UserContextGuard,
    ],
  })
    .overrideGuard(UserContextGuard)
    .useValue({
      canActivate(ctx: ExecutionContext) {
        const req = ctx.switchToHttp().getRequest<Record<string, unknown>>()
        req[USER_ID_REQUEST_KEY] = currentUser
        req[USER_ID_KIND_REQUEST_KEY] = 'session'
        req[AUTH_CONTEXT_REQUEST_KEY] = { source: 'nutzer' }
        return true
      },
    })
    .overrideGuard(FastifyThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile()

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  await app.init()
  await app.listen(0, '127.0.0.1')
  const baseUrl = await app.getUrl()

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${baseUrl}${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  return { ...kit, runs, call }
}

afterEach(async () => {
  await app?.close()
  app = undefined
  currentUser = 'user-http-1'
})

describe('Advisor runs over HTTP (#476)', () => {
  it('streams a new run with a gapless SSE id per event, opening with start', async () => {
    const { call } = await boot([token('Hal'), token('lo'), doneEvent({ replyText: 'Hallo' })])
    const res = await call('POST', '/stream', { message: 'Hi' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const frames = parseSse(await res.text())
    expect(frames.map((f) => f.id)).toEqual(frames.map((_, i) => i + 1))
    expect(frames[0]!.event).toBe('start')
    expect(frames.at(-1)!.event).toBe('done')
    expect((frames.at(-1)!.data as { assistantMessage: { status: string } }).assistantMessage.status).toBe('complete')
  })

  it('re-attaches with Last-Event-ID and gets exactly the events after it', async () => {
    const { call } = await boot([token('a'), token('b'), token('c'), doneEvent({ replyText: 'abc' })])
    const all = parseSse(await (await call('POST', '/stream', { message: 'Hi' })).text())
    const runId = (all[0]!.data as { runId: string }).runId

    const resumed = parseSse(await (await call('GET', `/runs/${runId}/events`, undefined, { 'Last-Event-ID': '3' })).text())
    expect(resumed).toEqual(all.slice(3))

    const viaQuery = parseSse(await (await call('GET', `/runs/${runId}/events?after=${all.length - 1}`)).text())
    expect(viaQuery).toEqual(all.slice(-1))
  })

  it('keeps answering after the client hangs up, and stops only through the stop endpoint', async () => {
    const { call, advisorRepo } = await boot([token('Teil'), { waitForAbort: true }])
    const hangUp = new AbortController()
    const res = await fetch(`${await app!.getUrl()}${BASE}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi' }),
      signal: hangUp.signal,
    })
    const reader = res.body!.getReader()
    let seen = ''
    while (!seen.includes('event: token')) seen += new TextDecoder().decode((await reader.read()).value)
    const runId = (parseSse(seen)[0]!.data as { runId: string }).runId
    hangUp.abort()
    await new Promise((resolve) => setTimeout(resolve, 50))

    // The connection is gone; the answer is still being written.
    expect((await advisorRepo.listForUserAndYear(currentUser, 2025))[1]!.status).toBe('streaming')

    const stop = await call('POST', `/runs/${runId}/stop`)
    expect(await stop.json()).toEqual({ stopped: true })
    const answer = (await advisorRepo.listForUserAndYear(currentUser, 2025))[1]!
    expect(answer).toMatchObject({ status: 'aborted', content: 'Teil' })
  })

  it('answers 404 for a run of another user, for events and for stop', async () => {
    const { call } = await boot([token('x'), doneEvent({ replyText: 'x' })])
    const frames = parseSse(await (await call('POST', '/stream', { message: 'Hi' })).text())
    const runId = (frames[0]!.data as { runId: string }).runId

    currentUser = 'user-http-2'
    expect((await call('GET', `/runs/${runId}/events`)).status).toBe(404)
    expect((await call('POST', `/runs/${runId}/stop`)).status).toBe(404)
  })

  it('rates an answer, validates the body, and clears the conversation', async () => {
    const { call } = await boot([token('x'), doneEvent({ replyText: 'x' })])
    const frames = parseSse(await (await call('POST', '/stream', { message: 'Hi' })).text())
    const answerId = (frames.at(-1)!.data as { assistantMessage: { id: string } }).assistantMessage.id

    const rated = await call('PUT', `/messages/${answerId}/feedback`, { rating: 'down', reason: 'falsch' })
    expect(rated.status).toBe(200)
    expect(((await rated.json()) as { feedback: unknown }).feedback).toEqual({ rating: 'down', reason: 'falsch' })

    expect((await call('PUT', `/messages/${answerId}/feedback`, { rating: 'sideways' })).status).toBe(400)
    expect((await call('PUT', `/messages/${answerId}/feedback`, { rating: 'down', reason: 'weil ich es sage' })).status).toBe(400)
    expect((await call('PUT', `/messages/${answerId}/feedback`, { rating: null })).status).toBe(200)

    currentUser = 'user-http-2'
    expect((await call('PUT', `/messages/${answerId}/feedback`, { rating: 'up' })).status).toBe(404)
    currentUser = 'user-http-1'

    const cleared = await call('DELETE', '/session')
    expect(await cleared.json()).toEqual({ deletedMessages: 2 })
    const session = (await (await call('GET', '/session')).json()) as { messages: unknown[] }
    expect(session.messages).toEqual([])
  })
})
