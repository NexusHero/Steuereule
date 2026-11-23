// One focused test per section builder of `printoutValues` (printout/values/). The whole output is
// pinned by printout-values.golden.test.ts; these say what each builder owns.
import { describe, expect, it } from 'vitest'
import { capitalSection, kapValues } from '../src/printout/values/capital.js'
import { anlageKindValues, childGapFields, childrenNamedSection, childrenSection } from '../src/printout/values/children.js'
import { crossBorderSection } from '../src/printout/values/cross-border.js'
import { anlageNValues, employmentSection } from '../src/printout/values/employment.js'
import { extraordinaryBurdensSection, householdServicesSection } from '../src/printout/values/household-and-health.js'
import { addLifeSituationWorkExpenses, lifeSituationsWithoutPrintoutSection } from '../src/printout/values/life-situations.js'
import { mainFormSection, progressionClauseSection } from '../src/printout/values/main-form.js'
import { pensionSection } from '../src/printout/values/pension.js'
import { provisionExpensesSection } from '../src/printout/values/provision-expenses.js'
import { anlageVValues, rentalGap, rentalSection } from '../src/printout/values/rental.js'
import { riesterSection } from '../src/printout/values/riester.js'
import { formHeader, germanWages, type Fields } from '../src/printout/values/section.js'
import { specialExpensesSection } from '../src/printout/values/special-expenses.js'
import { addOtherWorkExpense, commuteValues } from '../src/printout/values/work-expenses.js'
import { CHILD, CHILDREN, COMMUTE, CROSS_BORDER, GAPS, JOB_CHANGE, MARRIED, MARRIED_SEPARATE, MARRIED_UNLINKED, PROFILE, SINGLE } from './fixtures/printout-facts.js'

describe('section helpers', () => {
  it('formHeader names only what is known', () => {
    expect(formHeader('anlV', { lastName: 'Beispiel', firstName: null }, '2010304050')).toEqual({ 'anlV.name': 'Beispiel', 'anlV.steuernummer': '2010304050' })
    expect(formHeader('anlKind', PROFILE, null, 'vornameEltern')).toEqual({ 'anlKind.name': 'Beispiel', 'anlKind.vornameEltern': 'Anna' })
  })

  it('germanWages takes whole euros and Person B only in a joint return', () => {
    expect(germanWages(MARRIED)).toEqual({ a: '52000', b: '38000' })
    expect(germanWages(MARRIED_SEPARATE)).toEqual({ a: null, b: null })
    expect(germanWages(GAPS)).toEqual({ a: null, b: null })
  })
})

describe('mainFormSection (Hauptvordruck)', () => {
  it('names Person B in a joint return and the foreign IBAN with its holder', () => {
    const { values, missing } = mainFormSection(MARRIED)
    expect(missing).toEqual([])
    expect(values).toMatchObject({
      'est1a.zusammenveranlagung': true,
      'est1a.idnrB': '86095742719',
      'est1a.geburtsdatumB': '02.11.1989',
      'est1a.verheiratetSeit': '15.08.2015',
      'est1a.ibanAusland': 'CH9300762011623852957',
      'est1a.kontoinhaberName': 'Anna und Ben Beispiel',
      'est1a.finanzamt': 'Lörrach',
    })
    expect(values!['est1a.kontoinhaberSelbst']).toBeUndefined()
  })

  it('lists the identity gaps before the spouse', () => {
    expect(mainFormSection(MARRIED_UNLINKED).missing).toEqual(['iban', 'ehegatte'])
    expect(mainFormSection(MARRIED_SEPARATE).values).toMatchObject({ 'est1a.einzelveranlagung': true })
    expect(mainFormSection(GAPS).missing?.slice(0, 3)).toEqual(['vorname', 'steuerId', 'geburtsdatum'])
  })
})

describe('progressionClauseSection (Hauptvordruck Z. 35/36)', () => {
  it('takes the wage replacement of both spouses and the accident benefits', () => {
    expect(progressionClauseSection(MARRIED, { A: 1278, B: undefined }).values).toEqual({ 'est1a.kz121': '1500', 'est1a.kz136': '1278' })
    expect(progressionClauseSection(SINGLE, { A: undefined, B: undefined }).values).toEqual({ 'est1a.kz120': '2000' })
  })
})

