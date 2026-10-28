// Legal pages (ADR-0050). German only on purpose: the binding text of a German consumer
// contract is the German one, and a translated Impressum/AGB would be a second version to
// keep legally consistent.
//
// DRAFT — written against what the code actually does (recipients: hosting, Brevo, Stripe,
// Google only on Google sign-in, Have I Been Pwned via k-anonymity; no analytics, no
// tracking, no ELSTER transmission). It MUST be reviewed by a lawyer before the first paid
// sale; the Stand line below is the version marker to bump on every change.

export type RechtlicheSeite = 'impressum' | 'datenschutz' | 'agb' | 'hinweise'

export const RECHTLICHE_SEITEN: readonly RechtlicheSeite[] = ['impressum', 'datenschutz', 'agb', 'hinweise']

export const STAND = 'Stand: Oktober 2026'

export interface Abschnitt {
  readonly titel: string
  readonly absaetze: readonly string[]
}

export interface Betreiber {
  readonly name: string
  readonly anschrift: string
  readonly email: string
  readonly vertreten?: string
  readonly ustId?: string
}

/**
 * The operator data comes from the build environment, never from this file — a missing
 * value must stay visibly missing (the Impressum then says so), not be filled with a
 * placeholder that looks real.
 */
export function betreiberAusUmgebung(env: Record<string, string | undefined>): Betreiber | null {
  const name = env.EXPO_PUBLIC_BETREIBER_NAME?.trim()
  const anschrift = env.EXPO_PUBLIC_BETREIBER_ANSCHRIFT?.trim()
  const email = env.EXPO_PUBLIC_BETREIBER_EMAIL?.trim()
  if (!name || !anschrift || !email) return null
  const vertreten = env.EXPO_PUBLIC_BETREIBER_VERTRETEN?.trim()
  const ustId = env.EXPO_PUBLIC_BETREIBER_USTID?.trim()
  return {
    name,
    // `\n` in an env value arrives literally; it separates the address lines.
    anschrift: anschrift.replaceAll('\\n', '\n'),
    email,
    ...(vertreten ? { vertreten } : {}),
    ...(ustId ? { ustId } : {}),
  }
}

export function impressum(betreiber: Betreiber | null): readonly Abschnitt[] {
  if (!betreiber) {
    return [
      {
        titel: 'Angaben gemäß § 5 DDG',
        absaetze: ['Die Anbieterangaben sind auf dieser Umgebung noch nicht hinterlegt.'],
      },
    ]
  }
  return [
    {
      titel: 'Angaben gemäß § 5 DDG',
      absaetze: [
        `${betreiber.name}\n${betreiber.anschrift}`,
        ...(betreiber.vertreten ? [`Vertreten durch: ${betreiber.vertreten}`] : []),
      ],
    },
    { titel: 'Kontakt', absaetze: [`E-Mail: ${betreiber.email}`] },
    ...(betreiber.ustId
      ? [{ titel: 'Umsatzsteuer-ID', absaetze: [`Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${betreiber.ustId}`] }]
      : []),
    {
      titel: 'Verbraucherstreitbeilegung',
      absaetze: [
        'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
      ],
    },
  ]
}

