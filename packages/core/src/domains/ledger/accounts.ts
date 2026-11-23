import type { EuerKey } from '../business/euer-keys'
import { SKR03_NUMBERS, SKR04_NUMBERS } from './accounts-numbers'

/**
 * The charts of accounts SKR03 and SKR04 (ADR-0101 §12), curated for a sole trader or freelancer.
 *
 * Both charts are built from one list of account concepts: a concept carries the meaning (kind, VAT
 * treatment, EÜR key, HGB position) and each chart only adds its number. That makes the two charts
 * agree by construction, so the same business events give the same EÜR and Bilanz in either chart.
 *
 * The numbers are the de facto standard of the SKR03/SKR04 frameworks; they were cross-checked against
 * the openly licensed Odoo `l10n_de` charts (LGPL-3.0). The labels are our own wording, not copied
 * from any published catalogue (docs/research/self-employed-bookkeeping.md).
 */

export type ChartOfAccounts = 'SKR03' | 'SKR04'

/** `opening` is the Saldenvortrag account: it only carries the opening entry and nets to zero. */
export type AccountKind = 'asset' | 'liability' | 'equity' | 'private' | 'revenue' | 'expense' | 'opening'

/** Bilanz positions of § 266 HGB at the depth a small company may present (letters and roman numerals). */
export type BalanceSheetPosition =
  | 'A.I' | 'A.II' | 'A.III' | 'B.I' | 'B.II' | 'B.III' | 'B.IV' | 'C'
  | 'P.A' | 'P.B' | 'P.C' | 'P.D'

/** GuV positions of § 275 Abs. 2 HGB (Gesamtkostenverfahren), numbered as in the law since BilRUG. */
export type IncomeStatementPosition =
  | 'GuV.1' | 'GuV.2' | 'GuV.4' | 'GuV.5' | 'GuV.6' | 'GuV.7' | 'GuV.8' | 'GuV.11' | 'GuV.13' | 'GuV.14' | 'GuV.16'

export type HgbPosition = BalanceSheetPosition | IncomeStatementPosition

/**
 * How a posting on the account is taxed by default. Gross keys (`ust*`, `vst*`) split a gross amount,
 * the reverse-charge keys add input and output VAT on a net amount, the zero keys only label the line.
 */
export type BookingTaxKey =
  | 'none'
  | 'ust19'
  | 'ust7'
  | 'ust0'
  | 'steuerfrei'
  | 'kleinunternehmer'
  | 'igLieferung'
  | 'vst19'
  | 'vst7'
  | 'rc13b19'
  /** § 13b Abs. 1 UStG: a service of an EU business (Kz 46/47 of the Voranmeldung). */
  | 'rcEu19'
  /** § 13b at 7 % (Abs. 2 or, for an EU service, Abs. 1): DATEV books it on the rate-less § 13b accounts. */
  | 'rc13b7'
  | 'rcEu7'
  /** A B2B service to an EU business, the recipient owes the VAT there (§ 3a Abs. 2, § 18a Abs. 2 UStG; Kz 21). */
  | 'euLeistung'
  | 'igErwerb19'
  | 'igErwerb7'

export type AccountConceptId = keyof typeof SKR03_NUMBERS

export interface LedgerAccount {
  readonly number: string
  readonly concept: AccountConceptId
  /** German label (user-facing copy). */
  readonly label: string
  readonly kind: AccountKind
  readonly defaultTaxKey: BookingTaxKey
  /** Where a debit lands in the EÜR (and a credit, unless `euerCredit` says otherwise). */
  readonly euer: EuerKey | null
  /** VAT settlement accounts: a refund from the Finanzamt is an Einnahme, not a negative Ausgabe. */
  readonly euerCredit: EuerKey | null
  /** Where the VAT a line on this account produces lands instead of the VAT account's key (Wertabgaben). */
  readonly vatEuer: EuerKey | null
  /** Bilanz position for a debit balance (assets) or credit balance (liabilities), GuV position otherwise. */
  readonly hgb: HgbPosition | null
  /** Bilanz position when the balance turns to the other side (an overdrawn bank, VAT owed). */
  readonly hgbIfOtherSide: BalanceSheetPosition | null
  /** VAT accounts are netted into one receivable or liability against the Finanzamt. */
  readonly netsWithVat: boolean
  /** E-Bilanz element (HGB taxonomy, de-gaap-ci) of the position the account lands on. */
  readonly eBilanz: string | null
  /**
   * The expense is not (fully) deductible; the tax rules decide how much counts. Each account lands on
   * exactly one key: a fully non-deductible amount sits only on its own key, never also on an ordinary one.
   */
  readonly nonDeductible: boolean
  /** Fixed assets: the concept of the account their depreciation is booked on. */
  readonly depreciationConcept: AccountConceptId | null
}

