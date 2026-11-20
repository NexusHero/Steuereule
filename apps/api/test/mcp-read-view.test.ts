import { describe, expect, it } from 'vitest'
import { fieldsOfScreen, SCREENS } from '@steuereule/core'
import { ageAtYearEnd, churchTaxLiableFrom, readModeOf, readView, stateOfPostalCode } from '../src/mcp/read-view.js'

const spec = (screen: (typeof SCREENS)[number], field: string) => fieldsOfScreen(screen).find((s) => s.field === field)!

describe('what the assistant reads back (ADR-0052 amendment 3, #542)', () => {
  it('no field that identifies a person comes back in plain, except the named tax facts', () => {
    const plainPersonal = SCREENS.flatMap((screen) => fieldsOfScreen(screen))
      .filter((s) => s.personal && readModeOf(s) === 'plain')
      .map((s) => `${s.screen}.${s.field}`)
    expect(plainPersonal.sort()).toEqual(['kopplung.filingType', 'stammdaten.familienstand', 'stammdaten.kirchensteuerpflichtig'].sort())
  })

  it('free text, IBAN and id numbers never come back, whatever the field is called', () => {
    for (const s of SCREENS.flatMap((screen) => fieldsOfScreen(screen))) {
      if (['text', 'iban', 'digits', 'bookingDraft'].includes(s.value.kind)) expect(readModeOf(s), `${s.screen}.${s.field}`).not.toBe('plain')
    }
  })

  it('amounts and choices read in plain', () => {
    expect(readView(spec('lstb', 'bruttoarbeitslohn'), '78564', 2024)).toEqual({ wert: '78564' })
    expect(readView(spec('interview', 'job'), 'Angestellt', 2024)).toEqual({ wert: 'Angestellt' })
    expect(readView(spec('lstb', 'lohnsteuer'), null, 2024)).toEqual({ wert: null })
  })

  it('a birth date reads as the age at the end of the tax year, an address as the Bundesland', () => {
    expect(readView(spec('stammdaten', 'geburtsdatum'), '1991-05-07', 2024)).toEqual({ gesetzt: true, alterJahre: 33 })
    expect(readView(spec('kind', 'geburtsdatum'), '2022-06-14', 2024)).toEqual({ gesetzt: true, alterJahre: 2 })
    expect(readView(spec('stammdaten', 'plz'), '78176', 2024)).toEqual({ gesetzt: true, bundesland: 'BW' })
    expect(readView(spec('stammdaten', 'strasse'), 'Musterweg', 2024)).toEqual({ gesetzt: true })
    expect(readView(spec('profil', 'steuerId'), '12345678901', 2024)).toEqual({ gesetzt: true })
    expect(readView(spec('chLohnausweis', 'arbeitgeberName'), 'Muster AG', 2024)).toEqual({ gesetzt: true })
  })

  it('a confession reads only as liable to church tax or not', () => {
    expect(readView(spec('stammdaten', 'religion'), 'RK', 2024)).toEqual({ gesetzt: true, kirchensteuerpflichtig: true })
    expect(readView(spec('stammdaten', 'religion'), 'VD', 2024)).toEqual({ gesetzt: true, kirchensteuerpflichtig: false })
    expect(churchTaxLiableFrom('')).toBeNull()
  })

  it('the helpers answer null instead of guessing', () => {
    expect(ageAtYearEnd('14.06.2022', 2025)).toBe(3)
    expect(ageAtYearEnd('irgendwas', 2025)).toBeNull()
    expect(stateOfPostalCode('00000')).toBeNull()
  })
})
