import { describe, expect, it, vi } from 'vitest'
import { ensureMcpResource } from '../src/auth/mcp-resource-seed.js'

const RESOURCE = 'http://localhost:3501/mcp/sse'

function adapter(existing: object | null = null) {
  return { findOne: vi.fn().mockResolvedValue(existing), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) }
}

describe('MCP resource row (RFC 8707, ADR-0052 §2)', () => {
  it('creates the row once with the MCP scopes allowed, never an empty list (that would allow none)', async () => {
    const db = adapter()
    const ensure = ensureMcpResource(RESOURCE, ['steuerdaten:read', 'steuerdaten:write'])
    await ensure(db as never)
    await ensure(db as never)
    expect(db.create).toHaveBeenCalledTimes(1)
    expect(db.create).toHaveBeenCalledWith({ model: 'oauthResource', data: expect.objectContaining({ identifier: RESOURCE, allowedScopes: ['steuerdaten:read', 'steuerdaten:write'], disabled: false }) })
  })

  it('leaves an existing row with the same scopes alone', async () => {
    const db = adapter({ identifier: RESOURCE, allowedScopes: ['steuerdaten:read'] })
    await ensureMcpResource(RESOURCE, ['steuerdaten:read'])(db as never)
    expect(db.create).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('brings the scopes of an existing row up to date, or a new scope would be dropped from every token', async () => {
    const db = adapter({ identifier: RESOURCE, allowedScopes: ['steuerdaten:read'] })
    await ensureMcpResource(RESOURCE, ['steuerdaten:read', 'offline_access'])(db as never)
    expect(db.update).toHaveBeenCalledWith({ model: 'oauthResource', where: [{ field: 'identifier', value: RESOURCE }], update: expect.objectContaining({ allowedScopes: ['steuerdaten:read', 'offline_access'] }) })
  })

  it('tries again on the next request when the database was not reachable', async () => {
    const db = { findOne: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn() }
    const ensure = ensureMcpResource(RESOURCE, ['steuerdaten:read'])
    await expect(ensure(db as never)).rejects.toThrow('down')
    await ensure(db as never)
    expect(db.create).toHaveBeenCalledTimes(1)
  })
})
