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