/** E-Bilanz elements per HGB position (HGB taxonomy 6.x, de-gaap-ci). */
export const E_BILANZ_ELEMENTS: Readonly<Record<HgbPosition | 'bs.ass' | 'bs.eqLiab' | 'GuV.17', string>> = {
  'A.I': 'bs.ass.fixAss.intan',
  'A.II': 'bs.ass.fixAss.tan',
  'A.III': 'bs.ass.fixAss.fin',
  'B.I': 'bs.ass.currAss.inventory',
  'B.II': 'bs.ass.currAss.receiv',
  'B.III': 'bs.ass.currAss.securities',
  'B.IV': 'bs.ass.currAss.cashEquiv',
  C: 'bs.ass.prepaidExp',
  'P.A': 'bs.eqLiab.equity',
  'P.B': 'bs.eqLiab.accruals',
  'P.C': 'bs.eqLiab.liab',
  'P.D': 'bs.eqLiab.defIncome',
  'bs.ass': 'bs.ass',
  'bs.eqLiab': 'bs.eqLiab',
  'GuV.1': 'is.netIncome.regular.operatingTC.grossTradingProfit.totalOutput.netSales',
  'GuV.2': 'is.netIncome.regular.operatingTC.grossTradingProfit.totalOutput.changeInventories',
  'GuV.4': 'is.netIncome.regular.operatingTC.otherOpRevenue',
  'GuV.5': 'is.netIncome.regular.operatingTC.grossTradingProfit.materialServices',
  'GuV.6': 'is.netIncome.regular.operatingTC.staff',
  'GuV.7': 'is.netIncome.regular.operatingTC.deprAmort',
  'GuV.8': 'is.netIncome.regular.operatingTC.otherCost',
  'GuV.11': 'is.netIncome.regular.fin.netInterest.income',
  'GuV.13': 'is.netIncome.regular.fin.netInterest.expenses',
  'GuV.14': 'is.netIncome.tax',
  'GuV.16': 'is.netIncome.regular.operatingTC.otherTaxes',
  'GuV.17': 'is.netIncome',
}

type ConceptDef = Omit<LedgerAccount, 'number' | 'concept' | 'eBilanz'>

const base: ConceptDef = {
  label: '',
  kind: 'expense',
  defaultTaxKey: 'none',
  euer: null,
  euerCredit: null,
  vatEuer: null,
  hgb: null,
  hgbIfOtherSide: null,
  netsWithVat: false,
  nonDeductible: false,
  depreciationConcept: null,
}

const fixedAsset = (label: string, hgb: BalanceSheetPosition, depreciationConcept: AccountConceptId, defaultTaxKey: BookingTaxKey = 'vst19'): ConceptDef => ({
  ...base, label, kind: 'asset', hgb, defaultTaxKey, depreciationConcept,
})
const asset = (label: string, hgb: BalanceSheetPosition, extra: Partial<ConceptDef> = {}): ConceptDef => ({ ...base, label, kind: 'asset', hgb, ...extra })
const liability = (label: string, hgb: BalanceSheetPosition, extra: Partial<ConceptDef> = {}): ConceptDef => ({ ...base, label, kind: 'liability', hgb, ...extra })
const privateAccount = (label: string): ConceptDef => ({ ...base, label, kind: 'private', hgb: 'P.A' })
const revenue = (label: string, euer: EuerKey | null, defaultTaxKey: BookingTaxKey, hgb: IncomeStatementPosition = 'GuV.1'): ConceptDef => ({
  ...base, label, kind: 'revenue', euer, defaultTaxKey, hgb,
})
const expense = (label: string, euer: EuerKey | null, hgb: IncomeStatementPosition, defaultTaxKey: BookingTaxKey = 'vst19', extra: Partial<ConceptDef> = {}): ConceptDef => ({
  ...base, label, kind: 'expense', euer, hgb, defaultTaxKey, ...extra,
})
// Unentgeltliche Wertabgaben: their VAT has its own EÜR line, apart from the VAT collected from customers.
const withdrawal = (label: string, euer: EuerKey, defaultTaxKey: BookingTaxKey, hgb: IncomeStatementPosition = 'GuV.1'): ConceptDef => ({
  ...revenue(label, euer, defaultTaxKey, hgb), vatEuer: 'einnahmen_umsatzsteuer_entnahmen',
})
// VAT in the EÜR (§ 11 EStG): collected VAT is an Einnahme, paid input VAT an Ausgabe, both when the money moves.
const outputVat = (label: string, euer: EuerKey | null): ConceptDef => ({ ...base, label, kind: 'liability', euer, hgb: 'P.C', hgbIfOtherSide: 'B.II', netsWithVat: true })
const inputVat = (label: string, euer: EuerKey | null): ConceptDef => ({ ...base, label, kind: 'asset', euer, hgb: 'B.II', hgbIfOtherSide: 'P.C', netsWithVat: true })
const vatSettlement = (label: string): ConceptDef => ({
  ...base, label, kind: 'liability', euer: 'ausgaben_umsatzsteuer_an_finanzamt', euerCredit: 'einnahmen_vorsteuer_erstattet', hgb: 'P.C', hgbIfOtherSide: 'B.II', netsWithVat: true,
})

