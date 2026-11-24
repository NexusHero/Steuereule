import { BANK_CODE_SOURCE, HOSTING, POSTAL_CODE_SOURCE, RETENTION, TAX_OFFICE_SOURCE, modelProviderList } from '@steuereule/core'
export type LegalPage = 'impressum' | 'datenschutz' | 'agb' | 'hinweise'

export const LEGAL_PAGES: readonly LegalPage[] = ['impressum', 'datenschutz', 'agb', 'hinweise']

export const STATUS = 'Stand: November 2026'

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
        paragraphs: ['Die Anbieterangaben sind noch nicht hinterlegt.'],
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

/** „1 Tag“, „30 Tage“. */
const days = (count: number) => (count === 1 ? '1 Tag' : `${count} Tage`)

export function privacy(operator: Operator | null): readonly Section[] {
  const responsible = operator
    ? `${operator.name}, ${operator.postalAddress.replaceAll('\n', ', ')}, E-Mail: ${operator.email}`
    : 'Die Angaben zum Verantwortlichen sind noch nicht hinterlegt (siehe Impressum).'
  return [
    { title: '1. Verantwortlicher', paragraphs: [responsible] },
    {
      title: '2. Welche Daten wir verarbeiten',
      paragraphs: [
        'Gastmodus: Du kannst ohne Konto starten. Ein technisch notwendiges Cookie („se_guest_session“) mit einer zufälligen, signierten Kennung hält deine Angaben zusammen. Alles, was du als Gast einträgst oder hochlädst (Antworten, Angaben in den Masken, Belege), speichern wir verschlüsselt auf unseren Servern zu dieser Kennung, nicht nur auf deinem Gerät.',
        'Konto: E-Mail-Adresse, Name, Passwort (nur als Hash gespeichert), optional Passkeys und Zwei-Faktor-Daten sowie Sitzungsdaten (Zeitpunkt, IP-Adresse, Browser und Gerätetyp) zur Absicherung deines Kontos.',
        'Steuerdaten: die Angaben, die du für deine Steuererklärung einträgst (z. B. Lohnsteuerbescheinigung, Renten, Kapitalerträge, Vermietung, Bescheide, Belege) sowie deine Steuer-ID und Steuernummer. Diese Werte speichern wir feldweise verschlüsselt (AES-256-GCM).',
        'Angaben über andere Personen: Für deine Erklärung trägst du auch Daten anderer Menschen ein: über deine Ehe- oder Lebenspartnerin bzw. deinen Ehe- oder Lebenspartner, auch wenn sie oder er kein eigenes Konto hat (z. B. Name, Geburtsdatum, Steuer-ID, Religionszugehörigkeit, Beruf, Einkünfte), über deine Kinder (z. B. Name, Geburtsdatum, Steuer-ID, Familienkasse, Betreuungskosten), über den anderen Elternteil eines Kindes (Name, Geburtsdatum, Anschrift) und über deinen Arbeitgeber (Name, Anschrift). Wir speichern sie wie deine eigenen Steuerdaten verschlüsselt in deinem Konto und verwenden sie nur für deine Erklärung. Bitte sag diesen Personen, dass du ihre Angaben in SteuerEule einträgst, und verweise sie auf diese Datenschutzerklärung.',
        'KI-Assistenten (optional): Verbindest du einen eigenen KI-Assistenten über unsere Schnittstelle (Model Context Protocol / OAuth 2.1), erteilst du diesem Zugriff auf ausgewählte Datenbereiche. Beim Auslesen sensibler Daten (Steuer-ID, IBAN, Name, Adresse, Telefon) werden diese automatisch pseudonymisiert bzw. maskiert, bevor sie an den Assistenten übertragen werden.',
        'Eule (Chat in der App): Was du der Eule schreibst, die Steuerdaten, die sie für ihre Antwort braucht, und der Text von Belegen, die du ihr gibst, gehen an ein Sprachmodell. Deine Frage geht außerdem an ein kleines Sprachmodell, das prüft, ob sie ein Steuerthema betrifft. Ohne deine Einwilligung entfernen wir vorher Namen, Steuer-ID, Geburtsdaten, Anschriften, IBAN, E-Mail-Adressen, Telefonnummern und ähnliche Kennungen. Willigst du ein („Eule und persönliche Daten“), übermitteln wir auch diese Angaben, damit die Eule sie für dich eintragen kann – einschließlich deiner Religionszugehörigkeit als besonderer Kategorie nach Art. 9 DSGVO. Die Einwilligung gilt für jeden unter 4. genannten Modellanbieter, denn welcher die Antwort erzeugt, hängt von der Einstellung, deiner Modellwahl im Chat und von Ausfällen ab. Deine Gespräche speichern wir verschlüsselt in deinem Konto.',
        'Turbo-Modus der Eule: Schaltest du im Chat den Turbo-Modus ein, übernimmt die Eule ihre Änderungen selbst in deine Angaben und beschreibt sie; jede lässt sich an ihrer Karte rückgängig machen. Ohne Turbo-Modus übernimmst du jede Änderung selbst.',
        'Auslesen von Dokumenten: Lohnsteuerbescheinigungen, Schweizer Lohnausweise und andere Schreiben, Steuerbescheide und Belege im Beleg-Posteingang liest dein Browser per Texterkennung; ein PDF mit Textebene wird direkt gelesen. Den erkannten Text werten wir zuerst nach festen Regeln aus. Bleiben Werte offen, geht ein Ausschnitt des Textes, auch außerhalb des Chats, an ein Sprachmodell, das die Werte zuordnet (bei der Lohnsteuerbescheinigung nur die Zeilen 3, 4 und 23 bis 27). Vorher entfernen wir die Namen deines Haushalts und Kennungen wie Steuer-ID und IBAN; bleibt eine Kennung erkennbar, geht der Text nicht hinaus. Das Bild oder die Datei selbst geht an kein Sprachmodell.',
        'Zugriffsprotokoll: Lese- und Schreibzugriffe auf deine Steuerdaten protokollieren wir (wer, was, wann – ohne die Werte selbst), auch die verbundener KI-Assistenten. Du siehst dieses Protokoll in deinem Datenexport.',
        'Selbstständige (Buchhaltung in der App): Führst du im Bereich „Selbstständig“ ein Buch, speichern wir deine Buchungen, Belege und E-Rechnungen (auch als XML-Datei), importierte Kontoumsätze, Anlagen, Abschlüsse, Umsatzsteuer- und Gewerbesteuerangaben sowie Lohnläufe. Darin stehen auch Daten Dritter: Namen und IBAN deiner Geschäftspartner aus den Kontoumsätzen, Anschriften und Umsatzsteuer-Identifikationsnummern deiner Kunden und Lieferanten auf Belegen und die Lohndaten deiner Beschäftigten, einschließlich ihrer Kirchensteuer (Religionszugehörigkeit, Art. 9 DSGVO). Auch diese Werte speichern wir feldweise verschlüsselt; Buchungen und ihr Protokoll lassen sich nach GoBD nicht nachträglich ändern.',
        'Zahlungen: Für die Freischaltung des Formular-Ausdrucks bzw. der Funktionen für Selbstständige (Ausfüllhilfe, Exporte) speichern wir Steuerjahr, Stufe, Betrag, Zahlungsstatus und die Kennung des Zahlungsvorgangs. Zahlungsdaten (Karte, Konto) erhält ausschließlich unser Zahlungsdienstleister.',
        'Server-Protokolle: Beim Aufruf der App und der Schnittstelle schreibt unsere Hosting-Plattform technische Protokolle (Zeitpunkt, aufgerufene Adresse, IP-Adresse, Browser). Unerwartete Fehler melden wir mit Fehlerart, Programmstelle, Anfragekennung und der Route ohne konkrete Adresse, ohne Inhalte, Cookies oder Zugangsdaten.',
      ],
    },
    {
      title: '3. Zwecke und Rechtsgrundlagen',
      paragraphs: [
        'Bereitstellung der App und Vorbereitung deiner Steuererklärung: Art. 6 Abs. 1 lit. b DSGVO (Vertrag).',
        'Angaben über andere Personen in deiner Erklärung (Partnerin oder Partner, Kinder, anderer Elternteil, Arbeitgeber): Art. 6 Abs. 1 lit. b DSGVO (für deinen Vertrag mit uns erforderlich) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse dieser Personen und von dir an einer vollständigen, gemeinsamen bzw. richtigen Erklärung).',
        'Nutzung externer KI-Assistenten auf deine Veranlassung: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) bzw. Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).',
        'Antworten der Eule und Auslesen von Dokumenten ohne persönliche Kennungen: Art. 6 Abs. 1 lit. b DSGVO (Vertrag). Übermittlung persönlicher Daten an die Sprachmodelle: Art. 6 Abs. 1 lit. a DSGVO, für die Religionszugehörigkeit Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung). Du kannst die Einwilligung jederzeit mit Wirkung für die Zukunft unter „Profil → Datenschutz → Eule und persönliche Daten“ widerrufen; danach entfernen wir diese Angaben wieder, bevor etwas an ein Sprachmodell geht.',
        'Absicherung deines Kontos und des Dienstes (Sitzungen, Anmeldeschutz, Prüfung auf bekannte geleakte Passwörter, Server-Protokolle, Fehlerberichte): Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren, funktionierenden Dienst).',
        'Rechnungen und Aufbewahrung von Geschäftsunterlagen: Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO und § 257 HGB. Aufbewahrung eingereichter Fassungen als Nachweis bis zum Ablauf der Festsetzungsfrist: Art. 6 Abs. 1 lit. f DSGVO.',
        'Daten Dritter in deiner Buchhaltung: Für die Daten deiner Geschäftspartner, Kunden und Beschäftigten bist du als Selbstständiger selbst verantwortlich (Art. 4 Nr. 7 DSGVO); wir verarbeiten sie nur in deinem Auftrag und nach deiner Weisung als Auftragsverarbeiter (Art. 28 DSGVO). Die Vereinbarung dazu steht in den AGB (§ 7). Die Kirchensteuer deiner Beschäftigten verarbeitest du für die Lohnsteuer (Art. 9 Abs. 2 lit. b DSGVO).',
        'Es gibt kein Tracking, keine Analyse- oder Werbe-Cookies und keine Weitergabe zu Werbezwecken.',
      ],
    },
    {
      title: '4. Empfänger',
      paragraphs: [
        `Hosting: Unsere Server, die Datenbank, der Zwischenspeicher und die Protokolle betreibt ${HOSTING.provider} (Google) als Auftragsverarbeiter in der Region ${HOSTING.region} (${HOSTING.country}).`,
        `Server-Protokolle und Fehlerberichte: Sie landen in Google Cloud Logging und Google Cloud Error Reporting, ebenfalls bei ${HOSTING.provider} als Auftragsverarbeiter.`,
        'E-Mail-Versand: Bestätigungs- und Passwort-Links versenden wir über Brevo (Sendinblue SAS, Frankreich) als Auftragsverarbeiter.',
        'Zahlungen: Stripe Payments Europe Ltd. (Irland) wickelt Zahlungen ab und ist dafür eigenständig verantwortlich.',
        'Anmeldung mit Google (nur wenn du sie wählst): Google Ireland Ltd. erhält die für die Anmeldung nötigen Daten.',
        `Sprachmodelle (Eule, Themenprüfung, Auslesen von Dokumenten): Die Modelle stellen ${modelProviderList()} bereit. Welcher Anbieter eine Aufgabe übernimmt, hängt von der Einstellung des Betreibers, deiner Modellwahl im Chat und von Ausfällen ab; jeder von ihnen kann die oben unter „Eule“ und „Auslesen von Dokumenten“ genannten Daten erhalten. Sie sind dafür unsere Auftragsverarbeiter. Die Verarbeitung kann in den USA stattfinden; die Übermittlung erfolgt auf Grundlage des EU-US Data Privacy Framework bzw. der Standardvertragsklauseln.`,
        'Eigener KI-Assistent (nur wenn du ihn verbindest): Verknüpfst du einen externen Assistenten (z. B. Anthropic Claude, OpenAI), werden Daten auf deine Weisung an den jeweiligen Anbieter übertragen. Bei Anbietern in Drittländern (z. B. USA) erfolgt die Übermittlung auf Grundlage deiner ausdrücklichen Einwilligung (Art. 49 Abs. 1 lit. a DSGVO) bzw. von Angemessenheitsbeschlüssen. Du kannst die Verknüpfung jederzeit mit sofortiger Wirkung unter „Profil → Verbundene Assistenten“ widerrufen.',
        'Sprachmodell für das Diktieren (nur wenn du zustimmst): Für das Diktieren im Chat lädt die App einmalig ein Sprachmodell von Hugging Face, Inc. (USA) bzw. dessen Download-Servern (hf.co). Dabei erhält Hugging Face deine IP-Adresse und den Zeitpunkt des Abrufs, sonst nichts: Dein Ton und der erkannte Text bleiben auf deinem Gerät. Die Übermittlung in die USA erfolgt auf Grundlage deiner ausdrücklichen Einwilligung (Art. 6 Abs. 1 lit. a und Art. 49 Abs. 1 lit. a DSGVO), die du im Dialog vor dem Download gibst. Das Modell bleibt im Speicher deines Browsers, enthält keine Daten von dir und lässt sich unter „Profil → Sprachmodell löschen“ entfernen.',
        'Texterkennung: Die Programme und Sprachdaten für die Texterkennung in deinem Browser liefert unser eigener Server aus; dafür wird kein anderer Anbieter angefragt.',
        'Passwortprüfung: Bei der Registrierung prüfen wir dein Passwort gegen die Datenbank „Have I Been Pwned“. Dabei verlassen nur die ersten fünf Zeichen eines Hash-Werts unseren Server, nie dein Passwort.',
        'Deine Einkommensteuererklärung übermitteln wir nicht an das Finanzamt. Du druckst die Formulare aus und reichst sie selbst ein; die Ausfüllhilfe für Selbstständige tippst du selbst in Mein ELSTER ab.',
        'E-Bilanz (nur Selbstständige mit Bilanz, nur wenn du sie ausdrücklich absendest und der Betreiber die Übermittlung eingerichtet hat): Die Bilanz und Gewinn- und Verlustrechnung samt deiner Steuernummer und deinem Namen gehen über die ELSTER-Schnittstelle an die Finanzverwaltung (§ 5b EStG, Art. 6 Abs. 1 lit. c DSGVO). Wir behalten das Übertragungsprotokoll in deinem Buch.',
      ],
    },
    {
      title: '5. Speicherdauer',
      paragraphs: [
        'Konto: Deine Daten speichern wir, solange du dein Konto nutzt. Löschst du dein Konto, entfernen wir Konto, Profil und Steuerdaten sofort aus der Datenbank, ausgenommen die gesperrten Daten unten.',
        `Gastmodus: Änderst du als Gast ${days(RETENTION.guestDataDays)} lang nichts, löschen wir alle Daten zu deiner Gast-Kennung. Das Gast-Cookie läuft nach ${days(RETENTION.guestCookieDays)} ab. Legst du ein Konto an, übernehmen wir deine Angaben in das Konto.`,
        `Anmeldungen: Eine Sitzung endet ${days(RETENTION.sessionIdleDays)} nach ihrer letzten Nutzung, spätestens ${days(RETENTION.sessionAbsoluteDays)} nach der Anmeldung. Den Eintrag der Sitzung mit IP-Adresse und Gerätetyp löschen wir, wenn du dich abmeldest, die Sitzung in deiner Geräteliste beendest oder dein Konto löschst; eine abgelaufene Sitzung gewährt keinen Zugang mehr.`,
        `Sicherungen: Die Datenbank sichern wir täglich und bewahren die letzten ${RETENTION.databaseBackups} Sicherungen sowie eine Wiederherstellung auf jeden Zeitpunkt der letzten ${days(RETENTION.databasePitrDays)} auf. Gelöschte Daten verschwinden aus den Sicherungen deshalb spätestens nach dieser Zeit. Die Schlüssel zu deinen Belegdateien liegen in einer eigenen Datenbank mit ${RETENTION.keystoreBackups} Sicherungen und ${days(RETENTION.keystorePitrDays)} Wiederherstellungszeitraum; sind sie gelöscht, lassen sich auch gesicherte Belegdateien nicht mehr lesen.`,
        'Zugriffsprotokoll: Löschst du dein Konto, entfernen wir deine Kennung aus dem Zugriffsprotokoll. Die anonymisierten Einträge bewahren wir ohne feste Frist als Nachweis auf; sie lassen sich niemandem mehr zuordnen.',
        `Gesetzliche Aufbewahrung: Daten über Zahlungen (Steuerjahr, Stufe, Betrag, Status, Kennung des Zahlungsvorgangs) sperren wir bei einer Kontolöschung und bewahren sie ${RETENTION.legalHoldPaymentYears} Jahre ab Ende des Zahlungsjahres auf (§ 147 AO, § 257 HGB). Eingereichte Fassungen deiner Erklärung sperren wir bis zum Ablauf der regulären Festsetzungsfrist, ${RETENTION.legalHoldFilingVersionYears} Jahre ab Ende des Jahres der Einreichung (§ 169, § 170 AO). Gesperrte Daten nutzen wir für nichts anderes und löschen sie, wenn die Frist endet.`,
        'Server-Protokolle und Fehlerberichte bewahrt Google Cloud Logging nach seiner Standardeinstellung 30 Tage auf.',
        'Selbstständige: Bücher, Belege und Buchungsprotokolle musst du selbst zehn Jahre aufbewahren (§ 147 AO, GoBD). Löschst du dein Konto, löschen wir auch dein Buch. Lade dir vorher den GoBD-Export und die Verfahrensdokumentation herunter; danach können wir sie nicht wiederherstellen.',
      ],
    },
    {
      title: '6. Deine Rechte',
      paragraphs: [
        'Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Mit Konto kannst du Export und Löschung jederzeit selbst unter „Profil → Datenschutz“ auslösen. Als Gast gibt es dort keinen Export und keine Löschung; schreib uns dafür (Kontakt siehe Impressum) oder leg ein Konto an.',
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
        'SteuerEule übermittelt keine Daten an das Finanzamt. Du prüfst die Ausdrucke, unterschreibst sie und reichst sie selbst ein. Für die Richtigkeit und Vollständigkeit deiner Angaben bist du verantwortlich. Einzige Ausnahme: Die E-Bilanz eines bilanzierenden Selbstständigen sendet SteuerEule auf deinen ausdrücklichen Auftrag über ELSTER, sofern der Betreiber das eingerichtet hat.',
        'Für Selbstständige führt SteuerEule ein Buch nach GoBD (EÜR oder Bilanz) und berechnet Umsatz-, Gewerbe- und Lohnsteuerwerte als Ausfüllhilfe. Meldungen zur Sozialversicherung erstellt SteuerEule nicht.',
        'SteuerEule ist keine Steuerberatung und keine Hilfeleistung in Steuersachen im Sinne des Steuerberatungsgesetzes. Schätzungen und Hinweise in der App sind unverbindlich.',
        'Anbindung eigener KI-Assistenten: Du kannst eigene KI-Assistenten über das Model Context Protocol (MCP) anbinden. Der Assistent agiert als dein persönliches Werkzeug. Werte, die ein Assistent einträgt, gelten als unbestätigt und sperren die Formularerstellung bis zu deiner Bestätigung je Anlage. Bestehende, von dir erfasste Werte werden niemals überschrieben, sondern als Vorschlag abgelegt („Der Nutzer gewinnt“). Du bist verpflichtet, alle durch einen Assistenten generierten oder vorgeschlagenen Werte vor dem Ausdruck eigenständig zu prüfen und zu bestätigen.',
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
        'Das Erfassen und Prüfen ist kostenlos. Kostenpflichtig ist die Freischaltung des Formular-Ausdrucks für ein Steuerjahr und, für Selbstständige, die Freischaltung von Ausfüllhilfe und Exporten; der Preis wird vor der Zahlung angezeigt und enthält die gesetzliche Umsatzsteuer.',
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
        'Wir übernehmen keine Haftung für die Richtigkeit, Plausibilität oder Vollständigkeit von Angaben, die durch von dir angebundene externe KI-Assistenten vorgeschlagen, berechnet oder eingetragen wurden. Die steuerliche Verantwortung verbleibt stets bei dir als Steuerpflichtigem.',
      ],
    },
    {
      title: '§ 7 Datenschutz',
      paragraphs: [
        'Wie wir mit deinen Daten umgehen, steht in der Datenschutzerklärung.',
        'Auftragsverarbeitung (Art. 28 DSGVO): Speicherst du als Selbstständiger Daten Dritter (Geschäftspartner, Kunden, Beschäftigte), verarbeiten wir sie nur auf deine dokumentierte Weisung und nur, um dir die Buchhaltung bereitzustellen. Unsere Beschäftigten sind zur Vertraulichkeit verpflichtet. Wir schützen die Daten durch Verschlüsselung und Zugriffsprotokolle (Art. 32 DSGVO), setzen nur die in der Datenschutzerklärung genannten Unterauftragsverarbeiter ein und informieren dich vor einem Wechsel. Wir unterstützen dich bei Anfragen Betroffener und bei Datenpannen, löschen die Daten mit deinem Konto und weisen dir die Einhaltung auf Anfrage nach.',
      ],
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
      'SteuerEule übermittelt deine Einkommensteuererklärung nicht an das Finanzamt. Du druckst die ausgefüllten Formulare aus, prüfst sie, unterschreibst den Hauptvordruck und reichst alles bei deinem Finanzamt ein.',
      'Wer Gewinneinkünfte hat (z. B. aus Gewerbe oder Selbstständigkeit), muss elektronisch abgeben. Dafür gibt SteuerEule dir im Bereich „Selbstständig“ die Werte Zeile für Zeile zum Abtippen in Mein ELSTER.',
    ],
  },
  {
    title: 'Datenquellen',
    paragraphs: [
      `Postleitzahlen, Orte und Bundesländer: © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL) 1.0 (opendatacommons.org/licenses/odbl/1-0/). Auszug des Projekts OpenPLZ API, Stand ${POSTAL_CODE_SOURCE.retrieved}.`,
      'Die Zuordnung läuft auf deinem Gerät. Deine Postleitzahl wird dafür nirgendwohin geschickt.',
      'Adresssuche: Die Straßennamen stammen aus derselben Quelle. Was du in das Suchfeld tippst, geht an den Server von SteuerEule, wird dort nur für die Antwort verwendet und nicht gespeichert. Kein anderer Anbieter erhält deine Eingabe.',
      `Finanzamt-Vorschlag zur Postleitzahl: Finanzamtsverzeichnis „GemFA“ des Bundeszentralamts für Steuern, Stand ${TAX_OFFICE_SOURCE.stand}. Auch diese Zuordnung läuft auf deinem Gerät.`,
      `Banknamen zur IBAN: Bankleitzahlendatei der Deutschen Bundesbank, gültig ${BANK_CODE_SOURCE.valid}. Auch diese Zuordnung läuft auf deinem Gerät.`,
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
