export type LegalPage = 'impressum' | 'datenschutz' | 'agb' | 'hinweise'

export const LEGAL_PAGES: readonly LegalPage[] = ['impressum', 'datenschutz', 'agb', 'hinweise']

export const STATUS = 'Stand: Oktober 2026'

export interface Section {
  readonly title: string
  readonly paragraphs: readonly string[]
}

export interface Operator {
  readonly name: string
  readonly postalAddress: string
  readonly email: string
  readonly represented?: string
  readonly ustId?: string
}

export function operatorFromEnv(env: Record<string, string | undefined>): Operator | null {
  const name = env.EXPO_PUBLIC_BETREIBER_NAME?.trim()
  const postalAddress = env.EXPO_PUBLIC_BETREIBER_ANSCHRIFT?.trim()
  const email = env.EXPO_PUBLIC_BETREIBER_EMAIL?.trim()
  if (!name || !postalAddress || !email) return null
  const represented = env.EXPO_PUBLIC_BETREIBER_VERTRETEN?.trim()
  const ustId = env.EXPO_PUBLIC_BETREIBER_USTID?.trim()
  return {
    name,
    postalAddress: postalAddress.replaceAll('\\n', '\n'),
    email,
    ...(represented ? { represented } : {}),
    ...(ustId ? { ustId } : {}),
  }
}

export function legalNotice(operator: Operator | null): readonly Section[] {
  if (!operator) {
    return [
      {
        title: 'Angaben gemäß § 5 DDG',
        paragraphs: ['Die Anbieterangaben sind auf dieser Umgebung noch nicht hinterlegt.'],
      },
    ]
  }
  return [
    {
      title: 'Angaben gemäß § 5 DDG',
      paragraphs: [
        `${operator.name}\n${operator.postalAddress}`,
        ...(operator.represented ? [`Vertreten durch: ${operator.represented}`] : []),
      ],
    },
    { title: 'Kontakt', paragraphs: [`E-Mail: ${operator.email}`] },
    ...(operator.ustId
      ? [{ title: 'Umsatzsteuer-ID', paragraphs: [`Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${operator.ustId}`] }]
      : []),
    {
      title: 'Verbraucherstreitbeilegung',
      paragraphs: [
        'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
      ],
    },
  ]
}

