// formatProvenanceBadge / provenanceIndex — the badge of each provenance kind and the lookup by key and mask field.
import { describe, expect, it } from 'vitest'
import type { ConfirmationResponseDto } from '@steuereule/api-client'
import { formatProvenanceBadge, provenanceIndex } from './glassFormProvenance'

// Answers with the default value, the way i18next does when the key has no translation.
const tr = ((_key: string, options: { defaultValue: string }) => options.defaultValue) as unknown as Parameters<typeof formatProvenanceBadge>[1]

describe('formatProvenanceBadge', () => {
  it('names a value without provenance as entered by the user', () => {
    expect(formatProvenanceBadge(undefined, tr)).toBe('Selbst eingetragen')
    expect(formatProvenanceBadge({ kind: 'nutzer' }, tr)).toBe('Selbst eingetragen')
  })

  it('names the year a value was taken over from', () => {
    expect(formatProvenanceBadge({ kind: 'uebernahme', lastYear: 2024 }, tr)).toBe('Übernahme aus 2024')
  })

  it('names the assistant a value came from, and says when it read it from a receipt', () => {
    expect(formatProvenanceBadge({ kind: 'assistent', name: 'Eule' }, tr)).toBe('Eule')
    expect(formatProvenanceBadge({ kind: 'assistent', name: 'Eule', receiptId: 'r1' }, tr)).toBe('Eule (Beleg)')
  })

  it('names a receipt value in words', () => {
    expect(formatProvenanceBadge({ kind: 'beleg' }, tr)).toBe('Aus Beleg')
  })
})

describe('provenanceIndex', () => {
  it('is empty without a confirmation', () => {
    expect(provenanceIndex(null).size).toBe(0)
  })

  it('finds every value by its key and by screen.field', () => {
    const confirmation = {
      annexes: [
        { values: [{ key: 'lstb.brutto', screen: 'lstb', field: 'bruttoarbeitslohn', provenance: { kind: 'beleg' } }] },
        { values: [{ key: 'kind.1.name', screen: 'kind', field: 'firstName', provenance: { kind: 'nutzer' } }] },
      ],
    } as unknown as ConfirmationResponseDto
    const index = provenanceIndex(confirmation)
    expect(index.get('lstb.brutto')).toEqual({ kind: 'beleg' })
    expect(index.get('lstb.bruttoarbeitslohn')).toEqual({ kind: 'beleg' })
    expect(index.get('kind.firstName')).toEqual({ kind: 'nutzer' })
    expect(index.size).toBe(4)
  })
})
