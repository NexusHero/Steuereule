import type { Screen } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { formLineForField, maskTargetForAcroField } from './formLineMapping'

describe('formLineForField', () => {
  const cases: ReadonlyArray<readonly [Screen, string | undefined, string, string | undefined]> = [
    ['lstb', 'bruttoarbeitslohn', 'Anlage N', 'Zeile 6 (Kz 110)'],
    ['lstb', 'lohnsteuer', 'Anlage N', 'Zeile 7 (Kz 140)'],
    ['lstb', 'solidaritaetszuschlag', 'Anlage N', 'Zeile 8 (Kz 150)'],
    ['lstb', 'kirchensteuer', 'Anlage N', 'Zeilen 9–10'],
    ['lstb', 'kirchensteuerEhegatte', 'Anlage N', 'Zeilen 9–10'],
    ['lstb', 'sozialversicherung', 'Anlage Vorsorgeaufwand', 'Zeilen 12–28'],
    ['lstb', 'steuerfreierAgZuschussKvPv', 'Anlage Vorsorgeaufwand', 'Zeilen 12–28'],
    ['lstb', undefined, 'Anlage N', 'Zeilen 6–10'],
    ['commute', 'homeOfficeDays', 'Anlage N', 'Zeile 45 (Kz 335)'],
    ['commute', 'professionalBodiesEur', 'Anlage N', 'Zeile 41 (Kz 310)'],
    ['commute', 'professionalBodiesNote', 'Anlage N', 'Zeile 41 (Kz 310)'],
    ['commute', 'workEquipmentEur', 'Anlage N', 'Zeilen 42–43'],
    ['commute', 'workEquipmentNote', 'Anlage N', 'Zeilen 42–43'],
    ['commute', 'accountFeesEur', 'Anlage N', 'Zeilen 46–48'],
    ['commute', 'otherWorkExpensesEur', 'Anlage N', 'Zeilen 46–48'],
    ['commute', 'otherWorkExpensesNote', 'Anlage N', 'Zeilen 46–48'],
    ['commute', 'oneWayKm', 'Anlage N', 'Zeilen 31–39'],
    ['chLohnausweis', 'withholdingTaxChf', 'Anlage N-Gre', 'Zeile 24 (Kz 169)'],
    ['chLohnausweis', 'ahvContributionsChf', 'Anlage N-Gre', 'Zeilen 81–93'],
    ['chLohnausweis', 'pkArbeitnehmerChf', 'Anlage N-Gre', 'Zeilen 81–93'],
    ['chLohnausweis', 'pkArbeitgeberChf', 'Anlage N-Gre', 'Zeilen 81–93'],
    ['chLohnausweis', 'pkArbeitnehmerGesamtChf', 'Anlage N-Gre', 'Zeilen 81–93'],
    ['chLohnausweis', 'pkArbeitgeberGesamtChf', 'Anlage N-Gre', 'Zeilen 81–93'],
    ['chLohnausweis', 'krankentaggeldChf', 'Anlage N-Gre', 'Zeilen 94–98'],
    ['chLohnausweis', 'nbuvChf', 'Anlage N-Gre', 'Zeilen 94–98'],
    ['chLohnausweis', 'steuerfreiesKrankentaggeldChf', 'Anlage N-Gre', 'Zeilen 94–98'],
    ['chLohnausweis', 'familienzulagenChf', 'Anlage N-Gre', 'Zeile 8'],
    ['chLohnausweis', 'grossWageChf', 'Anlage N-Gre', 'Zeilen 6–24'],
    ['interview', 'spenden', 'Anlage Sonderausgaben', 'Zeile 5'],
    ['interview', 'spenden-betrag', 'Anlage Sonderausgaben', 'Zeile 5'],
    ['interview', 'kv-beitrag', 'Anlage Vorsorgeaufwand', 'Zeilen 16–28'],
    ['interview', 'pv-betrag', 'Anlage Vorsorgeaufwand', 'Zeilen 16–28'],
    ['interview', 'riester-eigenbeitrag', 'Anlage AV', 'Zeilen 4–20'],
    ['interview', 'fortbildung', 'Anlage N', 'Zeile 46'],
    ['interview', 'fortbildung-kosten', 'Anlage N', 'Zeile 46'],
    ['interview', 'umzug', 'Anlage N', 'Zeile 48'],
    ['interview', 'umzug-kosten', 'Anlage N', 'Zeile 48'],
    ['interview', 'dhf', 'Anlage N-DHF', 'Zeilen 4–25'],
    ['interview', 'dhf-miete', 'Anlage N-DHF', 'Zeilen 4–25'],
    ['interview', 'abfindung', 'Anlage N', 'Zeilen 17–18'],
    ['interview', 'abfindung-betrag', 'Anlage N', 'Zeilen 17–18'],
    ['interview', 'lohnersatz', 'ESt 1 A', 'Zeile 43 (Kz 120)'],
    ['interview', 'lohnersatz-betrag', 'ESt 1 A', 'Zeile 43 (Kz 120)'],
    ['interview', 'haushalt-handwerker', 'Anlage Haushaltsnahe Aufwendungen', 'Zeilen 4–6'],
    ['interview', 'gesundheit-betrag', 'Anlage Außerg. Belastungen', 'Zeile 13'],
    ['interview', 'ae-weitere-person', 'Anlage Kind', 'Zeilen 44–49'],
    ['interview', 'vorauszahlungen-q1', 'ESt 1 A', 'Anrechnung (§ 36 EStG)'],
    ['interview', 'ch-wohnsitz', 'Anlage N-Gre', 'Zeile 5'],
    ['interview', 'ch-nichtrueckkehrtage', 'Anlage N-Gre', 'Zeile 5'],
    ['interview', 'homeoffice', 'Anlage N', 'Zeilen 31–45'],
    ['interview', 'weg', 'Anlage N', 'Zeilen 31–45'],
    ['interview', 'tage', 'Anlage N', 'Zeilen 31–45'],
    ['interview', 'kap-depot', 'Anlage KAP / V', 'Zeilen 7–51'],
    ['interview', 'einkuenfte', 'Anlage KAP / V', 'Zeilen 7–51'],
    ['interview', 'something-else', 'ESt 1 A', undefined],
    ['kapital', 'kapitalertraege', 'Anlage KAP', 'Zeilen 7–51'],
    ['vermietung', 'mieteinnahmen', 'Anlage V', 'Zeile 9'],
    ['vermietung', 'umlagen', 'Anlage V', 'Zeile 13'],
    ['vermietung', 'anschaffungskosten', 'Anlage V', 'Zeile 33'],
    ['vermietung', 'baujahr', 'Anlage V', 'Zeile 33'],
    ['vermietung', 'depreciationAsLastYear', 'Anlage V', 'Zeile 33'],
    ['vermietung', 'schuldzinsen', 'Anlage V', 'Zeile 37'],
    ['vermietung', 'werbungskosten', 'Anlage V', 'Zeilen 46–50'],
    ['vermietung', 'anteilA', 'Anlage V', 'Zeile 86'],
    ['vermietung', 'strasse', 'Anlage V', 'Zeilen 4–50'],
    ['kind', 'childcareEur', 'Anlage Kind', 'Zeile 67 (Kz 51)'],
    ['kind', 'healthBasicEur', 'Anlage Kind', 'Zeilen 31–37'],
    ['kind', 'careEur', 'Anlage Kind', 'Zeilen 31–37'],
    ['kind', 'healthInsuranceAbroad', 'Anlage Kind', 'Zeilen 31–37'],
    ['kind', 'childBenefitClaimEur', 'Anlage Kind', 'Zeile 6'],
    ['kind', 'swissFamilyAllowanceEur', 'Anlage Kind', 'Zeile 6'],
    ['kind', 'childBenefitAllowanceFrom', 'Anlage Kind', 'Zeile 6'],
    ['kind', 'firstName', 'Anlage Kind', 'Zeilen 4–18'],
    ['rente', 'jahresbetrag', 'Anlage R', 'Zeilen 4–10'],
    ['profil', undefined, 'ESt 1 A', 'Zeilen 8–36'],
    ['stammdaten', 'iban', 'ESt 1 A', 'Zeilen 8–36'],
    ['kopplung', 'partner', 'ESt 1 A', 'Zeilen 8–36'],
    ['assessment', undefined, 'Bescheidprüfung', undefined],
    ['buchung', undefined, 'Anlage EÜR', undefined],
  ]

  it.each(cases)('%s / %s lands on %s %s', (screen, field, form, line) => {
    const info = formLineForField(screen, field)
    expect(info.form).toBe(form)
    expect(info.line).toBe(line)
    expect(info.label.length).toBeGreaterThan(0)
  })

  it('trims whitespace around the field name', () => {
    expect(formLineForField('lstb', '  lohnsteuer  ').line).toBe('Zeile 7 (Kz 140)')
  })
})

