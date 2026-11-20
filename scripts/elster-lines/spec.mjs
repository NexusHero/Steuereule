// Which lines of each form the ELSTER fill-in help needs (ADR-0101 §16), and their stable ids.
// The Zeile, the Kennzahl and the label always come from the PDF; this file only says which row is
// meant, by a Kennzahl or by the start of its label, the way felder-<jahr>.spec.json anchors the
// printout fields. A row a year's form does not have is absent for that year, never guessed.

/**
 * Anlage EÜR: every line of the sections the app fills, from "1. Betriebseinnahmen" to the Rücklagen
 * part of "4. Ergänzende Angaben". A section starts at the row its heading stands above.
 */
export const EUER_SECTIONS = [
  { id: 'einnahmen', heading: /^1\. Betriebseinnahmen/ },
  { id: 'ausgaben', heading: /^2\. Betriebsausgaben/ },
  { id: 'beschraenkt', heading: /^Beschränkt abziehbare Betriebsausgaben/ },
  { id: 'gewinn', heading: /^3\. Ermittlung des Gewinns/ },
  { id: 'ruecklagen', heading: /^4\. Ergänzende Angaben/ },
  { id: null, heading: /^5\. / },
]

/**
 * EÜR rows without a Kennzahl (ELSTER computes or carries them over) get their id from the label.
 * Running totals ("Übertrag") are left out: nothing is typed there.
 */
export const EUER_UNNUMBERED = [
  [/^Auflösung von Rücklagen/, 'aufloesung-ruecklagen'],
  [/^Sachlicher Bebauungskostenrichtbetrag/, 'luf-weinbau'],
  [/^Betriebsausgabenpauschale für Forstwirte/, 'luf-forst'],
  [/^Bildung Rücklage Tierbewertung/, 'luf-tierbewertung'],
  [/^Rücklagen, stille Reserven/, 'ruecklagen-uebertrag'],
  [/^Summe der Betriebseinnahmen/, 'summe-einnahmen'],
  [/^abzüglich Summe der Betriebsausgaben/, 'summe-ausgaben'],
  [/Anzusetzender steuerpflichtiger Gewinn/, 'gewinn-personengesellschaft'],
]
export const EUER_SKIP = /^(Übertrag|)$/

/**
 * Forms read line by line. `kz` matches a row carrying that Kennzahl, `label` the start of its
 * label, `other` text in a further column (the Hauptvordruck's right-hand checkboxes); the label
 * shown is then that text.
 */
export const LINE_SPECS = {
  ust: [
    { id: 'ust.kleinunternehmer-umsatz-vorjahr', kz: '238' },
    { id: 'ust.kleinunternehmer-umsatz-jahr', kz: '239' },
    { id: 'ust.kleinunternehmer-wechsel', label: /^Wechsel von der Kleinunternehmer-Regelung/, kz: '136', either: true },
    { id: 'ust.umsatz-19', kz: '177' },
    { id: 'ust.wertabgabe-lieferung-19', kz: '178' },
    { id: 'ust.wertabgabe-leistung-19', kz: '179' },
    { id: 'ust.umsatz-7', kz: '275' },
    { id: 'ust.wertabgabe-lieferung-7', kz: '195' },
    { id: 'ust.wertabgabe-leistung-7', kz: '196' },
    { id: 'ust.umsatz-0', kz: '157' },
    { id: 'ust.wertabgabe-lieferung-0', kz: '158' },
    { id: 'ust.wertabgabe-leistung-0', kz: '159' },
    { id: 'ust.umsatz-andere-steuersaetze', kz: '155' },
    { id: 'ust.steuerfrei-ig-lieferung', kz: '741' },
    { id: 'ust.steuerfrei-ausfuhr', label: /^Ausfuhrlieferungen/ },
    { id: 'ust.steuerfrei-mit-vorsteuerabzug-summe', kz: '237' },
    { id: 'ust.steuerfrei-ohne-vorsteuerabzug-4-12', kz: '286' },
    { id: 'ust.steuerfrei-ohne-vorsteuerabzug-4', kz: '287' },
    { id: 'ust.steuerfrei-kleinunternehmer', kz: '236' },
    { id: 'ust.13b-leistungen-eu', kz: '846' },
    { id: 'ust.13b-grunderwerb', kz: '873' },
    { id: 'ust.13b-andere-leistungen', kz: '877' },
    { id: 'ust.vorsteuer-rechnungen', kz: '320' },
    { id: 'ust.vorsteuer-ig-erwerb', kz: '761' },
    { id: 'ust.vorsteuer-einfuhr', kz: '762' },
    { id: 'ust.vorsteuer-13b', kz: '467' },
    { id: 'ust.vorsteuer-summe', label: /^Summe der Vorsteuerbeträge/ },
    { id: 'ust.berechnung-steuer-umsaetze', label: /^Umsatzsteuer auf steuerpflichtige Lieferungen/ },
    { id: 'ust.berechnung-steuer-13b', label: /^Umsatzsteuer, die vom Leistungsempfänger nach § 13b/ },
    { id: 'ust.berechnung-vorsteuer', label: /^Abziehbare Vorsteuerbeträge/ },
    { id: 'ust.berechnung-fruehere-zeitraeume-kleinunternehmer', kz: '391' },
    { id: 'ust.berechnung-umsatzsteuer', label: /^(Umsatzsteuer )?Überschuss/ },
    { id: 'ust.verbleibende-umsatzsteuer', kz: '816' },
    { id: 'ust.vorauszahlungssoll', label: /^Vorauszahlungssoll/ },
    { id: 'ust.abschlusszahlung', kz: '820' },
  ],
  'est-1-a': [{ id: 'est-1-a.feststellung-verlustvortrag', other: /verbleibenden Verlustvortrags/ }],
  'anlage-sonstiges': [
    { id: 'anlage-sonstiges.verlustvortrag-festgestellt', label: /verbleibender Verlustvortrag nach § 10d/ },
    { id: 'anlage-sonstiges.verzicht-verlustruecktrag', label: /Verlustrücktrag nach § 10d/ },
  ],
}

/**
 * Gewerbesteuererklärung GewSt 1 A: fields of the official ELSTER help, by the id of their help box
 * (scripts/elster-lines/elster-help.mjs). The first box id that exists in a year is taken.
 */
export const HELP_SPECS = {
  gewst: [
    { id: 'gewst.betriebsstaette', boxes: ['gewstbetriebsst'] },
    { id: 'gewst.gewinn', boxes: ['gstHilfethema4', 'gewstgewinnest'] },
    { id: 'gewst.hinzurechnung-entgelte-schulden', boxes: ['gewstentgschulden'] },
    { id: 'gewst.kuerzung-grundbesitz-einheitswert', boxes: ['gewstew'] },
    { id: 'gewst.kuerzung-grundbesitz-anzusetzender-wert', boxes: ['gewstanzusew'] },
    { id: 'gewst.kuerzung-grundbesitz-erweitert', boxes: ['gewsterwKuerz'] },
  ],
}