/**
 * The concepts in chart order (SKR03 classes). Reverse-charge VAT (§ 13b, innergemeinschaftlicher
 * Erwerb) has no EÜR key on purpose: output and input VAT arise and are settled together, no money
 * moves, so in a cash-basis EÜR they cancel and neither line shows them.
 */
const CONCEPTS: Readonly<Record<AccountConceptId, ConceptDef>> = {
  // Anlagevermögen
  software: fixedAsset('Software', 'A.I', 'depr_intangible'),
  licenses: fixedAsset('Erworbene Lizenzen und Schutzrechte', 'A.I', 'depr_intangible'),
  goodwill: fixedAsset('Firmenwert', 'A.I', 'depr_intangible'),
  land: fixedAsset('Grundstück ohne Bebauung', 'A.II', 'depr_buildings', 'none'),
  buildings: fixedAsset('Gebäude des Betriebs', 'A.II', 'depr_buildings'),
  home_office_building_share: fixedAsset('Gebäudeanteil Arbeitszimmer', 'A.II', 'depr_buildings', 'none'),
  tenant_fixtures: fixedAsset('Umbauten in gemieteten Räumen', 'A.II', 'depr_buildings'),
  machinery: fixedAsset('Maschinen', 'A.II', 'depr_tangible'),
  vehicles: fixedAsset('Personenwagen', 'A.II', 'depr_vehicles'),
  trucks: fixedAsset('Lastwagen', 'A.II', 'depr_vehicles'),
  other_vehicles: fixedAsset('Weitere Fahrzeuge', 'A.II', 'depr_vehicles'),
  tools: fixedAsset('Werkzeug (Anlagevermögen)', 'A.II', 'depr_tangible'),
  business_equipment: fixedAsset('Ausstattung des Betriebs', 'A.II', 'depr_tangible'),
  shop_fittings: fixedAsset('Einrichtung des Ladens', 'A.II', 'depr_tangible'),
  office_equipment: fixedAsset('Einrichtung des Büros', 'A.II', 'depr_tangible'),
  business_equipment_other: fixedAsset('Weitere Betriebs- und Geschäftsausstattung (z. B. Computer)', 'A.II', 'depr_tangible'),
  gwg: fixedAsset('Geringwertige Wirtschaftsgüter bis 800 €', 'A.II', 'depr_gwg'),
  sammelposten: fixedAsset('Sammelposten 250 bis 1.000 €', 'A.II', 'depr_sammelposten'),
  assets_under_construction: fixedAsset('Gebäude im Bau', 'A.II', 'depr_buildings'),
  participations: fixedAsset('Beteiligungen', 'A.III', 'depr_extraordinary', 'none'),
  securities_fixed: fixedAsset('Wertpapiere (langfristig gehalten)', 'A.III', 'depr_extraordinary', 'none'),
  loans_granted: fixedAsset('Ausgereichte Darlehen', 'A.III', 'depr_extraordinary', 'none'),
  // Umlaufvermögen
  raw_materials_stock: asset('Vorrat an Material', 'B.I'),
  goods_stock: asset('Vorrat an Waren', 'B.I'),
  receivables: asset('Offene Kundenforderungen', 'B.II'),
  doubtful_receivables: asset('Unsichere Kundenforderungen', 'B.II'),
  other_assets: asset('Andere Vermögensgegenstände', 'B.II'),
  deposits_paid: asset('Hinterlegte Kautionen', 'B.II'),
  loans_to_staff: asset('Vorschüsse an Mitarbeitende', 'B.II'),
  pass_through: asset('Durchlaufende Beträge', 'B.II', { hgbIfOtherSide: 'P.C' }),
  cash: asset('Barkasse', 'B.IV'),
  bank: asset('Geschäftskonto', 'B.IV', { hgbIfOtherSide: 'P.C' }),
  bank_2: asset('Zweites Geschäftskonto', 'B.IV', { hgbIfOtherSide: 'P.C' }),
  money_transit: asset('Geld unterwegs', 'B.IV', { hgbIfOtherSide: 'P.C' }),
  prepaid_expenses: asset('Vorausbezahlte Aufwendungen (aktive Abgrenzung)', 'C'),
  // Vorsteuer und Umsatzsteuer
  input_vat_7: inputVat('Vorsteuer 7 %', 'ausgaben_vorsteuer_gezahlt'),
  input_vat_19: inputVat('Vorsteuer 19 %', 'ausgaben_vorsteuer_gezahlt'),
  input_vat_import: inputVat('Einfuhrumsatzsteuer', 'ausgaben_vorsteuer_gezahlt'),
  input_vat_ig_7: inputVat('Vorsteuer aus EU-Erwerb 7 %', null),
  input_vat_ig_19: inputVat('Vorsteuer aus EU-Erwerb 19 %', null),
  input_vat_13b_19: inputVat('Vorsteuer aus § 13b UStG 19 %', null),
  input_vat_13b: inputVat('Abziehbare Vorsteuer nach § 13b UStG', null),
  vat_7: outputVat('Umsatzsteuer 7 %', 'einnahmen_umsatzsteuer_vereinnahmt'),
  vat_19: outputVat('Umsatzsteuer 19 %', 'einnahmen_umsatzsteuer_vereinnahmt'),
  vat_ig_7: outputVat('Umsatzsteuer auf EU-Erwerb 7 %', null),
  vat_ig_19: outputVat('Umsatzsteuer auf EU-Erwerb 19 %', null),
  vat_13b_19: outputVat('Umsatzsteuer nach § 13b UStG 19 %', null),
  vat_13b: outputVat('Umsatzsteuer nach § 13b UStG', null),
  vat_prepayments: vatSettlement('Umsatzsteuer-Vorauszahlungen'),
  vat_current_year: vatSettlement('Umsatzsteuer dieses Jahres'),
  vat_prior_year: vatSettlement('Umsatzsteuer früherer Jahre'),
  // Eigenkapital und Privat
  fixed_capital: { ...base, label: 'Kapital (fest)', kind: 'equity', hgb: 'P.A' },
  variable_capital: { ...base, label: 'Kapital', kind: 'equity', hgb: 'P.A' },
  private_withdrawals: privateAccount('Entnahmen'),
  private_taxes: privateAccount('Private Steuern'),
  private_special_expenses: privateAccount('Private Sonderausgaben'),
  private_deposits: privateAccount('Einlagen'),
  // Rückstellungen, Verbindlichkeiten, Abgrenzung
  accruals_trade_tax: liability('Rückstellung Gewerbesteuer', 'P.B'),
  accruals_other: liability('Andere Rückstellungen', 'P.B'),
  accruals_closing_costs: liability('Rückstellung Jahresabschluss', 'P.B'),
  loans_bank: liability('Bankdarlehen', 'P.C'),
  loans_bank_long: liability('Bankdarlehen über fünf Jahre', 'P.C'),
  advance_payments_received: liability('Erhaltene Anzahlungen', 'P.C'),
  payables: liability('Offene Lieferantenrechnungen', 'P.C'),
  other_liabilities: liability('Andere Verbindlichkeiten', 'P.C'),
  wage_payables: liability('Offene Löhne und Gehälter', 'P.C'),
  wage_tax_payables: liability('Offene Lohnsteuer', 'P.C'),
  social_security_payables: liability('Offene Sozialabgaben', 'P.C'),
  deferred_income: liability('Im Voraus erhaltene Erträge (passive Abgrenzung)', 'P.D'),
  opening_balances: { ...base, label: 'Saldenvortrag (Eröffnung)', kind: 'opening' },
  // Erträge
  revenue_free: revenue('Steuerfreie Umsätze (§ 4 Nr. 8 ff. UStG)', 'einnahmen_umsatzsteuerfrei', 'steuerfrei'),
  revenue_export: revenue('Ausfuhrlieferungen (steuerfrei)', 'einnahmen_umsatzsteuerfrei', 'steuerfrei'),
  revenue_ig_delivery: revenue('Lieferungen in andere EU-Staaten (steuerfrei)', 'einnahmen_umsatzsteuerfrei', 'igLieferung'),
  revenue_other_free: revenue('Weitere steuerfreie Umsätze (§ 4 Nr. 2 bis 7 UStG)', 'einnahmen_umsatzsteuerfrei', 'steuerfrei'),
  revenue_kleinunternehmer: revenue('Umsätze als Kleinunternehmer (§ 19 UStG)', 'einnahmen_kleinunternehmer', 'kleinunternehmer'),
  revenue_7: revenue('Umsätze 7 %', 'einnahmen_umsatzsteuerpflichtig', 'ust7'),
  revenue_eu_services: revenue('Leistungen an EU-Unternehmen (dort steuerpflichtig)', 'einnahmen_umsatzsteuerfrei', 'euLeistung'),
  revenue_13b: revenue('Umsätze, für die der Kunde die Steuer schuldet (§ 13b UStG)', 'einnahmen_umsatzsteuerfrei', 'ust0'),
  revenue_third_country: revenue('Leistungen ins Drittland (im Inland nicht steuerbar)', 'einnahmen_umsatzsteuerfrei', 'ust0'),
  revenue_19: revenue('Umsätze 19 %', 'einnahmen_umsatzsteuerpflichtig', 'ust19'),
  revenue_commission: revenue('Provisionen 19 %', 'einnahmen_umsatzsteuerpflichtig', 'ust19'),
  discounts_granted_7: revenue('Skonto an Kunden 7 %', 'einnahmen_umsatzsteuerpflichtig', 'ust7'),
  discounts_granted_19: revenue('Skonto an Kunden 19 %', 'einnahmen_umsatzsteuerpflichtig', 'ust19'),
  asset_sale_19: revenue('Verkauf von Anlagegütern 19 %', 'einnahmen_veraeusserung_anlagevermoegen', 'ust19', 'GuV.4'),
  asset_disposal_gain_book_value: { ...expense('Restbuchwert abgegangener Anlagen (bei Gewinn)', 'ausgaben_restbuchwert_abgang', 'GuV.4', 'none') },
  asset_disposal_loss_book_value: expense('Restbuchwert abgegangener Anlagen (bei Verlust)', 'ausgaben_restbuchwert_abgang', 'GuV.8', 'none'),
  withdrawal_goods_19: withdrawal('Entnahme von Waren 19 %', 'einnahmen_sonstige_entnahmen', 'ust19'),
  withdrawal_goods_7: withdrawal('Entnahme von Waren 7 %', 'einnahmen_sonstige_entnahmen', 'ust7'),
  private_car_use_19: withdrawal('Private Nutzung des Betriebsfahrzeugs 19 %', 'einnahmen_private_kfz_nutzung', 'ust19', 'GuV.4'),
  private_car_use_free: revenue('Private Nutzung des Betriebsfahrzeugs ohne Umsatzsteuer', 'einnahmen_private_kfz_nutzung', 'none', 'GuV.4'),
  withdrawal_services_19: withdrawal('Private Nutzung von Leistungen 19 %', 'einnahmen_sonstige_entnahmen', 'ust19', 'GuV.4'),
  other_operating_income: revenue('Andere betriebliche Erträge', 'einnahmen_umsatzsteuerfrei', 'none', 'GuV.4'),
  release_accruals: revenue('Auflösung von Rückstellungen', null, 'none', 'GuV.4'),
  interest_income: revenue('Zinserträge', 'einnahmen_umsatzsteuerfrei', 'none', 'GuV.11'),
  // Material und Waren
  material: expense('Material', 'ausgaben_waren_rohstoffe', 'GuV.5'),
  third_party_services: expense('Leistungen Dritter (Fremdleistungen)', 'ausgaben_fremdleistungen', 'GuV.5'),
  construction_13b_19: expense('Bauleistungen inländischer Unternehmer (§ 13b UStG)', 'ausgaben_fremdleistungen', 'GuV.5', 'rc13b19'),
  services_eu_13b_19: expense('Leistungen von EU-Unternehmern (§ 13b UStG)', 'ausgaben_fremdleistungen', 'GuV.8', 'rcEu19'),
  services_foreign_13b_19: expense('Leistungen ausländischer Unternehmer (§ 13b UStG)', 'ausgaben_fremdleistungen', 'GuV.5', 'rc13b19'),
  goods_free: expense('Einkauf von Waren ohne Vorsteuer', 'ausgaben_waren_rohstoffe', 'GuV.5', 'none'),
  goods_7: expense('Einkauf von Waren 7 %', 'ausgaben_waren_rohstoffe', 'GuV.5', 'vst7'),
  goods_19: expense('Einkauf von Waren 19 %', 'ausgaben_waren_rohstoffe', 'GuV.5'),
  goods_ig_7: expense('Waren aus anderen EU-Staaten 7 %', 'ausgaben_waren_rohstoffe', 'GuV.5', 'igErwerb7'),
  goods_ig_19: expense('Waren aus anderen EU-Staaten 19 %', 'ausgaben_waren_rohstoffe', 'GuV.5', 'igErwerb19'),
  discounts_received_7: expense('Skonto von Lieferanten 7 %', 'ausgaben_waren_rohstoffe', 'GuV.5', 'vst7'),
  discounts_received_19: expense('Skonto von Lieferanten 19 %', 'ausgaben_waren_rohstoffe', 'GuV.5'),
  procurement_costs: expense('Nebenkosten des Einkaufs', 'ausgaben_waren_rohstoffe', 'GuV.5'),
  inventory_change: expense('Veränderung des Materialvorrats', null, 'GuV.5', 'none'),
  // Personal
  wages: expense('Löhne', 'ausgaben_personal', 'GuV.6', 'none'),
  salaries: expense('Gehälter', 'ausgaben_personal', 'GuV.6', 'none'),
  social_security: expense('Sozialabgaben des Arbeitgebers', 'ausgaben_personal', 'GuV.6', 'none'),
  temp_wages: expense('Löhne für Aushilfen', 'ausgaben_personal', 'GuV.6', 'none'),
  flat_wage_tax: expense('Pauschale Steuer für Arbeitnehmer', 'ausgaben_personal', 'GuV.6', 'none'),
  // Räume
  rent: expense('Miete für Geschäftsräume', 'ausgaben_raumkosten', 'GuV.8'),
  heating: expense('Heizkosten', 'ausgaben_raumkosten', 'GuV.8'),
  energy: expense('Strom, Gas und Wasser', 'ausgaben_raumkosten', 'GuV.8'),
  cleaning: expense('Reinigung der Räume', 'ausgaben_raumkosten', 'GuV.8'),
  room_maintenance: expense('Instandhaltung der Räume', 'ausgaben_raumkosten', 'GuV.8'),
  other_room_costs: expense('Weitere Raumkosten', 'ausgaben_raumkosten', 'GuV.8'),
  home_office: expense('Arbeitszimmer und Homeoffice (abziehbar)', 'beschraenkt_arbeitszimmer_tagespauschale', 'GuV.8', 'none'),
  home_office_nondeductible: expense('Arbeitszimmer (nicht abziehbar)', 'beschraenkt_arbeitszimmer_tagespauschale', 'GuV.8', 'none', { nonDeductible: true }),
  // Steuern, Versicherungen, Beiträge
  // § 4 Abs. 5b EStG: booked as an expense, listed in the EÜR on its own key, which the tax rules count at 0.
  trade_tax: expense('Gewerbesteuer', 'ausgaben_gewerbesteuer', 'GuV.14', 'none', { nonDeductible: true }),
  other_taxes: expense('Andere betriebliche Steuern', 'ausgaben_sonstige', 'GuV.16', 'none'),
  insurance: expense('Betriebliche Versicherungen', 'ausgaben_versicherungen_beitraege', 'GuV.8', 'none'),
  insurance_buildings: expense('Gebäudeversicherungen', 'ausgaben_versicherungen_beitraege', 'GuV.8', 'none'),
  contributions: expense('Beiträge an Kammern und Verbände', 'ausgaben_versicherungen_beitraege', 'GuV.8', 'none'),
  other_levies: expense('Weitere Abgaben', 'ausgaben_versicherungen_beitraege', 'GuV.8', 'none'),
  late_fees_deductible: expense('Abziehbare Verspätungszuschläge', 'ausgaben_sonstige', 'GuV.8', 'none'),
  late_fees_nondeductible: expense('Nicht abziehbare Verspätungszuschläge und Zwangsgelder', 'nicht_abziehbar_sonstige', 'GuV.8', 'none', { nonDeductible: true }),
  tax_ancillary_nondeductible: expense('Nicht abziehbare Nebenleistungen zu Steuern', 'nicht_abziehbar_sonstige', 'GuV.13', 'none', { nonDeductible: true }),
  // Fahrzeuge
  vehicle_tax: expense('Kraftfahrzeugsteuer', 'ausgaben_kfz', 'GuV.16', 'none'),
  vehicle_insurance: expense('Versicherung der Fahrzeuge', 'ausgaben_kfz', 'GuV.8', 'none'),
  vehicle_running: expense('Laufende Fahrzeugkosten (Kraftstoff, Strom)', 'ausgaben_kfz', 'GuV.8'),
  vehicle_repairs: expense('Reparaturen an Fahrzeugen', 'ausgaben_kfz', 'GuV.8'),
  garage: expense('Miete für Stellplatz oder Garage', 'ausgaben_kfz', 'GuV.8'),
  vehicle_leasing: expense('Leasing von Fahrzeugen', 'ausgaben_kfz', 'GuV.8'),
  vehicle_other: expense('Weitere Fahrzeugkosten', 'ausgaben_kfz', 'GuV.8'),
  vehicle_private_owned: expense('Betriebliche Fahrten mit dem privaten Fahrzeug', 'ausgaben_kfz', 'GuV.8', 'none'),
  vehicle_external: expense('Kosten für fremde Fahrzeuge', 'ausgaben_sonstige', 'GuV.8'),
  commute_deductible: expense('Wege zwischen Wohnung und Betrieb (abziehbar)', 'beschraenkt_fahrten_wohnung_betrieb', 'GuV.8', 'none'),
  commute_nondeductible: expense('Wege zwischen Wohnung und Betrieb (nicht abziehbar)', 'beschraenkt_fahrten_wohnung_betrieb', 'GuV.8', 'none', { nonDeductible: true }),
  // Werbung, Geschenke, Bewirtung, Reisen
  advertising: expense('Werbung', 'ausgaben_werbung', 'GuV.8'),
  giveaways: expense('Werbeartikel', 'ausgaben_werbung', 'GuV.8'),
  gifts_deductible: expense('Geschenke bis zur Freigrenze', 'beschraenkt_geschenke', 'GuV.8'),
  gifts_nondeductible: expense('Geschenke über der Freigrenze', 'beschraenkt_geschenke', 'GuV.8', 'none', { nonDeductible: true }),
  representation_nondeductible: expense('Nicht abziehbare Werbe- und Repräsentationskosten', 'nicht_abziehbar_sonstige', 'GuV.8', 'none', { nonDeductible: true }),
  attentions: expense('Kleine Aufmerksamkeiten', 'ausgaben_sonstige', 'GuV.8'),
  entertainment: expense('Geschäftliche Bewirtung', 'beschraenkt_bewirtung', 'GuV.8'),
  entertainment_nondeductible: expense('Geschäftliche Bewirtung (nicht abziehbarer Teil)', 'beschraenkt_bewirtung', 'GuV.8', 'none', { nonDeductible: true }),
  travel_employees: expense('Reisekosten der Mitarbeitenden', 'ausgaben_reise', 'GuV.8', 'none'),
  travel_owner_transport: expense('Eigene Reisen: Fahrtkosten', 'ausgaben_reise', 'GuV.8'),
  travel_owner_meals: expense('Eigene Reisen: Verpflegungspauschalen', 'beschraenkt_verpflegungsmehraufwand', 'GuV.8', 'none'),
  travel_owner_lodging: expense('Eigene Reisen: Übernachtung und Nebenkosten', 'ausgaben_reise', 'GuV.8', 'vst7'),
  packaging: expense('Verpackung', 'ausgaben_sonstige', 'GuV.8'),
  freight_out: expense('Versand an Kunden', 'ausgaben_sonstige', 'GuV.8'),
  // Instandhaltung, Abschreibungen
  repairs_equipment: expense('Reparaturen an Ausstattung und Geräten', 'ausgaben_sonstige', 'GuV.8'),
  it_maintenance: expense('Wartung von Hard- und Software', 'ausgaben_sonstige', 'GuV.8'),
  depr_intangible: expense('Abschreibung auf Software und Rechte', 'ausgaben_afa_immateriell', 'GuV.7', 'none'),
  depr_tangible: expense('Abschreibung auf Ausstattung und Geräte', 'ausgaben_afa_beweglich', 'GuV.7', 'none'),
  depr_buildings: expense('Abschreibung auf Gebäude', 'ausgaben_afa_unbeweglich', 'GuV.7', 'none'),
  depr_vehicles: expense('Abschreibung auf Fahrzeuge', 'ausgaben_afa_beweglich', 'GuV.7', 'none'),
  depr_extraordinary: expense('Außerplanmäßige Abschreibung', 'ausgaben_afa_beweglich', 'GuV.7', 'none'),
  depr_special_7g: expense('Sonderabschreibung § 7g EStG (ohne Fahrzeuge)', 'ausgaben_sonder_afa_7g', 'GuV.7', 'none'),
  depr_special_7g_vehicles: expense('Sonderabschreibung § 7g EStG (Fahrzeuge)', 'ausgaben_sonder_afa_7g', 'GuV.7', 'none'),
  reduction_7g: expense('Minderung der Anschaffungskosten § 7g Abs. 2 EStG (ohne Fahrzeuge)', 'ausgaben_herabsetzung_7g', 'GuV.7', 'none'),
  reduction_7g_vehicles: expense('Minderung der Anschaffungskosten § 7g Abs. 2 EStG (Fahrzeuge)', 'ausgaben_herabsetzung_7g', 'GuV.7', 'none'),
  depr_gwg: expense('Sofortabschreibung geringwertiger Wirtschaftsgüter', 'ausgaben_gwg', 'GuV.7', 'none'),
  depr_sammelposten: expense('Abschreibung auf den Sammelposten', 'ausgaben_sammelposten', 'GuV.7', 'none'),
  // Weitere betriebliche Aufwendungen
  other_operating_expenses: expense('Andere betriebliche Ausgaben', 'ausgaben_sonstige', 'GuV.8'),
  postage: expense('Porto', 'ausgaben_sonstige', 'GuV.8', 'none'),
  phone: expense('Telefon und Mobilfunk', 'ausgaben_telekommunikation', 'GuV.8'),
  internet: expense('Internet', 'ausgaben_telekommunikation', 'GuV.8'),
  office_supplies: expense('Büromaterial', 'ausgaben_sonstige', 'GuV.8'),
  literature: expense('Fachbücher und Zeitschriften', 'ausgaben_sonstige', 'GuV.8', 'vst7'),
  training: expense('Fortbildung', 'ausgaben_fortbildung', 'GuV.8'),
  legal_consulting: expense('Rechts- und Steuerberatung', 'ausgaben_rechts_beratung', 'GuV.8'),
  bookkeeping_costs: expense('Kosten der Buchführung', 'ausgaben_rechts_beratung', 'GuV.8'),
  closing_costs: expense('Kosten des Jahresabschlusses', 'ausgaben_rechts_beratung', 'GuV.8'),
  equipment_rental: expense('Miete für bewegliche Güter', 'ausgaben_miete_leasing_beweglich', 'GuV.8'),
  license_fees: expense('Nutzungsrechte auf Zeit (z. B. Software-Abos)', 'ausgaben_sonstige', 'GuV.8'),
  leasing_equipment: expense('Leasing von Ausstattung', 'ausgaben_miete_leasing_beweglich', 'GuV.8'),
  bank_fees: expense('Kontoführung und Zahlungsgebühren', 'ausgaben_sonstige', 'GuV.8', 'none'),
  small_tools: expense('Kleingeräte und Werkzeug', 'ausgaben_sonstige', 'GuV.8'),
  interest_general: expense('Zinsen und ähnliche Aufwendungen', 'ausgaben_schuldzinsen', 'GuV.13', 'none'),
  interest_short: expense('Zinsen für kurzfristige Kredite', 'ausgaben_schuldzinsen', 'GuV.13', 'none'),
  interest_long: expense('Zinsen für langfristige Kredite', 'ausgaben_schuldzinsen', 'GuV.13', 'none'),
  // The non-deductible part of the interest (§ 4 Abs. 4a EStG) is booked here instead of on an interest
  // account, so it sits on one key only.
  interest_nondeductible_4_4a: expense('Nicht abziehbare Schuldzinsen (§ 4 Abs. 4a EStG)', 'nicht_abziehbar_schuldzinsen_4_4a', 'GuV.13', 'none', { nonDeductible: true }),
}