export function datenschutz(betreiber: Betreiber | null): readonly Abschnitt[] {
  const verantwortlich = betreiber
    ? `${betreiber.name}, ${betreiber.anschrift.replaceAll('\n', ', ')}, E-Mail: ${betreiber.email}`
    : 'Die Angaben zum Verantwortlichen sind auf dieser Umgebung noch nicht hinterlegt (siehe Impressum).'
  return [
    { titel: '1. Verantwortlicher', absaetze: [verantwortlich] },
    {
      titel: '2. Welche Daten wir verarbeiten',
      absaetze: [
        'Gastmodus: Du kannst ohne Konto starten. Wir setzen dafür ein technisch notwendiges Cookie mit einer zufälligen Kennung und speichern deine Interview-Antworten zu dieser Kennung.',
        'Konto: E-Mail-Adresse, Name, Passwort (nur als Hash gespeichert), optional Passkeys und Zwei-Faktor-Daten sowie Sitzungsdaten (Zeitpunkt, IP-Adresse, Browser) zur Absicherung deines Kontos.',
        'Steuerdaten: die Angaben, die du für deine Steuererklärung einträgst (z. B. Lohnsteuerbescheinigung, Renten, Kapitalerträge, Vermietung, Bescheide, Belegnamen) sowie deine Steuer-ID und Steuernummer. Diese Werte speichern wir feldweise verschlüsselt (AES-256-GCM).',
        'Zugriffsprotokoll: Jeder Lese- und Schreibzugriff auf deine Steuerdaten wird protokolliert (wer, was, wann – ohne die Werte selbst). Du siehst dieses Protokoll in deinem Datenexport.',
        'Zahlungen: Für die Freischaltung des Formular-Ausdrucks speichern wir Steuerjahr, Betrag, Zahlungsstatus und die Kennung des Zahlungsvorgangs. Zahlungsdaten (Karte, Konto) erhält ausschließlich unser Zahlungsdienstleister.',
      ],
    },
    {
      titel: '3. Zwecke und Rechtsgrundlagen',
      absaetze: [
        'Bereitstellung der App und Vorbereitung deiner Steuererklärung: Art. 6 Abs. 1 lit. b DSGVO (Vertrag).',
        'Absicherung deines Kontos (Sitzungen, Anmeldeschutz, Prüfung auf bekannte geleakte Passwörter): Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren Dienst).',
        'Rechnungen und Aufbewahrung von Geschäftsunterlagen: Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO und § 257 HGB.',
        'Es gibt kein Tracking, keine Analyse- oder Werbe-Cookies und keine Weitergabe zu Werbezwecken.',
      ],
    },
    {
      titel: '4. Empfänger',
      absaetze: [
        'Hosting: Unsere Server und die Datenbank betreibt ein Rechenzentrumsanbieter in der EU als Auftragsverarbeiter.',
        'E-Mail-Versand: Bestätigungs- und Passwort-Links versenden wir über Brevo (Sendinblue SAS, Frankreich) als Auftragsverarbeiter.',
        'Zahlungen: Stripe Payments Europe Ltd. (Irland) wickelt Zahlungen ab und ist dafür eigenständig verantwortlich.',
        'Anmeldung mit Google (nur wenn du sie wählst): Google Ireland Ltd. erhält die für die Anmeldung nötigen Daten.',
        'Passwortprüfung: Bei der Registrierung prüfen wir dein Passwort gegen die Datenbank „Have I Been Pwned“. Dabei verlassen nur die ersten fünf Zeichen eines Hash-Werts unseren Server, nie dein Passwort.',
        'An das Finanzamt übermitteln wir nichts. Du druckst die Formulare aus und reichst sie selbst ein.',
      ],
    },
    {
      titel: '5. Speicherdauer',
      absaetze: [
        'Deine Daten speichern wir, solange du dein Konto nutzt. Löschst du dein Konto, entfernen wir Konto, Profil und alle Steuerdaten sofort; das Zugriffsprotokoll wird anonymisiert. Daten, die wir aus gesetzlichen Gründen aufbewahren müssen, sperren wir bis zum Fristablauf.',
      ],
    },
    {
      titel: '6. Deine Rechte',
      absaetze: [
        'Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Export und Löschung kannst du jederzeit selbst unter „Profil → Datenschutz“ auslösen.',
        'Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, insbesondere in dem Bundesland deines Wohnsitzes.',
      ],
    },
    { titel: STAND, absaetze: [] },
  ]
}

