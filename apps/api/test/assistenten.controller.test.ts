import { NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { AssistantsController } from '../src/assistenten/assistenten.controller.js'
import { AssistantsService } from '../src/assistenten/assistenten.service.js'
import { FakeAssistantsRepository } from './fakes/fake-assistenten.repository.js'

describe('AssistentenController (ADR-0052 §10)', () => {
  it('lists connected assistants', async () => {
    const fakeRepo = new FakeAssistantsRepository()
    fakeRepo.setConnected('user-1', [
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        linkedSince: new Date('2026-11-01T10:00:00Z'),
        lastUsed: null,
      },
    ])
    const service = new AssistantsService(fakeRepo)
    const controller = new AssistantsController(service)

    const result = await controller.listConnected('user-1')
    expect(result).toEqual([
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        linkedSince: '2026-11-01T10:00:00.000Z',
        lastUsed: null,
      },
    ])
  })

  it('revokes an assistant connection', async () => {
    const fakeRepo = new FakeAssistantsRepository()
    fakeRepo.setConnected('user-1', [
      {
        clientId: 'c1',
        name: 'Claude Desktop',
        linkedSince: new Date('2026-11-01T10:00:00Z'),
        lastUsed: null,
      },
    ])
    const service = new AssistantsService(fakeRepo)
    const controller = new AssistantsController(service)

    const res = await controller.revoke('user-1', 'c1')
    expect(res).toEqual({ success: true })

    const list = await controller.listConnected('user-1')
    expect(list).toEqual([])
  })

  it('returns client info or throws NotFoundException', async () => {
    const fakeRepo = new FakeAssistantsRepository()
    fakeRepo.setClient({
      clientId: 'c1',
      name: 'Claude Assistant',
      uri: 'https://claude.ai',
      icon: null,
    })
    const service = new AssistantsService(fakeRepo)
    const controller = new AssistantsController(service)

    const info = await controller.getClientInfo('c1')
    expect(info.name).toBe('Claude Assistant')

    await expect(controller.getClientInfo('nonexistent')).rejects.toThrow(NotFoundException)
  })
})
