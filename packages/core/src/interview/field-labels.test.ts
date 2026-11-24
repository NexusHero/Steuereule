import { describe, expect, it } from 'vitest'
import { FIELD_CATALOG } from './field-catalog'
import { fieldLabel } from './field-labels'

describe('fieldLabel', () => {
  // The interview's questions are named by the app's question catalogue (`katalog.questions.*`), not here.
  it('names every field of every mask the user confirms, so „Prüfen & bestätigen“ never shows an id (MCP-5, MCP-25)', () => {
    const unnamed = FIELD_CATALOG.filter((spec) => spec.screen !== 'interview' && fieldLabel(spec.screen, spec.field) === null).map((spec) => `${spec.screen}.${spec.field}`)
    expect(unnamed).toEqual([])
  })
})
