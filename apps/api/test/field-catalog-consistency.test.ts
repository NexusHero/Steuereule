// ADR-0065: the field catalogue in the core and the fields the screens can actually write must be
// the same set. A field added to a screen without a catalogue line fails here, before anyone can
// propose or store a value for it unchecked.
import { fieldSpec, fieldsOfScreen, SCREENS } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { MEANS_OF_TRANSPORT } from '../src/commute/commute.repository.js'
import { AI_FORBIDDEN_FIELDS, AI_FORBIDDEN_SCREENS, isAiWritable } from '../src/confirmation/ai-write-policy.js'
import { WRITABLE_FIELDS_BY_SCREEN } from '../src/confirmation/field-access.js'
import { AI_WRITABLE_FIELDS } from '../src/ki/advisor-safety.js'

describe('field catalogue and write path describe the same fields (ADR-0065)', () => {
  it.each(SCREENS)('screen %s: catalogue and writable fields are identical', (screen) => {
    expect(fieldsOfScreen(screen).map((spec) => spec.field).sort()).toEqual([...WRITABLE_FIELDS_BY_SCREEN[screen]].sort())
  })

  it('agrees with the commute repository on the means of transport', () => {
    const transport = fieldSpec('commute', 'transport')!.value
    expect(transport.kind === 'enum' ? [...transport.values] : []).toEqual([...MEANS_OF_TRANSPORT])
  })

  it('offers the owl exactly the catalogue fields the write policy allows', () => {
    for (const screen of SCREENS) {
      const offered = AI_WRITABLE_FIELDS[screen] ?? []
      const allowed = fieldsOfScreen(screen).filter((spec) => isAiWritable(screen, spec.field)).map((spec) => spec.field)
      expect(offered, screen).toEqual(allowed)
    }
    expect(AI_WRITABLE_FIELDS.profil).toBeUndefined()
    expect(AI_FORBIDDEN_SCREENS.has('stammdaten')).toBe(true)
    expect(AI_FORBIDDEN_FIELDS.has('iban')).toBe(true)
  })
})
