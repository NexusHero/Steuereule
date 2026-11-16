import type { Screen } from '@steuereule/core'

export interface FormLineInfo {
  readonly form: string
  readonly line?: string | undefined
  readonly label: string
}

/**
 * Maps any field of the return (from Eulen-Entwürfe, Provenance, or masks) to its official BMF
 * Vordruck and line / Kennziffer („Glas-Erklärung“, UX review H2).
 */
export function formLineForField(screen: Screen, field?: string): FormLineInfo {
  const f = field?.trim() ?? ''

  switch (screen) {
    case 'lstb': {
      if (f === 'bruttoarbeitslohn') {
        return { form: 'Anlage N', line: 'Zeile 6 (Kz 110)', label: 'Anlage N · Zeile 6 (Kz 110)' }
      }
      if (f === 'lohnsteuer') {
        return { form: 'Anlage N', line: 'Zeile 7 (Kz 140)', label: 'Anlage N · Zeile 7 (Kz 140)' }
      }
      if (f === 'solidaritaetszuschlag') {
        return { form: 'Anlage N', line: 'Zeile 8 (Kz 150)', label: 'Anlage N · Zeile 8 (Kz 150)' }
      }
      if (f === 'kirchensteuer' || f === 'kirchensteuerEhegatte') {
        return { form: 'Anlage N', line: 'Zeilen 9–10', label: 'Anlage N · Zeilen 9–10' }
      }
      if (f === 'sozialversicherung' || f === 'steuerfreierAgZuschussKvPv') {
        return { form: 'Anlage Vorsorgeaufwand', line: 'Zeilen 12–28', label: 'Anlage Vorsorgeaufwand · Zeilen 12–28' }
      }
      return { form: 'Anlage N', line: 'Zeilen 6–10', label: 'Anlage N · Zeilen 6–10' }
    }

    case 'commute': {
      if (f === 'homeOfficeDays') {
        return { form: 'Anlage N', line: 'Zeile 45 (Kz 335)', label: 'Anlage N · Zeile 45 (Homeoffice)' }
      }
      if (f === 'professionalBodiesEur' || f === 'professionalBodiesNote') {
        return { form: 'Anlage N', line: 'Zeile 41 (Kz 310)', label: 'Anlage N · Zeile 41 (Berufsverbände)' }
      }
      if (f === 'workEquipmentEur' || f === 'workEquipmentNote') {
        return { form: 'Anlage N', line: 'Zeilen 42–43', label: 'Anlage N · Zeilen 42–43 (Arbeitsmittel)' }
      }
      if (f === 'accountFeesEur' || f === 'otherWorkExpensesEur' || f === 'otherWorkExpensesNote') {
        return { form: 'Anlage N', line: 'Zeilen 46–48', label: 'Anlage N · Zeilen 46–48 (Werbungskosten)' }
      }
      return { form: 'Anlage N', line: 'Zeilen 31–39', label: 'Anlage N · Zeilen 31–39 (Arbeitsweg)' }
    }

    case 'chLohnausweis': {
      if (f === 'withholdingTaxChf') {
        return { form: 'Anlage N-Gre', line: 'Zeile 24 (Kz 169)', label: 'Anlage N-Gre · Zeile 24 (Quellensteuer)' }
      }
      if (
        f === 'ahvContributionsChf' ||
        f === 'pkArbeitnehmerChf' ||
        f === 'pkArbeitgeberChf' ||
        f === 'pkArbeitnehmerGesamtChf' ||
        f === 'pkArbeitgeberGesamtChf'
      ) {
        return { form: 'Anlage N-Gre', line: 'Zeilen 81–93', label: 'Anlage N-Gre · Zeilen 81–93 (Vorsorge CH)' }
      }
      if (f.startsWith('krankentaggeld') || f.startsWith('nbuv') || f === 'steuerfreiesKrankentaggeldChf') {
        return { form: 'Anlage N-Gre', line: 'Zeilen 94–98', label: 'Anlage N-Gre · Zeilen 94–98 (NBUV / KTG)' }
      }
      if (f === 'familienzulagenChf') {
        return { form: 'Anlage N-Gre', line: 'Zeile 8', label: 'Anlage N-Gre · Zeile 8 (Familienzulagen)' }
      }
      return { form: 'Anlage N-Gre', line: 'Zeilen 6–24', label: 'Anlage N-Gre · Zeilen 6–24' }
    }

    case 'interview': {
      if (f === 'spenden' || f === 'spenden-betrag') {
        return { form: 'Anlage Sonderausgaben', line: 'Zeile 5', label: 'Anlage Sonderausgaben · Zeile 5' }
      }
      if (f.startsWith('kv-') || f === 'pv-betrag') {
        return { form: 'Anlage Vorsorgeaufwand', line: 'Zeilen 16–28', label: 'Anlage Vorsorgeaufwand · Zeilen 16–28' }
      }
      if (f.startsWith('riester')) {
        return { form: 'Anlage AV', line: 'Zeilen 4–20', label: 'Anlage AV · Zeilen 4–20' }
      }
      if (f === 'fortbildung' || f === 'fortbildung-kosten') {
        return { form: 'Anlage N', line: 'Zeile 46', label: 'Anlage N · Zeile 46 (Fortbildung)' }
      }
      if (f === 'umzug' || f === 'umzug-kosten') {
        return { form: 'Anlage N', line: 'Zeile 48', label: 'Anlage N · Zeile 48 (Umzugskosten)' }
      }
      if (f === 'dhf' || f === 'dhf-miete') {
        return { form: 'Anlage N-DHF', line: 'Zeilen 4–25', label: 'Anlage N · Doppelte Haushaltsführung' }
      }
      if (f === 'abfindung' || f === 'abfindung-betrag') {
        return { form: 'Anlage N', line: 'Zeilen 17–18', label: 'Anlage N · Zeilen 17–18 (Abfindung)' }
      }
      if (f === 'lohnersatz' || f === 'lohnersatz-betrag') {
        return { form: 'ESt 1 A', line: 'Zeile 43 (Kz 120)', label: 'Hauptvordruck ESt 1 A · Zeile 43' }
      }
      if (f.startsWith('haushalt-')) {
        return { form: 'Anlage Haushaltsnahe Aufwendungen', line: 'Zeilen 4–6', label: 'Anlage Haushaltsnahe Aufwendungen · Zeilen 4–6' }
      }
      if (f.startsWith('gesundheit-')) {
        return { form: 'Anlage Außerg. Belastungen', line: 'Zeile 13', label: 'Anlage Außerg. Belastungen · Zeile 13' }
      }
      if (f.startsWith('ae-')) {
        return { form: 'Anlage Kind', line: 'Zeilen 44–49', label: 'Anlage Kind · Zeilen 44–49 (Alleinerziehend)' }
      }
      if (f.startsWith('vorauszahlungen-')) {
        return { form: 'ESt 1 A', line: 'Anrechnung (§ 36 EStG)', label: 'Steuerabrechnung · Vorauszahlungen' }
      }
      if (f === 'ch-wohnsitz' || f === 'ch-nichtrueckkehrtage') {
        return { form: 'Anlage N-Gre', line: 'Zeile 5', label: 'Anlage N-Gre · Zeile 5 (60-Tage-Regel)' }
      }
      if (f === 'homeoffice' || f === 'weg' || f === 'tage') {
        return { form: 'Anlage N', line: 'Zeilen 31–45', label: 'Anlage N · Zeilen 31–45' }
      }
      if (f === 'kap-depot' || f === 'einkuenfte') {
        return { form: 'Anlage KAP / V', line: 'Zeilen 7–51', label: 'Anlage KAP / Anlage V' }
      }
      return { form: 'ESt 1 A', label: 'Hauptvordruck ESt 1 A' }
    }

    case 'kapital':
      return { form: 'Anlage KAP', line: 'Zeilen 7–51', label: 'Anlage KAP · Zeilen 7–51' }

    case 'vermietung': {
      if (f === 'mieteinnahmen') {
        return { form: 'Anlage V', line: 'Zeile 9', label: 'Anlage V · Zeile 9 (Kaltmiete)' }
      }
      if (f === 'umlagen') {
        return { form: 'Anlage V', line: 'Zeile 13', label: 'Anlage V · Zeile 13 (Umlagen)' }
      }
      if (f === 'anschaffungskosten' || f === 'baujahr' || f === 'depreciationAsLastYear') {
        return { form: 'Anlage V', line: 'Zeile 33', label: 'Anlage V · Zeile 33 (Gebäude-AfA)' }
      }
      if (f === 'schuldzinsen') {
        return { form: 'Anlage V', line: 'Zeile 37', label: 'Anlage V · Zeile 37 (Schuldzinsen)' }
      }
      if (f === 'werbungskosten') {
        return { form: 'Anlage V', line: 'Zeilen 46–50', label: 'Anlage V · Zeilen 46–50 (Werbungskosten)' }
      }
      if (f === 'anteilA') {
        return { form: 'Anlage V', line: 'Zeile 86', label: 'Anlage V · Zeile 86 (Miteigentumsanteil)' }
      }
      return { form: 'Anlage V', line: 'Zeilen 4–50', label: 'Anlage V · Zeilen 4–50' }
    }

    case 'kind': {
      if (f.startsWith('childcare')) {
        return { form: 'Anlage Kind', line: 'Zeile 67 (Kz 51)', label: 'Anlage Kind · Zeile 67 (Kinderbetreuung)' }
      }
      if (f === 'healthBasicEur' || f === 'careEur' || f === 'healthInsuranceAbroad') {
        return { form: 'Anlage Kind', line: 'Zeilen 31–37', label: 'Anlage Kind · Zeilen 31–37 (KV/PV Kind)' }
      }
      if (f === 'childBenefitClaimEur' || f === 'swissFamilyAllowanceEur' || f === 'childBenefitAllowanceFrom') {
        return { form: 'Anlage Kind', line: 'Zeile 6', label: 'Anlage Kind · Zeile 6 (Kindergeld / Zulage)' }
      }
      return { form: 'Anlage Kind', line: 'Zeilen 4–18', label: 'Anlage Kind · Zeilen 4–18' }
    }

    case 'rente':
      return { form: 'Anlage R', line: 'Zeilen 4–10', label: 'Anlage R · Zeilen 4–10' }

    case 'profil':
    case 'stammdaten':
    case 'kopplung':
      return { form: 'ESt 1 A', line: 'Zeilen 8–36', label: 'Hauptvordruck ESt 1 A · Zeilen 8–36' }

    case 'assessment':
      return { form: 'Bescheidprüfung', label: 'Steuerbescheid-Abgleich' }
  }
}