function buildChart(numbers: Readonly<Record<AccountConceptId, string>>): readonly LedgerAccount[] {
  const accounts = (Object.keys(numbers) as AccountConceptId[]).map((concept): LedgerAccount => {
    const def = CONCEPTS[concept]
    return Object.freeze({ ...def, number: numbers[concept], concept, eBilanz: def.hgb === null ? null : E_BILANZ_ELEMENTS[def.hgb] })
  })
  return Object.freeze(accounts.sort((a, b) => a.number.localeCompare(b.number)))
}

const CHARTS: Readonly<Record<ChartOfAccounts, readonly LedgerAccount[]>> = {
  SKR03: buildChart(SKR03_NUMBERS),
  SKR04: buildChart(SKR04_NUMBERS),
}

const BY_NUMBER: Readonly<Record<ChartOfAccounts, ReadonlyMap<string, LedgerAccount>>> = {
  SKR03: new Map(CHARTS.SKR03.map((a) => [a.number, a])),
  SKR04: new Map(CHARTS.SKR04.map((a) => [a.number, a])),
}

export function chartAccounts(chart: ChartOfAccounts): readonly LedgerAccount[] {
  return CHARTS[chart]
}

export function findAccount(chart: ChartOfAccounts, number: string): LedgerAccount | null {
  return BY_NUMBER[chart].get(number) ?? null
}

/** The account of a concept in the chart: lets rules and the Eule speak about accounts chart-independently. */
export function accountFor(chart: ChartOfAccounts, concept: AccountConceptId): LedgerAccount {
  const numbers = chart === 'SKR03' ? SKR03_NUMBERS : SKR04_NUMBERS
  return BY_NUMBER[chart].get(numbers[concept])!
}

/** The same account in the other chart (a user switching from SKR03 to SKR04 or back). */
export function translateAccount(from: ChartOfAccounts, number: string, to: ChartOfAccounts): string | null {
  const account = findAccount(from, number)
  return account === null ? null : accountFor(to, account.concept).number
}