export function agb(betreiber: Betreiber | null): readonly Abschnitt[] {
  const anbieter = betreiber?.name ?? 'der im Impressum genannte Anbieter'
  return [
    {
      titel: '§ 1 Geltungsbereich',
      absaetze: [
        `Diese Bedingungen gelten für die Nutzung von SteuerEule, angeboten von ${anbieter} („wir“).`,
      ],
    },
    {
      titel: '§ 2 Leistung',
      absaetze: [
        'SteuerEule ist eine Software, mit der du die Angaben für deine Einkommensteuererklärung erfasst, prüfst und als ausgefüllte Formulare zum Ausdrucken erhältst.',
        'SteuerEule übermittelt keine Daten an das Finanzamt. Du prüfst die Ausdrucke, unterschreibst sie und reichst sie selbst ein. Für die Richtigkeit und Vollständigkeit deiner Angaben bist du verantwortlich.',
        'SteuerEule ist keine Steuerberatung und keine Hilfeleistung in Steuersachen im Sinne des Steuerberatungsgesetzes. Schätzungen und Hinweise in der App sind unverbindlich.',
      ],
    },
    {
      titel: '§ 3 Konto',
      absaetze: [
        'Für die bezahlte Freischaltung brauchst du ein Konto. Halte deine Zugangsdaten geheim. Du kannst dein Konto jederzeit in der App löschen.',
      ],
    },
    {
      titel: '§ 4 Preise und Zahlung',
      absaetze: [
        'Das Erfassen und Prüfen ist kostenlos. Kostenpflichtig ist die Freischaltung des Formular-Ausdrucks für ein Steuerjahr; der Preis wird vor der Zahlung angezeigt und enthält die gesetzliche Umsatzsteuer.',
        'Die Zahlung wickelt Stripe ab. Du erhältst eine Rechnung per E-Mail.',
      ],
    },
    {
      titel: '§ 5 Widerrufsrecht',
      absaetze: [
        `Widerrufsbelehrung: Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um dein Widerrufsrecht auszuüben, musst du uns (${anbieter}, Kontakt siehe Impressum) mittels einer eindeutigen Erklärung (z. B. per E-Mail) über deinen Entschluss informieren. Zur Wahrung der Frist reicht es, dass du die Mitteilung vor Ablauf der Frist absendest.`,
        'Folgen des Widerrufs: Wenn du diesen Vertrag widerrufst, erstatten wir dir alle Zahlungen unverzüglich, spätestens binnen vierzehn Tagen ab Eingang deines Widerrufs, über dasselbe Zahlungsmittel.',
        'Vorzeitiges Erlöschen: Dein Widerrufsrecht erlischt, wenn wir mit der Bereitstellung des Formular-Ausdrucks begonnen haben, nachdem du vor der Zahlung ausdrücklich zugestimmt hast, dass wir vor Ablauf der Widerrufsfrist beginnen, und du bestätigt hast, dass du dadurch dein Widerrufsrecht verlierst (§ 356 Abs. 5 BGB).',
        'Muster-Widerrufsformular: An [Anbieter laut Impressum]: Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Freischaltung des Formular-Ausdrucks für das Steuerjahr ___. Bestellt am ___ / Name ___ / Anschrift ___ / Datum ___.',
      ],
    },
    {
      titel: '§ 6 Haftung',
      absaetze: [
        'Wir haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz.',
        'Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht ist unsere Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.',
      ],
    },
    {
      titel: '§ 7 Datenschutz',
      absaetze: ['Wie wir mit deinen Daten umgehen, steht in der Datenschutzerklärung.'],
    },
    {
      titel: '§ 8 Schlussbestimmungen',
      absaetze: [
        'Es gilt deutsches Recht. Bist du Verbraucher, bleiben zwingende Schutzvorschriften des Staates deines gewöhnlichen Aufenthalts unberührt.',
      ],
    },
    { titel: STAND, absaetze: [] },
  ]
}

export const HINWEISE: readonly Abschnitt[] = [
  {
    titel: 'Keine Steuerberatung',
    absaetze: [
      'SteuerEule ist eine Software zum Selbstausfüllen deiner Steuererklärung. Sie ersetzt keine Beratung durch eine Steuerberaterin, einen Steuerberater oder einen Lohnsteuerhilfeverein.',
      'Bei Fragen zu deinem Einzelfall – besonders bei Selbstständigkeit, Gewerbe, Auslandsbezug außerhalb der Schweiz oder hohen Beträgen – lass dich beraten.',
    ],
  },
  {
    titel: 'Spannen statt Versprechen',
    absaetze: [
      'Erstattungen zeigen wir als Spanne. Was das Finanzamt festsetzt, steht erst im Bescheid. Prüfe den Bescheid – SteuerEule hilft dir beim Abgleich.',
    ],
  },
  {
    titel: 'Abgabe auf Papier',
    absaetze: [
      'SteuerEule übermittelt nichts elektronisch an das Finanzamt. Du druckst die ausgefüllten Formulare aus, prüfst sie, unterschreibst den Hauptvordruck und reichst alles bei deinem Finanzamt ein. Wer Gewinneinkünfte hat (z. B. aus Gewerbe oder Selbstständigkeit), muss elektronisch abgeben – diese Fälle unterstützt SteuerEule nicht.',
    ],
  },
]

export const SEITEN_TITEL: Record<RechtlicheSeite, string> = {
  impressum: 'Impressum',
  datenschutz: 'Datenschutzerklärung',
  agb: 'AGB & Widerruf',
  hinweise: 'Wichtige Hinweise',
}

export function inhalt(seite: RechtlicheSeite, betreiber: Betreiber | null): readonly Abschnitt[] {
  switch (seite) {
    case 'impressum':
      return impressum(betreiber)
    case 'datenschutz':
      return datenschutz(betreiber)
    case 'agb':
      return agb(betreiber)
    case 'hinweise':
      return HINWEISE
  }
}