export interface AcroFieldJumpTarget {
  readonly screen: Screen
  readonly field?: string | undefined
  readonly person?: 'A' | 'B' | undefined
  readonly label: string
}

/**
 * Reverse mapping from an official BMF AcroForm field name (`est1a.*`, `anlN.*`, `anlNGre.*`,
 * `anlKind.*`, `anlV.*`, `anlKap.*`, `anlVorsorge.*`, `anlSo.*`, `anlAgb.*`, `anlHaushalt.*`,
 * `anlAV.*`, `anlR.*`) to the input mask and field the Power-User jumps to on click.
 */
export function maskTargetForAcroField(acroFieldId: string): AcroFieldJumpTarget {
  const cleanId = acroFieldId.split('#')[0] ?? acroFieldId
  const [prefix, key = ''] = cleanId.split('.')

  switch (prefix) {
    case 'est1a': {
      if (key.endsWith('B') || key === 'zusammenveranlagung' || key === 'einzelveranlagung') {
        return { screen: 'stammdaten', field: 'familienstand', person: 'B', label: `Hauptvordruck ESt 1 A · ${key}` }
      }
      if (key.startsWith('iban') || key.startsWith('kontoinhaber')) {
        return { screen: 'stammdaten', field: 'iban', person: 'A', label: 'Hauptvordruck ESt 1 A · Bankverbindung' }
      }
      if (key === 'steuernummer' || key === 'idnr' || key === 'name' || key === 'vorname') {
        return { screen: 'profil', field: key, person: 'A', label: `Hauptvordruck ESt 1 A · ${key}` }
      }
      return { screen: 'stammdaten', field: key, person: 'A', label: `Hauptvordruck ESt 1 A · ${key}` }
    }

    case 'anlN': {
      if (key === 'kz110') {
        return { screen: 'lstb', field: 'bruttoarbeitslohn', label: 'Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)' }
      }
      if (key === 'kz140') {
        return { screen: 'lstb', field: 'lohnsteuer', label: 'Anlage N · Zeile 7 (Kz 140 Lohnsteuer)' }
      }
      if (key === 'kz150') {
        return { screen: 'lstb', field: 'solidaritaetszuschlag', label: 'Anlage N · Zeile 8 (Kz 150 Solidaritätszuschlag)' }
      }
      if (key === 'kz142' || key === 'kz143') {
        return { screen: 'lstb', field: 'kirchensteuer', label: 'Anlage N · Zeilen 9–10 (Kirchensteuer)' }
      }
      if (key === 'kz335' || key.toLowerCase().includes('homeoffice')) {
        return { screen: 'commute', field: 'homeOfficeDays', label: 'Anlage N · Zeile 45 (Kz 335 Homeoffice-Tage)' }
      }
      if (key === 'kz310') {
        return { screen: 'commute', field: 'professionalBodiesEur', label: 'Anlage N · Zeile 41 (Kz 310 Berufsverbände)' }
      }
      if (key.startsWith('z42') || key.startsWith('z43')) {
        return { screen: 'commute', field: 'workEquipmentEur', label: 'Anlage N · Zeilen 42–43 (Arbeitsmittel)' }
      }
      if (key.startsWith('z46') || key === 'fortbildung') {
        return { screen: 'interview', field: 'fortbildung-kosten', label: 'Anlage N · Zeile 46 (Fortbildungskosten)' }
      }
      if (key.startsWith('z48')) {
        return { screen: 'interview', field: 'umzug-kosten', label: 'Anlage N · Zeile 48 (Weitere Werbungskosten)' }
      }
      if (key.startsWith('weg') || key.startsWith('kz11') || key.startsWith('kz13')) {
        return { screen: 'commute', field: 'oneWayKm', label: 'Anlage N · Zeilen 31–39 (Entfernungspauschale)' }
      }
      return { screen: 'lstb', field: 'bruttoarbeitslohn', label: `Anlage N · ${key}` }
    }

    case 'anlNGre': {
      if (key === 'kz169') {
        return { screen: 'chLohnausweis', field: 'withholdingTaxChf', label: 'Anlage N-Gre · Zeile 24 (Kz 169 Quellensteuer)' }
      }
      if (key.startsWith('z8') && !key.startsWith('z80') && !key.startsWith('z81') && !key.startsWith('z82') && !key.startsWith('z86') && !key.startsWith('z87')) {
        return { screen: 'chLohnausweis', field: 'familienzulagenChf', label: 'Anlage N-Gre · Zeile 8 (Familienzulagen)' }
      }
      if (key.startsWith('z9') && !key.startsWith('z93') && !key.startsWith('z94') && !key.startsWith('z98')) {
        return { screen: 'chLohnausweis', field: 'steuerfreiesKrankentaggeldChf', label: 'Anlage N-Gre · Zeile 9 (Krankentaggeld)' }
      }
      if (key.startsWith('z80') || key.startsWith('z81') || key.startsWith('z18') || key.startsWith('z19') || key.startsWith('z94') || key.startsWith('z98')) {
        return { screen: 'chLohnausweis', field: 'krankentaggeldChf', label: 'Anlage N-Gre · KTG / NBUV' }
      }
      if (key.startsWith('z82') || key.startsWith('z86') || key.startsWith('z87') || key.startsWith('z93') || key.startsWith('z20')) {
        return { screen: 'chLohnausweis', field: 'ahvContributionsChf', label: 'Anlage N-Gre · Zeilen 81–93 (AHV / Pensionskasse)' }
      }
      return { screen: 'chLohnausweis', field: 'grossWageChf', label: `Anlage N-Gre · ${key}` }
    }

    case 'anlKind': {
      if (key.startsWith('z67') || key.startsWith('kz51')) {
        return { screen: 'kind', field: 'childcareEur', label: 'Anlage Kind · Zeile 67 (Kinderbetreuungskosten)' }
      }
      if (key.startsWith('kz3') || key.startsWith('kz89')) {
        return { screen: 'kind', field: 'healthBasicEur', label: 'Anlage Kind · Zeilen 31–37 (KV/PV Kind)' }
      }
      if (key.startsWith('kz4')) {
        return { screen: 'interview', field: 'ae-weitere-person', label: 'Anlage Kind · Zeilen 44–49 (Entlastungsbetrag Alleinerziehende)' }
      }
      if (key === 'kindergeld' || key.startsWith('z6')) {
        return { screen: 'kind', field: 'childBenefitClaimEur', label: 'Anlage Kind · Zeile 6 (Kindergeld / Familienzulage)' }
      }
      return { screen: 'kind', field: 'firstName', label: `Anlage Kind · ${key}` }
    }

    case 'anlV': {
      if (key.includes('Miete') || key === 'kz01' || key === 'z32Einnahmen') {
        return { screen: 'vermietung', field: 'mieteinnahmen', label: 'Anlage V · Zeile 9 / 13 (Mieteinnahmen)' }
      }
      if (key.startsWith('z33') || key === 'kz30') {
        return { screen: 'vermietung', field: 'anschaffungskosten', label: 'Anlage V · Zeile 33 (Gebäude-AfA)' }
      }
      if (key.startsWith('z37') || key === 'kz37') {
        return { screen: 'vermietung', field: 'schuldzinsen', label: 'Anlage V · Zeile 37 (Schuldzinsen)' }
      }
      if (key.startsWith('z80') || key === 'kz49' || key === 'werbungskostenSumme') {
        return { screen: 'vermietung', field: 'werbungskosten', label: 'Anlage V · Werbungskosten' }
      }
      return { screen: 'vermietung', field: 'strasse', label: `Anlage V · ${key}` }
    }

    case 'anlKap':
      return { screen: 'kapital', field: 'kapitalertraege', label: `Anlage KAP · ${key}` }

    case 'anlR':
      return { screen: 'rente', field: 'jahresbetrag', label: `Anlage R · ${key}` }

    case 'anlVorsorge':
      return { screen: 'lstb', field: 'sozialversicherung', label: `Anlage Vorsorgeaufwand · ${key}` }

    case 'anlSo':
      return { screen: 'interview', field: 'spenden-betrag', label: `Anlage Sonderausgaben · ${key}` }

    case 'anlAV':
      return { screen: 'interview', field: 'riester-eigenbeitrag', label: `Anlage AV · ${key}` }

    case 'anlHaushalt':
      return { screen: 'interview', field: 'haushalt-handwerker-betrag', label: `Anlage Haushaltsnahe Aufwendungen · ${key}` }

    case 'anlAgb':
      return { screen: 'interview', field: 'gesundheit-betrag', label: `Anlage Außerg. Belastungen · ${key}` }

    default:
      return { screen: 'stammdaten', label: cleanId }
  }
}
