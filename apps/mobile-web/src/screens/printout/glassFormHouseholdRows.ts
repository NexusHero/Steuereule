// Sections of the main form, the provision annex and the household annex: Hauptvordruck ESt 1 A,
// Anlage Vorsorgeaufwand / Sonderausgaben / AV, Haushaltsnahe Aufwendungen & agB.
import { amountFromAnswer, formatEuro, type Answers } from '@steuereule/core'
import type { LinkResponseDto, LstbResponseDto, MasterDataResponseDto } from '@steuereule/api-client'
import { copyOf, provisionRows } from './liveFormRows'
import type { GlassFormRow, GlassFormSection, GlassLiveValues, GlassRowContext } from './glassFormTypes'

/** 1. Hauptvordruck ESt 1 A */
export function est1aSection(
  md: MasterDataResponseDto | null,
  linkData: LinkResponseDto | null,
  answers: Answers,
  answersB: Answers,
  { isJoint, partnerName, prov }: GlassRowContext,
): GlassFormSection | null {
  const est1aRows: GlassFormRow[] = []
  if (md?.wohnort || md?.strasse) {
    est1aRows.push({
      id: 'est1a-adresse',
      line: 'Zeilen 8–14',
      label: 'Wohnsitz & Steuerpflichtige Person A',
      value: [md.strasse, md.hausnummer, md.plz, md.wohnort].filter(Boolean).join(' '),
      person: 'A',
      provenanceLabel: prov('stammdaten', 'wohnort'),
      screen: 'stammdaten',
      field: 'wohnort',
    })
  }
  if (md?.familienstand) {
    est1aRows.push({
      id: 'est1a-familienstand',
      line: 'Zeile 18',
      label: 'Familienstand',
      value: md.familienstand === 'verheiratet' ? 'Verheiratet' : md.familienstand,
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('stammdaten', 'familienstand'),
      screen: 'stammdaten',
      field: 'familienstand',
    })
  }
  if (isJoint) {
    est1aRows.push({
      id: 'est1a-veranlagung',
      line: 'Zeilen 19–24',
      label: `Zusammenveranlagung mit ${partnerName}`,
      value: [linkData?.personB?.firstName, linkData?.personB?.lastName, linkData?.personB?.beruf]
        .filter(Boolean)
        .join(' · ') || 'Gemeinsame Erklärung (§ 26b EStG)',
      person: 'gemeinsam',
      provenanceLabel: prov('kopplung', 'filingType'),
      screen: 'stammdaten',
      field: 'familienstand',
    })
  }
  if (md?.iban) {
    est1aRows.push({
      id: 'est1a-iban',
      line: 'Zeilen 31–36',
      label: 'Bankverbindung für Erstattung (IBAN)',
      value: md.iban,
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('stammdaten', 'iban'),
      screen: 'stammdaten',
      field: 'iban',
    })
  }
  const lohnersatzA = amountFromAnswer(answers['lohnersatz-betrag'])
  if (lohnersatzA !== null && lohnersatzA > 0) {
    est1aRows.push({
      id: 'est1a-lohnersatz-a',
      line: 'Zeile 43 (Kz 120)',
      label: 'Einkommensersatzleistungen (Progressionsvorbehalt)',
      value: formatEuro(lohnersatzA),
      person: 'A',
      provenanceLabel: prov('interview', 'lohnersatz-betrag'),
      screen: 'interview',
      field: 'lohnersatz-betrag',
    })
  }
  const lohnersatzB = amountFromAnswer(answersB['lohnersatz-betrag'])
  if (lohnersatzB !== null && lohnersatzB > 0) {
    est1aRows.push({
      id: 'est1a-lohnersatz-b',
      line: 'Zeile 43 (Kz 121)',
      label: `Einkommensersatzleistungen (${partnerName})`,
      value: formatEuro(lohnersatzB),
      person: 'B',
      provenanceLabel: prov('interview', 'lohnersatz-betrag'),
      screen: 'interview',
      field: 'lohnersatz-betrag',
    })
  }
  const vorauszahlungen = amountFromAnswer(answers['vorauszahlungen-betrag'])
  if (vorauszahlungen !== null && vorauszahlungen > 0) {
    est1aRows.push({
      id: 'est1a-vorauszahlungen',
      line: 'Anrechnung (§ 36)',
      label: 'Geleistete Einkommensteuer-Vorauszahlungen',
      value: formatEuro(vorauszahlungen),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'vorauszahlungen-betrag'),
      screen: 'interview',
      field: 'vorauszahlungen-betrag',
    })
  }
  if (est1aRows.length === 0) return null
  return {
    formId: 'est1a',
    title: 'Hauptvordruck ESt 1 A',
    subtitle: 'Stammdaten, Veranlagungsart, Bankverbindung & Progressionsvorbehalt',
    rows: est1aRows,
  }
}

