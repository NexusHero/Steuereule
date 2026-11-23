import { describe, expect, it, vi } from 'vitest'
import { PrismaBearerTokenRepository } from '../src/auth/bearer-token.repository.prisma.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'

function repositoryOver(rows: { token?: unknown; client?: unknown; consent?: unknown }) {
  const prisma = {
    oauthAccessToken: { findUnique: vi.fn().mockResolvedValue(rows.token ?? null) },
    oauthClient: { findUnique: vi.fn().mockResolvedValue(rows.client ?? null) },
    oauthConsent: { findFirst: vi.fn().mockResolvedValue(rows.consent ?? null) },
  }
  return { prisma, repository: new PrismaBearerTokenRepository(prisma as unknown as PrismaService) }
}

describe('PrismaBearerTokenRepository', () => {
  it('looks an opaque token up by its hash and returns it with its client', async () => {
    const expiresAt = new Date('2027-01-01T00:00:00Z')
    const { prisma, repository } = repositoryOver({
      token: { userId: 'u1', clientId: 'c1', scopes: ['steuerdaten:read'], revoked: null, expiresAt, client: { name: 'Claude', disabled: false }, token: 'hash', id: 't1' },
    })

    await expect(repository.findOpaqueToken('hash')).resolves.toEqual({
      userId: 'u1',
      clientId: 'c1',
      scopes: ['steuerdaten:read'],
      revoked: null,
      expiresAt,
      client: { name: 'Claude', disabled: false },
    })
    expect(prisma.oauthAccessToken.findUnique).toHaveBeenCalledWith({ where: { token: 'hash' }, include: { client: { select: { name: true, disabled: true } } } })
  })

  it('returns null for an unknown token and an unknown client', async () => {
    const { repository } = repositoryOver({})
    await expect(repository.findOpaqueToken('nope')).resolves.toBeNull()
    await expect(repository.findClient('nope')).resolves.toBeNull()
  })

  // The column is `Boolean?`: a client row written before the flag existed reads as null.
  it.each([
    [null, false],
    [false, false],
    [true, true],
  ])('reads a client whose disabled column is %s as disabled = %s', async (stored, disabled) => {
    const { repository } = repositoryOver({ client: { name: null, disabled: stored } })
    await expect(repository.findClient('c1')).resolves.toEqual({ name: null, disabled })
  })

  it('says whether the user still consents to the client', async () => {
    const consenting = repositoryOver({ consent: { id: 'k1' } })
    await expect(consenting.repository.hasConsent('u1', 'c1')).resolves.toBe(true)
    expect(consenting.prisma.oauthConsent.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', clientId: 'c1' }, select: { id: true } })
    await expect(repositoryOver({}).repository.hasConsent('u1', 'c1')).resolves.toBe(false)
  })
})
