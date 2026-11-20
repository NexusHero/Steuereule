import { describe, expect, it } from 'vitest'
import { content, legalNotice, operatorFromEnv, privacy, terms, type Operator } from './texts'

const FULL: Operator = {
  name: 'Eule GmbH',
  postalAddress: 'Musterstraße 1\n12345 Musterstadt',
  email: 'hallo@steuereule.de',
  represented: 'Erika Eule',
  ustId: 'DE123456789',
}

const textOf = (sections: ReturnType<typeof content>) => sections.flatMap((s) => [s.title, ...s.paragraphs]).join('\n')

describe('operatorFromEnv', () => {
  it('is null as soon as one required operator field is missing or blank', () => {
    const base = { EXPO_PUBLIC_BETREIBER_NAME: 'A', EXPO_PUBLIC_BETREIBER_ANSCHRIFT: 'B', EXPO_PUBLIC_BETREIBER_EMAIL: 'c@d.de' }
    expect(operatorFromEnv(base)).not.toBeNull()
    expect(operatorFromEnv({ ...base, EXPO_PUBLIC_BETREIBER_NAME: '  ' })).toBeNull()
    expect(operatorFromEnv({ ...base, EXPO_PUBLIC_BETREIBER_ANSCHRIFT: undefined })).toBeNull()
    expect(operatorFromEnv({ ...base, EXPO_PUBLIC_BETREIBER_EMAIL: '' })).toBeNull()
  })

  it('carries the optional representative and VAT id only when given', () => {
    const base = { EXPO_PUBLIC_BETREIBER_NAME: 'A', EXPO_PUBLIC_BETREIBER_ANSCHRIFT: 'B', EXPO_PUBLIC_BETREIBER_EMAIL: 'c@d.de' }
    expect(operatorFromEnv(base)).toEqual({ name: 'A', postalAddress: 'B', email: 'c@d.de' })
    expect(operatorFromEnv({ ...base, EXPO_PUBLIC_BETREIBER_VERTRETEN: ' Max ', EXPO_PUBLIC_BETREIBER_USTID: 'DE1' })).toMatchObject({ represented: 'Max', ustId: 'DE1' })
  })
})

describe('the legal pages name the operator', () => {
  it('prints representative, VAT id and contact in the Impressum', () => {
    const text = textOf(legalNotice(FULL))
    expect(text).toContain('Vertreten durch: Erika Eule')
    expect(text).toContain('Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: DE123456789')
    expect(text).toContain('E-Mail: hallo@steuereule.de')
  })

  it('omits representative and VAT id when the operator has none', () => {
    const text = textOf(legalNotice({ name: 'A', postalAddress: 'B', email: 'c@d.de' }))
    expect(text).not.toContain('Vertreten durch')
    expect(text).not.toContain('Umsatzsteuer-ID')
  })

  it('says honestly that the operator is not configured yet instead of inventing one', () => {
    expect(textOf(legalNotice(null))).toContain('noch nicht hinterlegt')
    expect(textOf(privacy(null))).toContain('noch nicht hinterlegt')
    expect(textOf(terms(null))).toContain('der im Impressum genannte Anbieter')
  })

  it('names the controller in one line in the privacy policy and the provider in the terms', () => {
    expect(textOf(privacy(FULL))).toContain('Eule GmbH, Musterstraße 1, 12345 Musterstadt, E-Mail: hallo@steuereule.de')
    expect(textOf(terms(FULL))).toContain('angeboten von Eule GmbH')
  })

  it('routes every page to its own text', () => {
    expect(content('impressum', FULL)).toEqual(legalNotice(FULL))
    expect(content('datenschutz', FULL)).toEqual(privacy(FULL))
    expect(content('agb', FULL)).toEqual(terms(FULL))
    expect(textOf(content('hinweise', FULL))).toContain('Keine Steuerberatung')
  })
})
