/**
 * The printout pre-check speaks in codes (`grenzgaenger`, `kinder`, …). The owl gets them in words, so
 * "Fehlt noch etwas?" names what really blocks the printout and who can fill it (real-case test: the
 * owl named some gaps and missed the exchange rate, the employer's address and the non-return days).
 */
const MASTER_DATA: Readonly<Record<string, string>> = {
  name: 'Nachname',
  vorname: 'Vorname',
  steuerId: 'Steuer-ID',
  geburtsdatum: 'Geburtsdatum',
  strasse: 'Straße',
  hausnummer: 'Hausnummer',
  plz: 'Postleitzahl',
  wohnort: 'Wohnort',
  religion: 'Religion',
  familienstand: 'Familienstand',
  iban: 'IBAN',
  finanzamt: 'Finanzamt',
}

const GAPS: Readonly<Record<string, string>> = {
  ehegatte: 'Ehegatte: Angaben zur Person B fehlen (trägt der Nutzer in „Kopplung“ ein).',
  personB: 'Person B: Angaben fehlen (trägt der Nutzer in „Kopplung“ ein).',
  'unbestaetigt.personB': 'Person B: Angaben sind noch nicht bestätigt.',
  kapital: 'Kapitalerträge: Kapitalertragsteuer, Solidaritätszuschlag und Kirchensteuer müssen eingetragen sein, auch als 0.',
  anlageKapKrypto: 'Krypto: die Anlage dafür druckt die App noch nicht.',
  vermietung: 'Vermietung: Adresse des Objekts, Mieteinnahmen, Werbungskosten und ob die Abschreibung wie im Vorjahr läuft (Adresse und Abschreibung trägt der Nutzer in der Maske ein).',
  anlageVAfaNeu: 'Vermietung: eine neue Abschreibung druckt die App noch nicht.',
  kinder: 'Kind: Steuer-ID, Familienkasse, Wohnsitz und beim anderen Elternteil Name, Geburtsdatum und Adresse (trägt der Nutzer in der Maske „Kinder“ ein).',
  anlageKindAusland: 'Kind im Ausland: die Anlage dafür druckt die App noch nicht.',
  anlageKindAndererElternteilAusland: 'Anderer Elternteil im Ausland: druckt die App noch nicht.',
  grenzgaenger: 'Grenzgänger: Wechselkurs, Arbeitgeber mit Adresse, Nichtrückkehrtage, „keine Sonderfälle“, Familienzulagen und selbst gezahltes Krankentaggeld (auch 0); Wechselkurs, Arbeitgeber und Sonderfälle trägt der Nutzer in der Maske „Lohnausweis“ ein.',
  grenzgaengerPersonB: 'Grenzgänger Person B: dieselben Angaben wie bei Person A, in ihrer Maske „Lohnausweis“.',
}

export function describePrintoutGap(code: string): string {
  if (code in MASTER_DATA) return `Stammdaten: ${MASTER_DATA[code]} fehlt (trägt der Nutzer im Profil ein).`
  if (code in GAPS) return GAPS[code]!
  if (code.startsWith('anlage')) return `Die Anlage „${code.replace(/^anlage/, '')}“ druckt die App noch nicht.`
  return `Für den Ausdruck fehlt: ${code}.`
}
