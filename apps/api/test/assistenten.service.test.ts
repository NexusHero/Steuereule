import { describe, expect, it, vi } from 'vitest'
import { AssistentenService } from '../src/assistenten/assistenten.service.js'
import type { AssistentenRepository, VerbundenerAssistent } from '../src/assistenten/assistenten.repository.js'

describe('AssistentenService (ADR-0052 §10 / Issue #385)', () => {
  it('lists connected assistants for a user', async () => {
    const list: VerbundenerAssistent[] = [
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        verbundenSeit: new Date('2026-11-01T10:00:00Z'),
        zuletztGenutzt: new Date('2026-11-03T18:00:00Z'),
      },
    ]
    const fakeRepo: AssistentenRepository = {
      findConnectedForUser: vi.fn().mockResolvedValue(list),
      revokeForUser: vi.fn().mockResolvedValue(undefined),
      findClientInfo: vi.fn().mockResolvedValue(null),
    }

    const service = new AssistentenService(fakeRepo)
    const result = await service.listConnected('user-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      clientId: 'c1',
      name: 'Claude Desktop',
      verbundenSeit: '2026-11-01T10:00:00.000Z',
      zuletztGenutzt: '2026-11-03T18:00:00.000Z',
    })
    expect(fakeRepo.findConnectedForUser).toHaveBeenCalledWith('user-1')
  })

  it('revokes an assistant connection immediately', async () => {
    const fakeRepo: AssistentenRepository = {
      findConnectedForUser: vi.fn().mockResolvedValue([]),
      revokeForUser: vi.fn().mockResolvedValue(undefined),
      findClientInfo: vi.fn().mockResolvedValue(null),
    }

    const service = new AssistentenService(fakeRepo)
    await service.revoke('user-1', 'c1')

    expect(fakeRepo.revokeForUser).toHaveBeenCalledWith('user-1', 'c1')
  })

  it('gets client info for consent screen', async () => {
    const fakeRepo: AssistentenRepository = {
      findConnectedForUser: vi.fn().mockResolvedValue([]),
      revokeForUser: vi.fn().mockResolvedValue(undefined),
      findClientInfo: vi.fn().mockResolvedValue({
        clientId: 'c1',
        name: 'Gemini Assistant',
        uri: 'https://gemini.google.com',
        icon: null,
      }),
    }

    const service = new AssistentenService(fakeRepo)
    const info = await service.getClientInfo('c1')

    expect(info).toEqual({
      clientId: 'c1',
      name: 'Gemini Assistant',
      uri: 'https://gemini.google.com',
      icon: null,
    })
    expect(fakeRepo.findClientInfo).toHaveBeenCalledWith('c1')
  })
})