/** 4. Anlage Vorsorgeaufwand, Sonderausgaben & AV */
export function vorsorgeSection(
  lstb: LstbResponseDto | null,
  lstbB: LstbResponseDto | null,
  answers: Answers,
  live: GlassLiveValues,
  { year, isJoint, partnerName, tr, prov }: GlassRowContext,
): GlassFormSection | null {
  const vorsorgeRows: GlassFormRow[] = []
  if (lstb?.sozialversicherung.kind === 'erfasst' && lstb.sozialversicherung.value !== undefined) {
    vorsorgeRows.push({
      id: 'vorsorge-sv-a',
      line: 'Vorsorge Z. 12–28',
      label: 'Arbeitnehmeranteil Sozialversicherung (LStB Z. 23–27)',
      value: formatEuro(lstb.sozialversicherung.value),
      person: 'A',
      provenanceLabel: prov('lstb', 'sozialversicherung'),
      screen: 'lstb',
      field: 'sozialversicherung',
    })
  }
  if (isJoint && lstbB?.sozialversicherung.kind === 'erfasst' && lstbB.sozialversicherung.value !== undefined) {
    vorsorgeRows.push({
      id: 'vorsorge-sv-b',
      line: 'Vorsorge Z. 12–28 (B)',
      label: `Arbeitnehmeranteil Sozialversicherung (${partnerName})`,
      value: formatEuro(lstbB.sozialversicherung.value),
      person: 'B',
      provenanceLabel: prov('lstb', 'sozialversicherung'),
      screen: 'lstb',
      field: 'sozialversicherung',
    })
  }
  // Self-paid insurance as the Anlage Vorsorgeaufwand prints it, for both persons; the interview's own
  // amount only while there are no printed values.
  const provisionCopy = copyOf(live.forms, 'anlage-vorsorgeaufwand', null)
  if (provisionCopy) vorsorgeRows.push(...provisionRows(provisionCopy, isJoint, { year, tr, prov }))
  const kvPv = amountFromAnswer(answers['kv-pv-betrag'])
  if (!live.hasLive && kvPv !== null && kvPv > 0) {
    vorsorgeRows.push({
      id: 'vorsorge-kv-a',
      line: 'Vorsorge Z. 16–28',
      label: 'Selbst gezahlte Krankenversicherung (Basisabsicherung)',
      value: formatEuro(kvPv),
      person: 'A',
      provenanceLabel: prov('interview', 'kv-pv-betrag'),
      screen: 'interview',
      field: 'kv-pv-betrag',
    })
  }
  const spenden = amountFromAnswer(answers['spenden-betrag'])
  if (spenden !== null && spenden > 0) {
    vorsorgeRows.push({
      id: 'sonderausgaben-spenden',
      line: 'Sonderausgaben Z. 5',
      label: 'Spenden und Mitgliedsbeiträge (§ 10b EStG)',
      value: formatEuro(spenden),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'spenden-betrag'),
      screen: 'interview',
      field: 'spenden-betrag',
    })
  }
  const riester = amountFromAnswer(answers['riester-betrag'])
  if (riester !== null && riester > 0) {
    vorsorgeRows.push({
      id: 'anlageAV-riester',
      line: 'Anlage AV Z. 10',
      label: 'Gezahlte Altersvorsorgebeiträge (Riester)',
      value: formatEuro(riester),
      person: 'A',
      provenanceLabel: prov('interview', 'riester-betrag'),
      screen: 'interview',
      field: 'riester-betrag',
    })
  }
  if (vorsorgeRows.length === 0) return null
  return {
    formId: 'vorsorgeSonderausgaben',
    title: 'Anlage Vorsorgeaufwand, Sonderausgaben & AV',
    subtitle: 'Versicherungsbeiträge, Altersvorsorge & Spenden',
    rows: vorsorgeRows,
  }
}

/** 9. Haushaltsnahe Aufwendungen & Außergewöhnliche Belastungen */
export function haushaltSection(answers: Answers, { isJoint, prov }: GlassRowContext): GlassFormSection | null {
  const haushaltRows: GlassFormRow[] = []
  const handwerker = amountFromAnswer(answers['haushalt-handwerker-betrag'])
  const dienstleistung = amountFromAnswer(answers['haushalt-dienstleistung-betrag'])
  const minijob = amountFromAnswer(answers['haushalt-minijob-betrag'])
  const krankheit = amountFromAnswer(answers['gesundheit-betrag'])

  if (handwerker !== null && handwerker > 0) {
    haushaltRows.push({
      id: 'haushalt-handwerker',
      line: 'Haushalt Zeile 6 (Kz 212)',
      label: 'Handwerkerleistungen (Arbeitskosten, 20 % Steuerermäßigung)',
      value: formatEuro(handwerker),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'haushalt-handwerker-betrag'),
      screen: 'interview',
      field: 'haushalt-handwerker-betrag',
    })
  }
  if (dienstleistung !== null && dienstleistung > 0) {
    haushaltRows.push({
      id: 'haushalt-dienstleistung',
      line: 'Haushalt Zeile 5 (Kz 210)',
      label: 'Haushaltsnahe Dienstleistungen (20 % Steuerermäßigung)',
      value: formatEuro(dienstleistung),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'haushalt-dienstleistung-betrag'),
      screen: 'interview',
      field: 'haushalt-dienstleistung-betrag',
    })
  }
  if (minijob !== null && minijob > 0) {
    haushaltRows.push({
      id: 'haushalt-minijob',
      line: 'Haushalt Zeile 4 (Kz 202)',
      label: 'Geringfügige Beschäftigung im Haushalt (Minijob)',
      value: formatEuro(minijob),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'haushalt-minijob-betrag'),
      screen: 'interview',
      field: 'haushalt-minijob-betrag',
    })
  }
  if (krankheit !== null && krankheit > 0) {
    haushaltRows.push({
      id: 'agb-krankheit',
      line: 'Anlage agB Zeile 13',
      label: 'Krankheitskosten (außergewöhnliche Belastungen)',
      value: formatEuro(krankheit),
      person: isJoint ? 'gemeinsam' : 'A',
      provenanceLabel: prov('interview', 'gesundheit-betrag'),
      screen: 'interview',
      field: 'gesundheit-betrag',
    })
  }
  if (haushaltRows.length === 0) return null
  return {
    formId: 'haushaltAgb',
    title: 'Anlage Haushaltsnahe Aufwendungen & Außerg. Belastungen',
    subtitle: 'Steuerermäßigungen nach § 35a EStG & Krankheitskosten (§ 33 EStG)',
    rows: haushaltRows,
  }
}
