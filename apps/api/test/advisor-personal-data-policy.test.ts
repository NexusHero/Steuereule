// ADR-0091: with the user's consent the owl may propose personal fields; without it, nothing changes.
import { describe, expect, it } from 'vitest'
import { assertAiWritable, isAiWritable } from '../src/confirmation/ai-write-policy.js'
import { AI_WRITABLE_FIELDS, aiWritableFields, describeAiWritableFields, validateStageTarget } from '../src/ki/advisor-safety.js'

describe('the write policy with and without consent (ADR-0091)', () => {
  it('keeps identifying fields closed without consent, and says the consent opens them', () => {
    expect(isAiWritable('profil', 'steuerId')).toBe(false)
    expect(() => assertAiWritable('stammdaten', 'iban')).toThrow(/Einwilligung/)
    const check = validateStageTarget('profil', 'steuerId')
    expect(check).toMatchObject({ ok: false, consentRequired: true, locked: { screen: 'profil', field: 'steuerId' } })
    expect(validateStageTarget('kind', 'firstName')).toMatchObject({ ok: false, consentRequired: true })
  })

  it('opens them with consent', () => {
    expect(isAiWritable('profil', 'steuerId', true)).toBe(true)
    expect(() => assertAiWritable('stammdaten', 'iban', undefined, true)).not.toThrow()
    expect(validateStageTarget('profil', 'steuerId', true)).toEqual({ ok: true, screen: 'profil' })
    expect(validateStageTarget('kopplung', 'filingType', true)).toEqual({ ok: true, screen: 'kopplung' })
    expect(validateStageTarget('kind', 'geburtsdatum', true)).toEqual({ ok: true, screen: 'kind' })
  })

  it('never opens the invitation code', () => {
    expect(isAiWritable('kopplung', 'invitationCode', true)).toBe(false)
    expect(validateStageTarget('kopplung', 'invitationCode', true)).toMatchObject({ ok: false })
    expect(validateStageTarget('kopplung', 'invitationCode', true)).not.toHaveProperty('consentRequired')
  })

  it('tells the model the personal fields only once there is consent', () => {
    expect(AI_WRITABLE_FIELDS.profil).toBeUndefined()
    expect(aiWritableFields(true).profil).toEqual(['firstName', 'lastName', 'steuerId', 'steuernummer'])
    expect(aiWritableFields(true).kopplung).toEqual(['filingType'])
    expect(describeAiWritableFields()).not.toMatch(/- profil/)
    expect(describeAiWritableFields(true)).toMatch(/- profil: firstName/)
    expect(describeAiWritableFields(true)).toMatch(/- stammdaten: .*iban/)
  })

  it('offers the exchange rate, the capital owner and the rental object fields without consent where they name nobody (C4)', () => {
    expect(AI_WRITABLE_FIELDS.chLohnausweis).toEqual(expect.arrayContaining(['wechselkurs', 'wechselkursMonat']))
    expect(AI_WRITABLE_FIELDS.kapital).toContain('inhaber')
    expect(AI_WRITABLE_FIELDS.vermietung).toEqual(expect.arrayContaining(['livingArea', 'einheiten', 'depreciationAsLastYear', 'umlagen', 'schuldzinsen', 'anteilA']))
    expect(AI_WRITABLE_FIELDS.vermietung).not.toContain('strasse')
    expect(aiWritableFields(true).vermietung).toEqual(expect.arrayContaining(['strasse', 'hausnummer', 'plz', 'city']))
  })
})

describe('the system prompt with and without consent (ADR-0091)', () => {
  it('keeps the personal fields closed and the consent card in view without consent', async () => {
    const { buildStableSystemPrompt } = await import('../src/ki/advisor-prompt.js')
    const prompt = buildStableSystemPrompt()
    expect(prompt).toMatch(/Einwilligung/)
    expect(prompt).not.toMatch(/- profil: firstName/)
  })

  it('lists the personal fields and how to create a child, Person B and a rental object with consent', async () => {
    const { buildStableSystemPrompt } = await import('../src/ki/advisor-prompt.js')
    const prompt = buildStableSystemPrompt(true)
    expect(prompt).toMatch(/- profil: firstName/)
    expect(prompt).toMatch(/instance.*„neu“/)
    expect(prompt).toMatch(/kopplung\.filingType/)
    expect(prompt).not.toMatch(/absolut tabu/)
  })
})