describe('commute and work expenses', () => {
  it('commuteValues puts both ways and the further Werbungskosten into one form', () => {
    const values = commuteValues(COMMUTE, 'anlN')
    expect(values).toMatchObject({ 'anlN.kz111': '18', 'anlN.kz112': '18', 'anlN.wegVon': '01.01.', 'anlN.kz131': '9', 'anlN.weg2Ort': 'Basel' })
    expect(values).toMatchObject({ 'anlN.kz310': '120', 'anlN.z54Text': 'Laptop', 'anlN.kz380': '76' })
    expect(values['anlN.kz132']).toBeUndefined()
  })

  it('commuteValues gives the second way alone, as the first Angabe', () => {
    const values = commuteValues(COMMUTE, 'anlNGre', 'second')
    expect(values).toMatchObject({ 'anlNGre.kz111': '9', 'anlNGre.wegOrt': 'Basel' })
    expect(values['anlNGre.kz310']).toBeUndefined()
  })

  it('addOtherWorkExpense adds to the last line once both are taken, and keeps Kz 380 the sum', () => {
    const values: Fields = commuteValues(COMMUTE, 'anlN')
    addOtherWorkExpense(values, 'anlN', 'Umzug', 100)
    expect(values).toMatchObject({ 'anlN.z63Text': 'Weitere Werbungskosten', 'anlN.z63Eur': '160', 'anlN.kz380': '176' })
  })

  it('addLifeSituationWorkExpenses adds training and relocation', () => {
    const values: Fields = {}
    addLifeSituationWorkExpenses(values, 'anlNGre', { trainingEur: 300, relocationEur: 50, wageReplacementEur: null, severance: false, secondHousehold: false })
    expect(values).toEqual({ 'anlNGre.kz330': '300', 'anlNGre.z57Text': 'Umzugskosten (beruflich veranlasst)', 'anlNGre.z57Eur': '50', 'anlNGre.kz380': '50' })
  })
})

describe('employmentSection (Anlage N)', () => {
  it('puts a single earner onto the main set', () => {
    const { values, instances } = employmentSection(SINGLE)
    expect(instances).toBeUndefined()
    expect(values).toMatchObject({ 'anlN.kz110': '42000', 'anlN.personA': true, 'anlN.kz330': '900', 'anlN.name': 'Beispiel' })
  })

  it('gives each spouse an instance once Person B has a German wage', () => {
    const forms = employmentSection(MARRIED).instances!['anlage-n']!
    expect(forms.map((form) => [form['anlN.kz110'], form['anlN.personA'] ?? form['anlN.personB'], form['anlN.vorname']])).toEqual([
      ['52000', true, 'Anna'],
      ['38000', true, 'Ben'],
    ])
    expect(forms[1]).toMatchObject({ 'anlN.kz111': '4', 'anlN.kz330': '250', 'anlN.steuernummer': '2010304050' })
  })

  it('keeps only the way before the change to a Swiss employer', () => {
    const form = anlageNValues(
      { role: 'A', gross: '20000', lastName: 'Beispiel', firstName: 'Anna', commute: COMMUTE, chSalaryCertificate: JOB_CHANGE.chSalaryCertificate, lifeSituations: null },
      null,
    )
    expect(form).toMatchObject({ 'anlN.kz111': '18', 'anlN.kz310': '120' })
    expect(form['anlN.kz131']).toBeUndefined()
  })
})

describe('pensionSection (Anlage R)', () => {
  it('gives each spouse an instance with their Kennzahl', () => {
    const forms = pensionSection(MARRIED).instances!['anlage-r']!
    expect(forms).toEqual([
      { 'anlR.kz101': '2400', 'anlR.personA': true, 'anlR.lfdNr': '1', 'anlR.name': 'Beispiel', 'anlR.vorname': 'Anna', 'anlR.steuernummer': '2010304050' },
      { 'anlR.kz131': '1200', 'anlR.personB': true, 'anlR.lfdNr': '1', 'anlR.name': 'Beispiel', 'anlR.vorname': 'Ben', 'anlR.steuernummer': '2010304050' },
    ])
  })

  it('names a company pension once even when both spouses have one', () => {
    expect(pensionSection(SINGLE).values).toMatchObject({ 'anlR.kz101': '3600', 'anlR.personA': true })
    expect(pensionSection({ ...MARRIED, pension: { rentenart: 'Betriebsrente', jahresbetrag: '1' }, link: { filingType: 'zusammen', personB: { ...MARRIED.link!.personB!, pension: { rentenart: 'Betriebsrente', jahresbetrag: '2' } } } })).toEqual({ missing: ['anlageRAvBav'] })
  })
})