describe('maskTargetForAcroField', () => {
  const cases: ReadonlyArray<readonly [string, string, string | undefined, 'A' | 'B' | undefined]> = [
    ['est1a.vornameB', 'stammdaten', 'familienstand', 'B'],
    ['est1a.zusammenveranlagung', 'stammdaten', 'familienstand', 'B'],
    ['est1a.einzelveranlagung', 'stammdaten', 'familienstand', 'B'],
    ['est1a.iban', 'stammdaten', 'iban', 'A'],
    ['est1a.kontoinhaber', 'stammdaten', 'iban', 'A'],
    ['est1a.steuernummer', 'profil', 'steuernummer', 'A'],
    ['est1a.idnr', 'profil', 'idnr', 'A'],
    ['est1a.name', 'profil', 'name', 'A'],
    ['est1a.vorname', 'profil', 'vorname', 'A'],
    ['est1a.strasse', 'stammdaten', 'strasse', 'A'],
    ['anlN.kz110', 'lstb', 'bruttoarbeitslohn', undefined],
    ['anlN.kz140', 'lstb', 'lohnsteuer', undefined],
    ['anlN.kz150', 'lstb', 'solidaritaetszuschlag', undefined],
    ['anlN.kz142', 'lstb', 'kirchensteuer', undefined],
    ['anlN.kz143', 'lstb', 'kirchensteuer', undefined],
    ['anlN.kz335', 'commute', 'homeOfficeDays', undefined],
    ['anlN.myHomeoffice', 'commute', 'homeOfficeDays', undefined],
    ['anlN.kz310', 'commute', 'professionalBodiesEur', undefined],
    ['anlN.z42a', 'commute', 'workEquipmentEur', undefined],
    ['anlN.z43', 'commute', 'workEquipmentEur', undefined],
    ['anlN.z46', 'interview', 'fortbildung-kosten', undefined],
    ['anlN.fortbildung', 'interview', 'fortbildung-kosten', undefined],
    ['anlN.z48x', 'interview', 'umzug-kosten', undefined],
    ['anlN.weg1', 'commute', 'oneWayKm', undefined],
    ['anlN.kz111', 'commute', 'oneWayKm', undefined],
    ['anlN.kz130', 'commute', 'oneWayKm', undefined],
    ['anlN.unknown', 'lstb', 'bruttoarbeitslohn', undefined],
    ['anlNGre.kz169', 'chLohnausweis', 'withholdingTaxChf', undefined],
    ['anlNGre.z8', 'chLohnausweis', 'familienzulagenChf', undefined],
    ['anlNGre.z9', 'chLohnausweis', 'steuerfreiesKrankentaggeldChf', undefined],
    ['anlNGre.z80', 'chLohnausweis', 'krankentaggeldChf', undefined],
    ['anlNGre.z18', 'chLohnausweis', 'krankentaggeldChf', undefined],
    ['anlNGre.z94', 'chLohnausweis', 'krankentaggeldChf', undefined],
    ['anlNGre.z82', 'chLohnausweis', 'ahvContributionsChf', undefined],
    ['anlNGre.z93', 'chLohnausweis', 'ahvContributionsChf', undefined],
    ['anlNGre.z20', 'chLohnausweis', 'ahvContributionsChf', undefined],
    ['anlNGre.z1', 'chLohnausweis', 'grossWageChf', undefined],
    ['anlKind.z67', 'kind', 'childcareEur', undefined],
    ['anlKind.kz51', 'kind', 'childcareEur', undefined],
    ['anlKind.kz31', 'kind', 'healthBasicEur', undefined],
    ['anlKind.kz89', 'kind', 'healthBasicEur', undefined],
    ['anlKind.kz44', 'interview', 'ae-weitere-person', undefined],
    ['anlKind.kindergeld', 'kind', 'childBenefitClaimEur', undefined],
    ['anlKind.z6', 'kind', 'childBenefitClaimEur', undefined],
    ['anlKind.vorname', 'kind', 'firstName', undefined],
    ['anlV.kaltMiete', 'vermietung', 'mieteinnahmen', undefined],
    ['anlV.kz01', 'vermietung', 'mieteinnahmen', undefined],
    ['anlV.z32Einnahmen', 'vermietung', 'mieteinnahmen', undefined],
    ['anlV.z33a', 'vermietung', 'anschaffungskosten', undefined],
    ['anlV.kz30', 'vermietung', 'anschaffungskosten', undefined],
    ['anlV.z37', 'vermietung', 'schuldzinsen', undefined],
    ['anlV.kz37', 'vermietung', 'schuldzinsen', undefined],
    ['anlV.z80', 'vermietung', 'werbungskosten', undefined],
    ['anlV.kz49', 'vermietung', 'werbungskosten', undefined],
    ['anlV.werbungskostenSumme', 'vermietung', 'werbungskosten', undefined],
    ['anlV.plz', 'vermietung', 'strasse', undefined],
    ['anlKap.z7', 'kapital', 'kapitalertraege', undefined],
    ['anlR.z4', 'rente', 'jahresbetrag', undefined],
    ['anlVor.z12', 'lstb', 'sozialversicherung', undefined],
    ['anlSo.z5', 'interview', 'spenden-betrag', undefined],
    ['anlAv.z4', 'interview', 'riester-eigenbeitrag', undefined],
    ['anlHha.z4', 'interview', 'haushalt-handwerker-betrag', undefined],
    ['anlAgB.z13', 'interview', 'gesundheit-betrag', undefined],
  ]

  it.each(cases)('%s jumps to %s / %s', (id, screen, field, person) => {
    const target = maskTargetForAcroField(id)
    expect(target.screen).toBe(screen)
    expect(target.field).toBe(field)
    expect(target.person).toBe(person)
    expect(target.label.length).toBeGreaterThan(0)
  })

  it('ignores the "#" instance suffix of repeated fields', () => {
    expect(maskTargetForAcroField('anlN.kz140#2').field).toBe('lohnsteuer')
  })

  it('falls back to the master data for an unknown form prefix, labelled with the cleaned id', () => {
    const target = maskTargetForAcroField('mystery.field#3')
    expect(target).toEqual({ screen: 'stammdaten', label: 'mystery.field' })
  })

  it('keeps the field key readable in the label of a generic ESt 1 A field', () => {
    expect(maskTargetForAcroField('est1a.strasse').label).toContain('strasse')
  })
})