export function privacy(operator: Operator | null): readonly Section[] {
  const responsible = operator
    ? `${operator.name}, ${operator.postalAddress.replaceAll('\n', ', ')}, E-Mail: ${operator.email}`
    : 'Die Angaben zum Verantwortlichen sind auf dieser Umgebung noch nicht hinterlegt (siehe Impressum).'
  return [
    { title: '1. Verantwortlicher', paragraphs: [responsible] },
    {
      title: '2. Welche Daten wir verarbeiten',
      paragraphs: [
        'Gastmodus: Du kannst ohne Konto starten. Wir setzen dafür ein technisch notwendiges Cookie mit einer zufälligen Kennung und speichern deine Interview-Antworten zu dieser Kennung.',
        'Konto: E-Mail-Adresse, Name, Passwort (nur als Hash gespeichert), optional Passkeys und Zwei-Faktor-Daten sowie Sitzungsdaten (Zeitpunkt, IP-Adresse, Browser) zur Absicherung deines Kontos.',
        'Steuerdaten: die Angaben, die du für deine Steuererklärung einträgst (z. B. Lohnsteuerbescheinigung, Renten, Kapitalerträge, Vermietung, Bescheide, Belegnamen) sowie deine Steuer-ID und Steuernummer. Diese Werte speichern wir feldweise verschlüsselt (AES-256-GCM).',
        'Zugriffsprotokoll: Jeder Lese- und Schreibzugriff auf deine Steuerdaten wird protokolliert (wer, was, wann – ohne die Werte selbst). Du siehst dieses Protokoll in deinem Datenexport.',
        'Zahlungen: Für die Freischaltung des Formular-Ausdrucks speichern wir Steuerjahr, Betrag, Zahlungsstatus und die Kennung des Zahlungsvorgangs. Zahlungsdaten (Karte, Konto) erhält ausschließlich unser Zahlungsdienstleister.',
      ],
    },
    {
      title: '3. Zwecke und Rechtsgrundlagen',
      paragraphs: [
        'Bereitstellung der App und Vorbereitung deiner Steuererklärung: Art. 6 Abs. 1 lit. b DSGVO (Vertrag).',
        'Absicherung deines Kontos (Sitzungen, Anmeldeschutz, Prüfung auf bekannte geleakte Passwörter): Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren Dienst).',
        'Rechnungen und Aufbewahrung von Geschäftsunterlagen: Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO und § 257 HGB.',
        'Es gibt kein Tracking, keine Analyse- oder Werbe-Cookies und keine Weitergabe zu Werbezwecken.',
      ],
    },
    {
      title: '4. Empfänger',
      paragraphs: [
        'Hosting: Unsere Server und die Datenbank betreibt ein Rechenzentrumsanbieter in der EU als Auftragsverarbeiter.',
        'E-Mail-Versand: Bestätigungs- und Passwort-Links versenden wir über Brevo (Sendinblue SAS, Frankreich) als Auftragsverarbeiter.',
        'Zahlungen: Stripe Payments Europe Ltd. (Irland) wickelt Zahlungen ab und ist dafür eigenständig verantwortlich.',
        'Anmeldung mit Google (nur wenn du sie wählst): Google Ireland Ltd. erhält die für die Anmeldung nötigen Daten.',
        'Passwortprüfung: Bei der Registrierung prüfen wir dein Passwort gegen die Datenbank „Have I Been Pwned“. Dabei verlassen nur die ersten fünf Zeichen eines Hash-Werts unseren Server, nie dein Passwort.',
        'An das Finanzamt übermitteln wir nichts. Du druckst die Formulare aus und reichst sie selbst ein.',
      ],
    },
    {
      title: '5. Speicherdauer',
      paragraphs: [
        'Deine Daten speichern wir, solange du dein Konto nutzt. Löschst du dein Konto, entfernen wir Konto, Profil und alle Steuerdaten sofort; das Zugriffsprotokoll wird anonymisiert. Daten, die wir aus gesetzlichen Gründen aufbewahren müssen, sperren wir bis zum Fristablauf.',
      ],
    },
    {
      title: '6. Deine Rechte',
      paragraphs: [
        'Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Export und Löschung kannst du jederzeit selbst unter „Profil → Datenschutz“ auslösen.',
        'Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, insbesondere in dem Bundesland deines Wohnsitzes.',
      ],
    },
    { title: STATUS, paragraphs: [] },
  ]
}