describe('capitalSection (Anlage KAP)', () => {
  it('splits a joint account half and half, A gets the odd euro', () => {
    const [a, b] = capitalSection(MARRIED).instances!['anlage-kap']!
    expect([a!['anlKap.kz234'], b!['anlKap.kz234'], a!['anlKap.kz218'], b!['anlKap.kz218']]).toEqual(['751', '750', '1000', '1000'])
    expect(b).toMatchObject({ 'anlKap.personB': true, 'anlKap.vorname': 'Ben' })
  })

  it('puts Person B’s account onto B’s form and names a crypto depot as a gap', () => {
    expect(capitalSection(CROSS_BORDER).instances!['anlage-kap']![0]).toMatchObject({ 'anlKap.personB': true, 'anlKap.kz210': '800' })
    expect(capitalSection(GAPS)).toEqual({ missing: ['anlageKapKrypto'] })
    expect(kapValues({ depot: 'deutscher-broker', kapitalertraege: '10', kirchensteuer: '3' }, 'A', -1, { name: null, firstName: null }, null)).toMatchObject({ 'anlKap.kz282': '3,00' })
  })
})

describe('crossBorderSection (Anlage N-Gre)', () => {
  it('gives both commuting spouses an instance and returns the accident benefit', () => {
    const section = crossBorderSection(CROSS_BORDER)
    const [a, b] = section.instances!['anlage-n-gre']!
    expect(section.missing).toEqual([])
    expect(section.accidentBenefitEur.A).toBe(1278)
    expect(section.accidentBenefitEur.B).toBe(0)
    // A has no German employer: the life situations go into the N-Gre; B's go into B's Anlage N.
    expect(a).toMatchObject({ 'anlNGre.personA': true, 'anlNGre.kz330': '700' })
    expect(b).toMatchObject({ 'anlNGre.personB': true, 'anlNGre.kz111': '9', 'anlNGre.wegOrt': 'Basel' })
    expect(b!['anlNGre.kz330']).toBeUndefined()
  })

  it('puts Person A’s form alone onto the main set and names each special case', () => {
    expect(crossBorderSection(JOB_CHANGE).values).toMatchObject({ 'anlNGre.personA': true, 'anlNGre.kz111': '9' })
    expect(crossBorderSection({ ...CROSS_BORDER, link: { filingType: 'zusammen', personB: { ...CROSS_BORDER.link!.personB!, chSalaryCertificate: { ...CROSS_BORDER.chSalaryCertificate!, specialCases: true } } }, chSalaryCertificate: { ...CROSS_BORDER.chSalaryCertificate!, specialCases: true } }).missing).toEqual([
      'anlageNGreSonderfall',
      'anlageNGreSonderfall',
    ])
  })
})

describe('life situations without a printout', () => {
  it('names the Abfindung and the doppelte Haushaltsführung once', () => {
    expect(lifeSituationsWithoutPrintoutSection(GAPS).missing).toEqual(['anlageNEntschaedigung', 'anlageNDhf'])
    expect(lifeSituationsWithoutPrintoutSection(CROSS_BORDER).missing).toEqual(['anlageNDhf'])
  })
})

describe('rentalSection (Anlage V)', () => {
  it('computes the AfA, the surplus and the split in a joint return', () => {
    const [form] = rentalSection(MARRIED).instances!['anlage-v']!
    expect(form).toMatchObject({ 'anlV.z33Satz': '2', 'anlV.kz30': '6000', 'anlV.werbungskostenSumme': '8500', 'anlV.ueberschuss': '3500', 'anlV.kz20': '2450', 'anlV.kz21': '1050' })
  })

  it('stops after the property while rent or costs are unclear', () => {
    expect(Object.keys(anlageVValues(GAPS.rental![0]!, 0, PROFILE, false))).toEqual(['anlV.name', 'anlV.vorname', 'anlV.steuernummer', 'anlV.lfdNr'])
    expect(rentalSection(SINGLE).missing).toEqual(['anlageVAfaNeu'])
    expect(rentalGap(GAPS.rental![0]!)).toBe('vermietung')
  })
})

