import type { Profession } from './interview'

/** Legal sources the profession tips cite (a subset of OwlSourceId). */
export type ProfessionTipSourceId = 'estg-9-1' | 'estg-9-1-6' | 'estg-9-4a' | 'estg-9-6'

export interface ProfessionTip {
  /** Stable key — part of the card's fingerprint, so a dismissed tip stays dismissed. */
  readonly key: string
  readonly title: string
  readonly message: string
  readonly reason: string
  readonly sourceId: ProfessionTipSourceId
  readonly sourceTranslated: string
  readonly sourceUrl: string
  /** Skip this tip when the interview already says the user has training costs. */
  readonly unlessTraining?: true
}

const ESTG_9_URL = 'https://www.gesetze-im-internet.de/estg/__9.html'

const TRAINING: ProfessionTip = {
  key: 'fortbildung',
  title: 'Kurse und Zertifikate absetzen',
  message: 'Hast du dieses Jahr einen Kurs, eine Zertifizierung oder eine Konferenz für deinen Job bezahlt? Das holst du dir über die Steuer teilweise zurück.',
  reason: 'weil Fortbildungskosten für den ausgeübten Beruf Werbungskosten sind — Kursgebühr, Prüfung, Fachbücher und die Fahrt dorthin.',
  sourceId: 'estg-9-1',
  sourceTranslated: 'Werbungskosten (§ 9 Abs. 1 Satz 1 EStG).',
  sourceUrl: ESTG_9_URL,
  unlessTraining: true,
}

const WORK_EQUIPMENT_UP_TO_800: Omit<ProfessionTip, 'key' | 'title' | 'message'> = {
  reason: 'weil Arbeitsmittel bis 800 € netto (952 € mit Umsatzsteuer) im Jahr der Anschaffung voll absetzbar sind; teurere werden über die Nutzungsdauer verteilt.',
  sourceId: 'estg-9-1-6',
  sourceTranslated: 'Arbeitsmittel (§ 9 Abs. 1 Satz 3 Nr. 6 und 7 EStG).',
  sourceUrl: ESTG_9_URL,
}

/**
 * The tips the owl gives per occupation group. Each is a question to the user, never a figure:
 * the owl asks, the user decides — the amount comes from the user's own receipts.
 */
export const PROFESSION_TIPS: Readonly<Record<Profession, readonly ProfessionTip[]>> = {
  'IT & Software': [
    TRAINING,
    {
      key: 'it-hardware',
      title: 'Laptop, Monitor, Software',
      message: 'Hast du dir für die Arbeit Hardware oder Software gekauft? Computer und Software setzt du im Jahr des Kaufs komplett ab — egal, was sie gekostet haben.',
      reason: 'weil die Finanzverwaltung für Computerhardware und Software eine Nutzungsdauer von einem Jahr ansetzt (BMF-Schreiben vom 22.02.2022); bei privater Mitnutzung zählt der berufliche Anteil.',
      sourceId: 'estg-9-1-6',
      sourceTranslated: 'Arbeitsmittel (§ 9 Abs. 1 Satz 3 Nr. 6 EStG).',
      sourceUrl: ESTG_9_URL,
    },
  ],
  'Pflege & Gesundheit': [
    {
      key: 'berufskleidung',
      title: 'Dienstkleidung und Reinigung',
      message: 'Kaufst und wäschst du deine Dienstkleidung selbst? Kittel, Kasack und Arbeitsschuhe sind absetzbar — die Reinigung auch.',
      reason: 'weil typische Berufskleidung ein Arbeitsmittel ist; Alltagskleidung zählt nicht, auch wenn du sie nur bei der Arbeit trägst.',
      sourceId: 'estg-9-1-6',
      sourceTranslated: 'Typische Berufskleidung als Arbeitsmittel (§ 9 Abs. 1 Satz 3 Nr. 6 EStG).',
      sourceUrl: ESTG_9_URL,
    },
    TRAINING,
  ],
  'Lehrkraft & Erziehung': [
    {
      key: 'unterrichtsmaterial',
      title: 'Material, Fachliteratur, Laptop',
      message: 'Zahlst du Unterrichtsmaterial, Fachbücher oder deinen Laptop selbst? Das ist absetzbar.',
      ...WORK_EQUIPMENT_UP_TO_800,
    },
    TRAINING,
  ],
  'Handwerk & Technik': [
    {
      key: 'werkzeug',
      title: 'Werkzeug und Arbeitskleidung',
      message: 'Hast du eigenes Werkzeug, Sicherheitsschuhe oder Arbeitskleidung gekauft? Das holst du dir zurück.',
      ...WORK_EQUIPMENT_UP_TO_800,
    },
    TRAINING,
  ],
  'Büro & Verwaltung': [
    {
      key: 'arbeitsmittel',
      title: 'Arbeitsmittel für zu Hause',
      message: 'Hast du für die Arbeit einen Schreibtisch, Stuhl, Monitor oder Fachbücher gekauft? Das ist absetzbar.',
      ...WORK_EQUIPMENT_UP_TO_800,
    },
    TRAINING,
  ],
  'Vertrieb & Außendienst': [
    {
      key: 'verpflegung',
      title: 'Verpflegung auf Dienstreisen',
      message: 'Bist du beruflich unterwegs und mehr als 8 Stunden von zu Hause und deinem Büro weg? Dann gibt es eine Pauschale fürs Essen — auch ohne Beleg.',
      reason: 'weil bei beruflicher Auswärtstätigkeit Verpflegungspauschalen gelten: 14 € ab mehr als 8 Stunden Abwesenheit, 28 € für volle Tage — abzüglich dessen, was der Arbeitgeber steuerfrei erstattet.',
      sourceId: 'estg-9-4a',
      sourceTranslated: 'Verpflegungsmehraufwendungen (§ 9 Abs. 4a EStG).',
      sourceUrl: ESTG_9_URL,
    },
  ],
  'Ausbildung oder Studium': [
    {
      key: 'zweitausbildung',
      title: 'Studium oder Ausbildung als Investition',
      message: 'Ist das dein zweites Studium (z. B. Master nach dem Bachelor) oder eine Ausbildung nach einer ersten? Dann lohnt sich eine Steuererklärung auch ohne Einkommen.',
      reason: 'weil Kosten einer Zweitausbildung Werbungskosten sind und als Verlust in spätere Jahre mit Gehalt vorgetragen werden; eine Erstausbildung außerhalb eines Ausbildungsdienstverhältnisses zählt nur als Sonderausgabe bis 6.000 €, ohne Vortrag.',
      sourceId: 'estg-9-6',
      sourceTranslated: 'Aufwendungen für Erst- und Zweitausbildung (§ 9 Abs. 6 EStG).',
      sourceUrl: ESTG_9_URL,
    },
  ],
  'Etwas anderes': [TRAINING],
}

export function professionTipsFor(profession: Profession | undefined, hasTraining: boolean): readonly ProfessionTip[] {
  if (profession === undefined) return []
  return PROFESSION_TIPS[profession].filter((tip) => !(tip.unlessTraining && hasTraining))
}