export function terms(operator: Operator | null): readonly Section[] {
  const provider = operator?.name ?? 'der im Impressum genannte Anbieter'
  return [
    {
      title: '§ 1 Geltungsbereich',
      paragraphs: [
        `Diese Bedingungen gelten für die Nutzung von SteuerEule, angeboten von ${provider} („wir“).`,
      ],
    },
    {
      title: '§ 2 Leistung',
      paragraphs: [
        'SteuerEule ist eine Software, mit der du die Angaben für deine Einkommensteuererklärung erfasst, prüfst und als ausgefüllte Formulare zum Ausdrucken erhältst.',
        'SteuerEule übermittelt keine Daten an das Finanzamt. Du prüfst die Ausdrucke, unterschreibst sie und reichst sie selbst ein. Für die Richtigkeit und Vollständigkeit deiner Angaben bist du verantwortlich.',
        'SteuerEule ist keine Steuerberatung und keine Hilfeleistung in Steuersachen im Sinne des Steuerberatungsgesetzes. Schätzungen und Hinweise in der App sind unverbindlich.',
      ],
    },
    {
      title: '§ 3 Konto',
      paragraphs: [
        'Für die bezahlte Freischaltung brauchst du ein Konto. Halte deine Zugangsdaten geheim. Du kannst dein Konto jederzeit in der App löschen.',
      ],
    },
    {
      title: '§ 4 Preise und Zahlung',
      paragraphs: [
        'Das Erfassen und Prüfen ist kostenlos. Kostenpflichtig ist die Freischaltung des Formular-Ausdrucks für ein Steuerjahr; der Preis wird vor der Zahlung angezeigt und enthält die gesetzliche Umsatzsteuer.',
        'Die Zahlung wickelt Stripe ab. Du erhältst eine Rechnung per E-Mail.',
      ],
    },
    {
      title: '§ 5 Widerrufsrecht',
      paragraphs: [
        `Widerrufsbelehrung: Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um dein Widerrufsrecht auszuüben, musst du uns (${provider}, Kontakt siehe Impressum) mittels einer eindeutigen Erklärung (z. B. per E-Mail) über deinen Entschluss informieren. Zur Wahrung der Frist reicht es, dass du die Mitteilung vor Ablauf der Frist absendest.`,
        'Folgen des Widerrufs: Wenn du diesen Vertrag widerrufst, erstatten wir dir alle Zahlungen unverzüglich, spätestens binnen vierzehn Tagen ab Eingang deines Widerrufs, über dasselbe Zahlungsmittel.',
        'Vorzeitiges Erlöschen: Dein Widerrufsrecht erlischt, wenn wir mit der Bereitstellung des Formular-Ausdrucks begonnen haben, nachdem du vor der Zahlung ausdrücklich zugestimmt hast, dass wir vor Ablauf der Widerrufsfrist beginnen, und du bestätigt hast, dass du dadurch dein Widerrufsrecht verlierst (§ 356 Abs. 5 BGB).',
        'Muster-Widerrufsformular: An [Anbieter laut Impressum]: Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Freischaltung des Formular-Ausdrucks für das Steuerjahr ___. Bestellt am ___ / Name ___ / Anschrift ___ / Datum ___.',
      ],
    },
    {
      title: '§ 6 Haftung',
      paragraphs: [
        'Wir haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz.',
        'Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht ist unsere Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.',
      ],
    },
    {
      title: '§ 7 Datenschutz',
      paragraphs: ['Wie wir mit deinen Daten umgehen, steht in der Datenschutzerklärung.'],
    },
    {
      title: '§ 8 Schlussbestimmungen',
      paragraphs: [
        'Es gilt deutsches Recht. Bist du Verbraucher, bleiben zwingende Schutzvorschriften des Staates deines gewöhnlichen Aufenthalts unberührt.',
      ],
    },
    { title: STATUS, paragraphs: [] },
  ]
}

export const NOTICES: readonly Section[] = [
  {
    title: 'Keine Steuerberatung',
    paragraphs: [
      'SteuerEule ist eine Software zum Selbstausfüllen deiner Steuererklärung. Sie ersetzt keine Beratung durch eine Steuerberaterin, einen Steuerberater oder einen Lohnsteuerhilfeverein.',
      'Bei Fragen zu deinem Einzelfall – besonders bei Selbstständigkeit, Gewerbe, Auslandsbezug außerhalb der Schweiz oder hohen Beträgen – lass dich beraten.',
    ],
  },
  {
    title: 'Spannen statt Versprechen',
    paragraphs: [
      'Erstattungen zeigen wir als Spanne. Was das Finanzamt festsetzt, steht erst im Bescheid. Prüfe den Bescheid – SteuerEule hilft dir beim Abgleich.',
    ],
  },
  {
    title: 'Abgabe auf Papier',
    paragraphs: [
      'SteuerEule übermittelt nichts elektronisch an das Finanzamt. Du druckst die ausgefüllten Formulare aus, prüfst sie, unterschreibst den Hauptvordruck und reichst alles bei deinem Finanzamt ein. Wer Gewinneinkünfte hat (z. B. aus Gewerbe oder Selbstständigkeit), muss elektronisch abgeben – diese Fälle unterstützt SteuerEule nicht.',
    ],
  },
]

export const PAGE_TITLES: Record<LegalPage, string> = {
  impressum: 'Impressum',
  datenschutz: 'Datenschutzerklärung',
  agb: 'AGB & Widerruf',
  hinweise: 'Wichtige Hinweise',
}

export function content(page: LegalPage, operator: Operator | null): readonly Section[] {
  switch (page) {
    case 'impressum':
      return legalNotice(operator)
    case 'datenschutz':
      return privacy(operator)
    case 'agb':
      return terms(operator)
    case 'hinweise':
      return NOTICES
  }
}
