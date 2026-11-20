/**
 * The meaning of an EÜR position, stable across tax years (ADR-0101). The bookkeeping maps each
 * account to one of these keys, the tax rules map each key to the line of the Anlage EÜR of a
 * given year. Neither side knows the other's numbers: accounts change with SKR03/SKR04, lines with
 * the yearly form.
 *
 * The keys follow the structure of the Anlage EÜR (Betriebseinnahmen, Betriebsausgaben, the
 * restricted expenses, Ermittlung des Gewinns). A key that a year's form does not have is mapped to
 * the nearest line of that year, never dropped silently.
 */
export const EUER_KEYS = [
  // Betriebseinnahmen
  'einnahmen_kleinunternehmer',
  'einnahmen_umsatzsteuerpflichtig',
  'einnahmen_umsatzsteuerfrei',
  'einnahmen_umsatzsteuer_vereinnahmt',
  'einnahmen_vorsteuer_erstattet',
  'einnahmen_veraeusserung_anlagevermoegen',
  'einnahmen_private_kfz_nutzung',
  'einnahmen_sonstige_entnahmen',
  'einnahmen_umsatzsteuer_entnahmen',
  'einnahmen_aufloesung_ruecklagen',
  // Betriebsausgaben
  'ausgaben_waren_rohstoffe',
  'ausgaben_fremdleistungen',
  'ausgaben_personal',
  'ausgaben_afa_unbeweglich',
  'ausgaben_afa_beweglich',
  'ausgaben_afa_immateriell',
  'ausgaben_sonder_afa_7g',
  'ausgaben_herabsetzung_7g',
  'ausgaben_gwg',
  'ausgaben_sammelposten',
  'ausgaben_restbuchwert_abgang',
  'ausgaben_raumkosten',
  'ausgaben_miete_leasing_beweglich',
  'ausgaben_kfz',
  'ausgaben_reise',
  'ausgaben_telekommunikation',
  'ausgaben_fortbildung',
  'ausgaben_rechts_beratung',
  'ausgaben_versicherungen_beitraege',
  'ausgaben_werbung',
  'ausgaben_schuldzinsen',
  'ausgaben_sonstige',
  'ausgaben_vorsteuer_gezahlt',
  'ausgaben_umsatzsteuer_an_finanzamt',
  // Not deductible since 2008 (§ 4 Abs. 5b EStG), but the EÜR lists it and adds it back.
  'ausgaben_gewerbesteuer',
  // Nicht abziehbar: listed in the EÜR and added back to the profit.
  'nicht_abziehbar_schuldzinsen_4_4a',
  'nicht_abziehbar_sonstige',
  // Beschränkt abziehbare Betriebsausgaben
  'beschraenkt_geschenke',
  'beschraenkt_bewirtung',
  'beschraenkt_verpflegungsmehraufwand',
  'beschraenkt_arbeitszimmer_tagespauschale',
  'beschraenkt_fahrten_wohnung_betrieb',
  // Ermittlung des Gewinns
  'gewinn_iab_abzug',
  'gewinn_iab_hinzurechnung',
  'gewinn_ruecklagen_bildung',
] as const

export type EuerKey = (typeof EUER_KEYS)[number]

export function isEuerKey(value: string): value is EuerKey {
  return (EUER_KEYS as readonly string[]).includes(value)
}
