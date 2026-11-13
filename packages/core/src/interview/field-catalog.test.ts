import { describe, expect, it } from 'vitest'
import {
  AI_FORBIDDEN_FIELDS,
  AI_FORBIDDEN_SCREENS,
  FIELD_CATALOG,
  describeFieldForPrompt,
  fieldSpec,
  fieldsOfScreen,
  validateFieldValue,
} from './field-catalog'
import { QUESTIONS } from './interview'
import { SCREENS } from './marking'

const ok = (value: string) => ({ ok: true, value })

describe('field catalogue (ADR-0066)', () => {
  it('describes every screen, and every field exactly once', () => {
    expect(new Set(FIELD_CATALOG.map((f) => f.screen))).toEqual(new Set(SCREENS))
    const keys = FIELD_CATALOG.map((f) => `${f.screen}.${f.field}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(fieldsOfScreen('interview').map((f) => f.field)).toEqual(Object.keys(QUESTIONS))
  })

  it('never offers the owl a screen or a field that identifies a person', () => {
    for (const spec of FIELD_CATALOG) {
      if (AI_FORBIDDEN_SCREENS.has(spec.screen) || AI_FORBIDDEN_FIELDS.has(spec.field)) {
        expect(spec.aiWritable, `${spec.screen}.${spec.field}`).toBe(false)
      }
    }
    expect(fieldSpec('profil', 'steuerId')?.aiWritable).toBe(false)
    expect(fieldSpec('kind', 'firstName')?.aiWritable).toBe(false)
    expect(fieldSpec('chLohnausweis', 'arbeitgeberName')?.aiWritable).toBe(false)
    expect(fieldSpec('lstb', 'bruttoarbeitslohn')?.aiWritable).toBe(true)
  })

  it('knows which screens have several rows a year', () => {
    expect(fieldSpec('kind', 'kinship')?.perInstance).toBe(true)
    expect(fieldSpec('vermietung', 'mieteinnahmen')?.perInstance).toBe(true)
    expect(fieldSpec('commute', 'oneWayKm')?.perInstance).toBe(false)
  })
})

describe('validateFieldValue', () => {
  it('refuses a field that does not exist, and an empty value', () => {
    expect(validateFieldValue('lstb', 'grossWageEur', '62000').ok).toBe(false)
    expect(validateFieldValue('nirgends', 'x', '1').ok).toBe(false)
    expect(validateFieldValue('lstb', 'bruttoarbeitslohn', '   ').ok).toBe(false)
  })

  it('takes amounts the way people and models write them, and stores plain digits', () => {
    for (const written of ['5000', '5.000', '5 000', '5.000 €', '5000 EUR', '5000,00', "5'000 CHF", ' 5000 ']) {
      expect(validateFieldValue('lstb', 'bruttoarbeitslohn', written), written).toEqual(ok('5000'))
    }
    expect(validateFieldValue('lstb', 'bruttoarbeitslohn', '1.234.567')).toEqual(ok('1234567'))
  })

  it('refuses what is not a whole amount instead of guessing', () => {
    for (const written of ['xyz-unsinn', '5000,50', '-200', 'ca. 5000', '5k', '1.23']) {
      expect(validateFieldValue('lstb', 'bruttoarbeitslohn', written).ok, written).toBe(false)
    }
  })

  it('bounds integers', () => {
    expect(validateFieldValue('commute', 'oneWayKm', '38')).toEqual(ok('38'))
    expect(validateFieldValue('commute', 'oneWayKm', '1000').ok).toBe(false)
    expect(validateFieldValue('vermietung', 'baujahr', '1995')).toEqual(ok('1995'))
    expect(validateFieldValue('vermietung', 'baujahr', '95').ok).toBe(false)
    expect(validateFieldValue('assessment', 'erstattung', '-350')).toEqual(ok('-350'))
    expect(validateFieldValue('assessment', 'festgesetzteSteuer', '-350').ok).toBe(false)
  })

  it('corrects the spelling of an enum value when it can only mean one, and refuses the rest', () => {
    expect(validateFieldValue('commute', 'transport', 'Pkw')).toEqual(ok('pkw'))
    expect(validateFieldValue('commute', 'transport', 'ÖPNV')).toEqual(ok('oepnv'))
    expect(validateFieldValue('rente', 'rentenart', 'Gesetzliche Rente')).toEqual(ok('GesetzlicheRente'))
    const refused = validateFieldValue('rente', 'rentenart', 'Gesetzliche Altersrente')
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.reason).toContain('GesetzlicheRente')
    expect(validateFieldValue('commute', 'transport', 'Fahrrad').ok).toBe(false)
  })

  it('reads yes and no for a yes/no field and stores true and false', () => {
    expect(validateFieldValue('kind', 'registeredWithMeAllYear', 'Ja')).toEqual(ok('true'))
    expect(validateFieldValue('kind', 'registeredWithMeAllYear', 'nein')).toEqual(ok('false'))
    expect(validateFieldValue('kind', 'registeredWithMeAllYear', 'true')).toEqual(ok('true'))
    expect(validateFieldValue('kind', 'registeredWithMeAllYear', 'vielleicht').ok).toBe(false)
  })

  it('takes dates in ISO and German form, and no date that does not exist', () => {
    expect(validateFieldValue('assessment', 'assessmentDate', '2027-08-14')).toEqual(ok('2027-08-14'))
    expect(validateFieldValue('assessment', 'assessmentDate', '14.08.2027')).toEqual(ok('2027-08-14'))
    expect(validateFieldValue('assessment', 'assessmentDate', '2027-02-30').ok).toBe(false)
    expect(validateFieldValue('assessment', 'assessmentDate', 'August 2027').ok).toBe(false)
  })

  it('checks weekdays, percentages and text length', () => {
    expect(validateFieldValue('commute', 'workdays', '1, 2,3,3')).toEqual(ok('1,2,3'))
    expect(validateFieldValue('commute', 'workdays', 'Mo-Fr').ok).toBe(false)
    expect(validateFieldValue('chLohnausweis', 'nbuvArbeitgeberProzent', '1,5')).toEqual(ok('1.5'))
    expect(validateFieldValue('chLohnausweis', 'nbuvArbeitgeberProzent', '150').ok).toBe(false)
    expect(validateFieldValue('commute', 'publicHolidayRegion', 'BY')).toEqual(ok('BY'))
    expect(validateFieldValue('commute', 'publicHolidayRegion', 'Bayern und Umgebung').ok).toBe(false)
  })

  it('applies the interview question’s own rules', () => {
    // The value that once made a whole interview unreadable.
    expect(validateFieldValue('interview', 'job', 'angestellt')).toEqual(ok('Angestellt'))
    expect(validateFieldValue('interview', 'job', 'xyz-unsinn').ok).toBe(false)
    expect(validateFieldValue('interview', 'spenden-betrag', '300 €')).toEqual(ok('300'))
    expect(validateFieldValue('interview', 'spenden-betrag', 'spaeter')).toEqual(ok('spaeter'))
    expect(validateFieldValue('interview', 'job', 'spaeter').ok).toBe(false)
    expect(validateFieldValue('interview', 'weg', '1000').ok).toBe(false)
  })

  it('never accepts the nonsense value on any field with a fixed form', () => {
    const lenient = FIELD_CATALOG.filter((spec) => validateFieldValue(spec.screen, spec.field, 'xyz-unsinn').ok)
    // Free text is the only thing that may hold arbitrary words.
    expect(lenient.every((spec) => spec.value.kind === 'text')).toBe(true)
  })
})

describe('describeFieldForPrompt', () => {
  it('tells the model what a value looks like', () => {
    expect(describeFieldForPrompt(fieldSpec('lstb', 'bruttoarbeitslohn')!)).toBe('bruttoarbeitslohn (Betrag, ganze Zahl)')
    expect(describeFieldForPrompt(fieldSpec('commute', 'transport')!)).toBe('transport („pkw“ | „oepnv“ | „andere“)')
    expect(describeFieldForPrompt(fieldSpec('kind', 'registeredWithMeAllYear')!)).toBe('registeredWithMeAllYear („true“ | „false“)')
    expect(describeFieldForPrompt(fieldSpec('interview', 'weg')!)).toBe('weg (ganze Zahl 0–999)')
    expect(describeFieldForPrompt(fieldSpec('rente', 'rentenart')!)).toContain('„GesetzlicheRente“')
  })
})

describe('the Swiss pension split and the tax-free Krankentaggeld in the catalogue', () => {
  it('lets the owl write the employer total and the paid-out Krankentaggeld', () => {
    for (const field of ['pkArbeitgeberGesamtChf', 'steuerfreiesKrankentaggeldChf', 'pkArbeitnehmerChf', 'pkArbeitgeberChf']) {
      expect(fieldSpec('chLohnausweis', field)?.aiWritable, field).toBe(true)
    }
    expect(validateFieldValue('chLohnausweis', 'pkArbeitgeberGesamtChf', "7'186 CHF")).toEqual(ok('7186'))
  })

  it('tells the model which pension field holds what, so "7.186, davon obligatorisch 2.892" lands in two fields without arithmetic', () => {
    expect(describeFieldForPrompt(fieldSpec('chLohnausweis', 'berufliche-vorsorge')!)).toContain('obligatorisch und überobligatorisch zusammen')
    expect(describeFieldForPrompt(fieldSpec('chLohnausweis', 'pkArbeitnehmerChf')!)).toContain('nur der obligatorische BVG-Teil')
    expect(describeFieldForPrompt(fieldSpec('chLohnausweis', 'pkArbeitgeberChf')!)).toContain('nur der obligatorische BVG-Teil')
    expect(describeFieldForPrompt(fieldSpec('chLohnausweis', 'pkArbeitgeberGesamtChf')!)).toContain('alle Arbeitgeberbeiträge')
    expect(describeFieldForPrompt(fieldSpec('chLohnausweis', 'krankentaggeldChf')!)).toContain('nicht das ausgezahlte Taggeld')
    expect(describeFieldForPrompt(fieldSpec('chLohnausweis', 'steuerfreiesKrankentaggeldChf')!)).toBe(
      'steuerfreiesKrankentaggeldChf (Betrag, ganze Zahl; ausgezahltes steuerfreies Krankentaggeld, im Bruttolohn Ziffer 8 enthalten, N-Gre Zeile 9)',
    )
  })
})
