// P11: how the request's identity reaches Postgres. The row-level-aware client sends a query outside a
// transaction as the batch [set_config, query], gives an interactive transaction the setting as its first
// statement, joins a running `run` without a second setting, switches it for a system step inside a user's
// transaction, and sends nothing extra without an identity (the policies then answer with no rows).
import { describe, expect, it } from 'vitest'
import { of, lastValueFrom } from 'rxjs'
import { runAsDatabaseUser, systemDatabaseClient, withSystemDatabaseAccess } from '../src/common/database-identity.js'
import { DatabaseIdentityInterceptor } from '../src/auth/database-identity.interceptor.js'
import { currentDatabaseIdentity } from '../src/common/database-identity.js'
import { PrismaTransactionRunner, transactionAwareClient } from '../src/prisma/transaction.js'

interface Lazy {
  readonly label: string
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown): Promise<unknown>
}

function fakeClient(log: string[], name = 'root') {
  const lazy = (label: string, value: unknown): Lazy => ({
    label,
    // Stands in for a lazy Prisma query, which is a thenable.
    // oxlint-disable-next-line unicorn/no-thenable
    then: (resolve, reject) => {
      log.push(`${name}:${label}`)
      return Promise.resolve(value).then(resolve, reject)
    },
  })
  const client = {
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => lazy(`set(${values.join(',')})`, 1),
    profile: { findMany: (args: unknown) => lazy(`findMany(${JSON.stringify(args)})`, ['row']) },
    $transaction: async (work: unknown, _options?: unknown): Promise<unknown> => {
      if (typeof work === 'function') {
        log.push(`${name}:begin`)
        const result = await (work as (tx: unknown) => Promise<unknown>)(fakeClient(log, 'tx'))
        log.push(`${name}:commit`)
        return result
      }
      log.push(`${name}:batch[${(work as Lazy[]).map((query) => query.label).join(' | ')}]`)
      return (work as Lazy[]).map((query) => (query.label.startsWith('set') ? 1 : ['row']))
    },
  }
  return client
}

const userSet = (id: string) => `set(steuereule.user_id,${id},steuereule.system,)`
const systemSet = (reason: string) => `set(steuereule.user_id,,steuereule.system,${reason})`

describe('the row-level identity of a query', () => {
  it('without an identity, the query goes out alone: no setting, so the policies return nothing', async () => {
    const log: string[] = []
    const client = transactionAwareClient(fakeClient(log))
    await client.profile.findMany({ where: { userId: 'a' } })
    expect(log).toEqual(['root:findMany({"where":{"userId":"a"}})'])
  })

  it("a user's query is one batch: set_config, then the query, on one connection", async () => {
    const log: string[] = []
    const client = transactionAwareClient(fakeClient(log))
    const rows = await runAsDatabaseUser('user-a', () => client.profile.findMany({ where: { userId: 'user-a' } }))
    expect(rows).toEqual(['row'])
    expect(log).toEqual([`root:batch[${userSet('user-a')} | findMany({"where":{"userId":"user-a"}})]`])
  })

  it("a repository's own batch gets the setting prepended, and its results come back without it", async () => {
    const log: string[] = []
    const client = transactionAwareClient(fakeClient(log))
    const results = await runAsDatabaseUser('user-a', () => client.$transaction([client.profile.findMany({ a: 1 }), client.profile.findMany({ b: 2 })]))
    expect(results).toEqual([['row'], ['row']])
    expect(log).toEqual([`root:batch[${userSet('user-a')} | findMany({"a":1}) | findMany({"b":2})]`])
  })

  it('an interactive transaction sets the identity as its first statement', async () => {
    const log: string[] = []
    const client = transactionAwareClient(fakeClient(log))
    await runAsDatabaseUser('user-a', () => client.$transaction(async (tx: unknown) => (tx as ReturnType<typeof fakeClient>).profile.findMany({}) as unknown as Promise<unknown>))
    expect(log).toEqual(['root:begin', `tx:${userSet('user-a')}`, 'tx:findMany({})', 'root:commit'])
  })

  it('a unit of work sets it once; every repository call in it joins without another round trip', async () => {
    const log: string[] = []
    const client = transactionAwareClient(fakeClient(log))
    const runner = new PrismaTransactionRunner(client as never)
    await runAsDatabaseUser('user-a', () =>
      runner.run(async () => {
        await client.profile.findMany({ one: 1 })
        await client.$transaction([client.profile.findMany({ two: 2 })])
      }),
    )
    expect(log).toEqual(['root:begin', `tx:${userSet('user-a')}`, 'tx:findMany({"one":1})', 'tx:findMany({"two":2})', 'root:commit'])
  })

  it("a system step inside a user's transaction switches the setting around its query and back", async () => {
    const log: string[] = []
    const client = transactionAwareClient(fakeClient(log))
    const runner = new PrismaTransactionRunner(client as never)
    await runAsDatabaseUser('user-a', () =>
      runner.run(async () => {
        await withSystemDatabaseAccess('account-deletion', () => client.profile.findMany({ system: true }))
        await client.profile.findMany({ user: true })
      }),
    )
    expect(log).toEqual([
      'root:begin',
      `tx:${userSet('user-a')}`,
      `tx:${systemSet('account-deletion')}`,
      'tx:findMany({"system":true})',
      `tx:${userSet('user-a')}`,
      'tx:findMany({"user":true})',
      'root:commit',
    ])
  })

  it('a system client runs every query for its reason, whatever the caller is', async () => {
    const log: string[] = []
    const client = systemDatabaseClient(transactionAwareClient(fakeClient(log)), 'better-auth')
    await runAsDatabaseUser('user-a', () => client.profile.findMany({}))
    expect(log).toEqual([`root:batch[${systemSet('better-auth')} | findMany({})]`])
  })

  it('the plain client never joins a unit of work, but still carries the identity', async () => {
    const log: string[] = []
    const encrypted = transactionAwareClient(fakeClient(log))
    const plain = transactionAwareClient(fakeClient(log, 'plain'), { joinTransactions: false })
    await runAsDatabaseUser('user-a', () => new PrismaTransactionRunner(encrypted as never).run(() => plain.profile.findMany({}) as unknown as Promise<unknown>))
    expect(log).toEqual(['root:begin', `tx:${userSet('user-a')}`, `plain:batch[${userSet('user-a')} | findMany({})]`, 'root:commit'])
  })
})

describe('DatabaseIdentityInterceptor', () => {
  const contextFor = (userId: string | undefined) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ userId }) }) }) as never

  it("runs the handler as the user the guard established", async () => {
    const seen = await lastValueFrom(
      new DatabaseIdentityInterceptor().intercept(contextFor('user-a'), { handle: () => of(currentDatabaseIdentity()) }),
    )
    expect(seen).toEqual({ kind: 'user', userId: 'user-a' })
  })

  it('a request without a user runs with no identity', async () => {
    const seen = await lastValueFrom(new DatabaseIdentityInterceptor().intercept(contextFor(undefined), { handle: () => of(currentDatabaseIdentity()) }))
    expect(seen).toBeUndefined()
  })
})

describe('systemDatabaseClient over a repository', () => {
  it('calls the methods on the repository itself, so they keep their `this`, under the reason', async () => {
    class Repository {
      private readonly seen: unknown[] = []
      async record(): Promise<unknown[]> {
        this.seen.push(currentDatabaseIdentity())
        return this.seen
      }
    }
    const wrapped = systemDatabaseClient(new Repository(), 'payment-webhook')
    await expect(wrapped.record()).resolves.toEqual([{ kind: 'system', reason: 'payment-webhook' }])
  })
})
