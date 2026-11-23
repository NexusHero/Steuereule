import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { LinkPersonBDto } from '../src/link/dto/link.dto.js'

// ADR-0104 L4 (Codex P2) — the control-char guard must also cover the Person B write path, which persists
// firstName/lastName to the same profile record as PUT /v1/profile and can reach printouts.
describe('LinkPersonBDto — control-character validation', () => {
  it('rejects a null byte / lone surrogate in firstName, lastName or beruf', async () => {
    for (const field of ['firstName', 'lastName', 'beruf'] as const) {
      const dto = plainToInstance(LinkPersonBDto, { [field]: 'a\u0000b' })
      const errors = await validate(dto)
      expect(errors.some((e) => e.property === field), field).toBe(true)
    }
    const surrogate = plainToInstance(LinkPersonBDto, { firstName: 'bad\uD800' })
    expect((await validate(surrogate)).some((e) => e.property === 'firstName')).toBe(true)
  })

  it('accepts clean Person B values', async () => {
    const dto = plainToInstance(LinkPersonBDto, { firstName: 'Erika', lastName: 'Muster', beruf: 'Angestellte' })
    expect(await validate(dto)).toHaveLength(0)
  })
})