describe('children (Anlage Kind)', () => {
  it('fills the single parent’s Entlastungsbetrag and the other parent', () => {
    const form = anlageKindValues(CHILD, 0, SINGLE, true)
    expect(form).toMatchObject({ 'anlKind.lfdNr': '1', 'anlKind.kz42Von': '01.01.2025', 'anlKind.kz46': '2', 'anlKind.aeName': 'Max Muster', 'anlKind.kz51': '1800' })
    expect(form['anlKind.nachname']).toBeUndefined()
  })

  it('uses the Swiss differential and a foreign insurer in a joint return', () => {
    const [first, second] = childrenSection(MARRIED).instances!['anlage-kind']!
    expect(first).toMatchObject({ 'anlKind.kz03': '1' })
    expect(first!['anlKind.aeName']).toBeUndefined()
    expect(second).toMatchObject({ 'anlKind.kz89': '480', 'anlKind.nachname': 'Muster', 'anlKind.inlandVon': '10.04.2025' })
  })

  it('names each gap once and the details behind „kinder“', () => {
    const { missing, childFields } = childrenSection(CHILDREN)
    expect(missing).toEqual(['anlageKindAndererElternteilAusland', 'anlageKindVolljaehrig', 'kinder', 'anlageKindAusland'])
    expect(childFields).toEqual(['taxId', 'kinship', 'residence', 'otherParent'])
    expect(childGapFields(CHILD, 2025, false)).toEqual([])
  })

  it('childrenNamedSection names children answered but not recorded', () => {
    expect(childrenNamedSection(GAPS)).toEqual({ missing: ['kinder'], childFields: ['child'] })
    expect(childrenNamedSection(SINGLE)).toEqual({})
  })
})

describe('the smaller Anlagen', () => {
  it('specialExpensesSection prints whole-euro donations only', () => {
    expect(specialExpensesSection(SINGLE).values).toEqual({ 'anlSo.name': 'Beispiel', 'anlSo.vorname': 'Anna', 'anlSo.steuernummer': '2010304050', 'anlSo.spenden': '250' })
    expect(specialExpensesSection(GAPS)).toEqual({})
  })

  it('provisionExpensesSection sums A’s Kennzahlen and gives B the 4xx column', () => {
    expect(provisionExpensesSection(SINGLE).values).toMatchObject({ 'anlVor.kz326': '3000', 'anlVor.kz328': '3000', 'anlVor.kz333': '1000', 'anlVor.kz334': '1000', 'anlVor.kz339': '50' })
    expect(provisionExpensesSection(MARRIED).values).toMatchObject({ 'anlVor.kz326': '2800', 'anlVor.kz450': '2400', 'anlVor.kz451': '300', 'anlVor.kz454': '150' })
    expect(provisionExpensesSection(GAPS)).toEqual({})
  })

  it('extraordinaryBurdensSection puts costs and reimbursements on their own lines', () => {
    expect(extraordinaryBurdensSection(SINGLE).values).toMatchObject({ 'anlAgB.kz302': '1800', 'anlAgB.kz303': '300' })
    expect(extraordinaryBurdensSection(MARRIED)).toEqual({})
  })

  it('householdServicesSection fills Zeilen 4–6', () => {
    expect(householdServicesSection(SINGLE).values).toMatchObject({ 'anlHha.kz202': '1200', 'anlHha.kz212': '600', 'anlHha.z6Rechnung': '2000', 'anlHha.kz214': '800' })
    expect(householdServicesSection(MARRIED)).toEqual({})
  })

  it('riesterSection needs the income for direct eligibility', () => {
    expect(riesterSection(SINGLE).values).toMatchObject({ 'anlAv.unmittelbar': '1', 'anlAv.kz100': '41000' })
    expect(riesterSection(JOB_CHANGE).values).toMatchObject({ 'anlAv.mittelbar': '2' })
    expect(riesterSection(GAPS)).toEqual({ missing: ['riester'] })
  })
})
