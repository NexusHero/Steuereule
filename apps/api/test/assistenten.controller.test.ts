import { NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { AssistentenController } from '../src/assistenten/assistenten.controller.js'
import { AssistentenService } from '../src/assistenten/assistenten.service.js'
import { FakeAssistentenRepository } from './fakes/fake-assistenten.repository.js'

describe('AssistentenController (ADR-0052 §10)', () => {
  it('lists connected assistants', async () => {
    const fakeRepo = new FakeAssistentenRepository()
    fakeRepo.setConnected('user-1', [
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        verbundenSeit: new Date('2026-11-01T10:00:00Z'),
        zuletztGenutzt: null,
      },
    ])
    const service = new AssistentenService(fakeRepo)
    const controller = new AssistentenController(service)

    const result = await controller.listConnected('user-1')
    expect(result).toEqual([
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        verbundenSeit: '2026-11-01T10:00:00.000Z',
        zuletztGenutzt: null,
      },
    ])
  })

  it('revokes an assistant connection', async () => {
    const fakeRepo = new FakeAssistentenRepository()
    fakeRepo.setConnected('user-1', [
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        verbundenSeit: new Date('2026-11-01T10:00:00Z'),
        zuletztGenutzt: null,
      },
    ])
    const service = new AssistentenService(fakeRepo)
    const controller = new AssistentenController(service)

    const res = await controller.revoke('user-1', 'c1')
    expect(res).toEqual({ success: true })

    const list = await controller.listConnected('user-1')
    expect(list).toEqual([])
  })

  it('returns client info or throws NotFoundException', async () => {
    const fakeRepo = new FakeAssistentenRepository()
    fakeRepo.setClient({
      clientId: 'c1',
      name: 'Claude Assistant',
      uri: 'https://claude.ai',
      icon: null,
    })
    const service = new AssistentenService(fakeRepo)
    const controller = new AssistentenController(service)

    const info = await controller.getClientInfo('c1')
    expect(info.name).toBe('Claude Assistant')

    await expect(controller.getClientInfo('nonexistent')).rejects.toThrow(NotFoundException)
  })
})
