import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme, controlLine } from '@steuereule/ui'
import type { EntryStepId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'

interface GlossaryEntry {
  readonly summaryDe: string
  readonly exampleDe: string
  readonly summaryEn: string
  readonly exampleEn: string
}

const GLOSSARY: Partial<Record<EntryStepId, GlossaryEntry>> = {
  dhf: {
    summaryDe: 'Zweitwohnung am Arbeitsort aus beruflichen Gründen, während dein eigener Hausstand am Hauptwohnsitz bleibt.',
    exampleDe: 'Beispiel: Du wohnst mit deiner Familie in Freiburg, hast aber unter der Woche ein Zimmer in Zürich oder Frankfurt gemietet (bis zu 1.000 €/Monat absetzbar, § 9 Abs. 1 S. 3 Nr. 5 EStG).',
    summaryEn: 'A second home near your workplace for job reasons while keeping your main household at your primary residence.',
    exampleEn: 'Example: Your family lives in Freiburg and you rent a small apartment in Frankfurt during the workweek (deductible up to €1,000/month, § 9(1) No. 5 EStG).',
  },
  lohnersatz: {
    summaryDe: 'Steuerfreie Zahlungen wie Elterngeld, Krankengeld, Kurzarbeitergeld oder Arbeitslosengeld I.',
    exampleDe: 'Beispiel: Das Geld selbst bleibt steuerfrei, erhöht aber über den sogenannten Progressionsvorbehalt (§ 32b EStG) leicht den Steuersatz für dein übriges Einkommen.',
    summaryEn: 'Tax-free wage replacement benefits such as parental allowance (Elterngeld), sick pay, short-time work allowance, or unemployment benefit I.',
    exampleEn: 'Example: The benefit itself is tax-free, but slightly increases the tax rate applied to your remaining income (progression clause, § 32b EStG).',
  },
  nebenjob: {
    summaryDe: 'Ein zweites Arbeitsverhältnis neben deinem Hauptberuf.',
    exampleDe: 'Beispiel: Ein echter Minijob (pauschal versteuert bis 538 €/Monat) muss nicht in die Steuererklärung. Ein Midijob oder zweiter Job auf Steuerklasse 6 dagegen schon.',
    summaryEn: 'A secondary job alongside your main employment.',
    exampleEn: 'Example: A flat-taxed Minijob (up to €538/month) is left out of your return, whereas a second job on tax class 6 belongs in Annex N.',
  },
  abfindung: {
    summaryDe: 'Einmalzahlung deines Arbeitgebers beim Verlust des Arbeitsplatzes.',
    exampleDe: 'Beispiel: Durch die Fünftelregelung (§ 34 EStG) wird die Steuer oft deutlich gemildert, wenn die Abfindung in einem Jahr zusammengeballt zufließt.',
    summaryEn: 'One-off severance payment from your employer upon termination of employment.',
    exampleEn: 'Example: The one-fifth rule (Fünftelregelung, § 34 EStG) often lowers the tax burden on lump-sum severance payments.',
  },
  'kv-pv': {
    summaryDe: 'Beiträge zur Kranken- und Pflegeversicherung, die nicht schon auf deiner Lohnsteuerbescheinigung stehen.',
    exampleDe: 'Beispiel: Du bist privat krankenversichert, freiwillig gesetzlich selbstzahlend oder zahlst als Grenzgänger eine Schweizer/deutsche Krankenkasse (Sympany, Helsana, TK) selbst.',
    summaryEn: 'Health and long-term care insurance contributions you pay yourself rather than through German payroll.',
    exampleEn: 'Example: Private health insurance, voluntary statutory insurance paid directly, or cross-border Swiss/German health insurance.',
  },
  'kv-krankengeld': {
    summaryDe: 'Krankentagegeld- oder Krankengeldanspruch ab der 7. Woche im Krankheitsfall.',
    exampleDe: 'Beispiel: Wenn dein Tarif Krankengeld enthält, kürzt das Finanzamt den Beitrag pauschal um 4 % (§ 10 Abs. 1 Nr. 3 Buchst. a EStG).',
    summaryEn: 'Entitlement to daily sickness benefit from the 7th week of illness.',
    exampleEn: 'Example: If your tariff covers daily sickness benefit, the tax office reduces the deductible base contribution by 4% (§ 10(1) No. 3a EStG).',
  },
  riester: {
    summaryDe: 'Staatlich geförderter Altersvorsorgevertrag mit Grundzulage (175 €), Kinderzulagen (bis 300 €) und zusätzlichem Sonderausgabenabzug bis 2.100 €.',
    exampleDe: 'Beispiel: Das Finanzamt prüft automatisch, ob die Steuerersparnis höher ist als deine erhaltenen Zulagen (Günstigerprüfung nach § 10a EStG).',
    summaryEn: 'State-subsidized pension contract with basic allowance (€175), child allowances (up to €300) and special expense deduction up to €2,100.',
    exampleEn: 'Example: The tax office automatically checks whether the tax deduction exceeds the allowances received (§ 10a EStG).',
  },
  'riester-art': {
    summaryDe: 'Unmittelbar = du zahlst selbst in die gesetzliche Rentenversicherung ein (oder bist Beamter). Mittelbar = dein Ehepartner ist unmittelbar begünstigt und du hast einen Huckepack-Vertrag (mind. 60 €/Jahr).',
    exampleDe: 'Beispiel: Angestellte in Deutschland sind fast immer „unmittelbar“ begünstigt.',
    summaryEn: 'Direct (unmittelbar) = you pay into statutory pension insurance yourself. Indirect (mittelbar) = derived through your spouse.',
    exampleEn: 'Example: Employees in Germany are almost always directly eligible.',
  },
  'riester-einnahmen-vorjahr': {
    summaryDe: 'Dein rentenversicherungspflichtiges Bruttoeinkommen aus dem Vorjahr – steht auf der Jahresmeldung zur Sozialversicherung oder der vorjährigen Lohnsteuerbescheinigung (Zeile 3).',
    exampleDe: 'Beispiel: Daraus berechnet sich dein erforderlicher Mindesteigenbeitrag (4 % des Vorjahresbruttos abzüglich Zulagen) für die volle Riester-Zulage.',
    summaryEn: 'Your gross income subject to statutory pension contributions in the previous year (shown on your social security statement or prior-year LStB line 3).',
    exampleEn: 'Example: Used to calculate the 4% minimum contribution required for the full Riester subsidy.',
  },
  einkuenfte: {
    summaryDe: 'Zusätzliche Einnahmen außerhalb deines Gehalts oder deiner Rente: Zinsen, Dividenden, Aktiengewinne (Anlage KAP) oder Mieteinnahmen (Anlage V).',
    exampleDe: 'Beispiel: Wenn deine Bank Kapitalertragsteuer einbehalten hat, obwohl dein Sparer-Pauschbetrag (1.000 € / 2.000 €) noch nicht ausgeschöpft war, holst du dir die Steuer über die Anlage KAP zurück.',
    summaryEn: 'Additional income outside your salary or pension: interest, dividends, capital gains (Annex KAP) or rental income (Annex V).',
    exampleEn: 'Example: If your bank withheld flat-rate tax even though your saver’s allowance (€1,000 / €2,000) was unused, Annex KAP refunds it.',
  },
  'kap-depot': {
    summaryDe: 'Deutsche Banken führen 25 % Abgeltungsteuer automatisch ab. Ausländische Broker (z. B. Interactive Brokers, Degiro, Swissquote) tun das meist nicht.',
    exampleDe: 'Beispiel: Bei einem ausländischen Depot musst du die Erträge in der Anlage KAP erklären; bei deutschen Banken lohnt sich die Angabe für den Sparer-Pauschbetrag oder die Günstigerprüfung.',
    summaryEn: 'German banks withhold 25% capital gains tax automatically; foreign brokers usually do not.',
    exampleEn: 'Example: Foreign brokerage accounts must be declared in Annex KAP; German accounts are useful for the saver’s allowance or favorable tax check.',
  },
  'gesundheit-gate': {
    summaryDe: 'Selbst getragene medizinische Ausgaben (Zahnarzt, Brille, Hörgerät, Physiotherapie, Rezeptgebühren) nach Abzug von Kassenerstattungen.',
    exampleDe: 'Beispiel: Das Finanzamt zieht automatisch eine „zumutbare Belastung“ (je nach Einkommen und Kinderzahl ca. 1 % bis 7 %) ab – jeder Euro darüber senkt deine Steuer (§ 33 EStG).',
    summaryEn: 'Out-of-pocket medical expenses (dentist, glasses, prescriptions, physiotherapy) after insurance reimbursements.',
    exampleEn: 'Example: The tax office deducts a reasonable personal burden (approx. 1%–7% depending on income and children); amounts above that reduce your taxable income (§ 33 EStG).',
  },
  'vorauszahlungen-gate': {
    summaryDe: 'Vierteljährliche Einkommensteuer-Vorauszahlungen (10.03., 10.06., 10.09., 10.12.), die das Finanzamt per Vorauszahlungsbescheid festgesetzt hat.',
    exampleDe: 'Beispiel: Besonders häufig bei Grenzgängern in die Schweiz und bei Vermietern. Jeder gezahlte Euro wird 1:1 wie Lohnsteuer auf deine Jahressteuer angerechnet.',
    summaryEn: 'Quarterly income tax prepayments assessed by the tax office (March 10, June 10, Sept 10, Dec 10).',
    exampleEn: 'Example: Common for Swiss cross-border commuters and landlords. Every euro paid is credited 1:1 against your annual tax.',
  },
  'ae-weitere-person': {
    summaryDe: 'Für den Entlastungsbetrag für Alleinerziehende (4.260 € + 240 € ab dem 2. Kind, § 24b EStG) darf keine weitere volljährige Person im Haushalt leben.',
    exampleDe: 'Beispiel: Lebt ein volljähriges Kind im Haushalt, für das du noch Kindergeld bekommst, ist das unschädlich.',
    summaryEn: 'For the single-parent relief (€4,260 + €240 per additional child, § 24b EStG), no other adult may live in the household.',
    exampleEn: 'Example: An adult child for whom you still receive child benefit does not disqualify you.',
  },
  'ae-haushaltsgemeinschaft': {
    summaryDe: 'Gemeinsames Wirtschaften („aus einem Topf“) mit einem Partner oder Mitbewohner in derselben Wohnung.',
    exampleDe: 'Beispiel: Besteht eine Haushaltsgemeinschaft mit einer anderen erwachsenen Person, entfällt der Entlastungsbetrag nach § 24b EStG.',
    summaryEn: 'Sharing household finances and living expenses with another adult in the same home.',
    exampleEn: 'Example: Sharing a household with a partner or roommate excludes the single-parent relief under § 24b EStG.',
  },
  'ch-nichtrueckkehrtage': {
    summaryDe: 'Tage, an denen du aus beruflichen Gründen nicht an deinen deutschen Wohnsitz zurückgekehrt bist (60-Tage-Regel nach Art. 15a DBA-Schweiz).',
    exampleDe: 'Beispiel: Übernachtungen in der Schweiz oder auf mehrtägigen Dienstreisen zählen als Nichtrückkehrtage. Krankheit, Urlaub oder Homeoffice in Deutschland zählen nicht mit.',
    summaryEn: 'Workdays on which you did not return to your German residence for job-related reasons (60-day rule, Art. 15a DBA-Switzerland).',
    exampleEn: 'Example: Overnight business trips or staying in Switzerland count; vacation, illness, or home office days in Germany do not.',
  },
}

export function hasGlossaryEntry(stepId: EntryStepId): boolean {
  return GLOSSARY[stepId] !== undefined
}

export function GlossaryHint({ stepId }: { readonly stepId: EntryStepId }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { i18n } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)

  const isEn = i18n.language.startsWith('en')
  const entry = GLOSSARY[stepId]
  if (!entry) return null

  const toggleLabel = isEn
    ? open
      ? 'ⓘ What does this mean? ▲'
      : 'ⓘ What does this mean?'
    : open
      ? 'ⓘ Was heißt das? ▲'
      : 'ⓘ Was heißt das?'

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.toggleBtn}
        testID={`glossar-toggle-${stepId}`}
      >
        <Text style={styles.toggleText}>{toggleLabel}</Text>
      </Pressable>
      {open ? (
        <View style={styles.box} testID={`glossar-text-${stepId}`}>
          <Text style={styles.summary}>{isEn ? entry.summaryEn : entry.summaryDe}</Text>
          <Text style={styles.example}>{isEn ? entry.exampleEn : entry.exampleDe}</Text>
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const wrap: ViewStyle = {
    marginBottom: t.space.s3,
  }
  const toggleBtn: ViewStyle = {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: t.space.s2,
    borderRadius: t.radius.pille,
    borderWidth: 1,
    borderColor: controlLine(t),
    backgroundColor: t.color.karte,
  }
  const toggleText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
  }
  const box: ViewStyle = {
    marginTop: t.space.s2,
    padding: t.space.s3,
    borderRadius: t.radius.s,
    borderWidth: 1,
    borderColor: t.color.linie,
    backgroundColor: t.color.karte,
    gap: t.space.s1,
  }
  const summary: TextStyle = {
    ...t.type.small,
    color: t.color.tinte,
  }
  const example: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
  }
  return { wrap, toggleBtn, toggleText, box, summary, example }
}
