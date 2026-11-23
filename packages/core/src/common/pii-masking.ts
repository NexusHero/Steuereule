/**
 * Masking of personally identifiable information (PII) for AI assistant access.
 * Traces to: ADR-0052 §8 (Personenbezogene Daten: schreiben ja, lesen maskiert).
 */

export function maskTaxId(taxId: string | null | undefined): string | null {
  if (!taxId) return null
  const clean = taxId.replace(/\s+/g, '')
  if (clean.length <= 2) return '*'.repeat(clean.length)
  if (clean.length < 6) return `${clean[0]}${'*'.repeat(clean.length - 2)}${clean[clean.length - 1]}`
  const prefix = clean.slice(0, 2)
  const suffix = clean.slice(-2)
  const maskedLength = clean.length - 4
  return `${prefix}${'*'.repeat(maskedLength)}${suffix}`
}

export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null
  const clean = iban.replace(/\s+/g, '').toUpperCase()
  if (clean.length <= 4) return '*'.repeat(clean.length)
  const country = clean.slice(0, 2)
  const suffix = clean.slice(-2)
  const maskedTotal = clean.length - 4

  // Group into standard 4-char chunks
  const fullMasked = `${country}${'*'.repeat(maskedTotal)}${suffix}`
  const chunks: string[] = []
  for (let i = 0; i < fullMasked.length; i += 4) {
    chunks.push(fullMasked.slice(i, i + 4))
  }
  return chunks.join(' ')
}

export function maskStreet(street: string | null | undefined): string | null {
  if (!street) return null
  const trimmed = street.trim()
  if (trimmed.length === 0) return null
  return `${trimmed[0]}***`
}

export function maskHouseNumber(houseNumber: string | null | undefined): string | null {
  if (!houseNumber) return null
  return '***'
}

export function maskName(name: string | null | undefined): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/)
  return parts
    .map((part) => (part.length > 0 ? `${part[0]}***` : ''))
    .filter(Boolean)
    .join(' ')
}

const LEGAL_FORM_REGEX = /\b(AG|GmbH|UG|KG|OHG|SE|e\.V\.|Corp|Inc|LLC|Ltd)\b/i

export function maskEmployer(employer: string | null | undefined): string | null {
  if (!employer) return null
  const trimmed = employer.trim()
  if (trimmed.length === 0) return null

  const match = trimmed.match(LEGAL_FORM_REGEX)
  if (match && match.index !== undefined) {
    const legalForm = match[0]
    return `${trimmed[0]}*** ${legalForm}`
  }
  return `${trimmed[0]}***`
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) {
    const parts = trimmed.split(/\s+/)
    return `${parts[0]} ***`
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length > 1) {
    return `${parts[0]} ***`
  }
  return `${trimmed.slice(0, 4)} ***`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const IBAN_TEXT_REGEX = /\b[A-Z]{2}\d{2}(?:[\s.-]?[A-Z0-9]{4}){3,7}(?:[\s.-]?[A-Z0-9]{1,4})?\b/gi
const STEUER_ID_TEXT_REGEX =
  /\b\d{2}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}\b|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}\b|\b\d{11}\b/g
const STEUERNR_TEXT_REGEX = /\b\d{2,5}\/\d{3,4}\/\d{4,5}\b/g
// Bounded to the RFC 5321 maxima (local part 64, domain 253): unbounded runs were tried from every word
// boundary to the end of the text, quadratic in its length (pentest 2026-11-23, ADR-0106 D1).
const EMAIL_TEXT_REGEX = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}\b/g
const PHONE_TEXT_REGEX = /(?:\+(?:49|41|43)[\s/-]?\d{2,4}|0\d{2,4})[\s/-]?\d{3,4}(?:[\s/-]?\d{2,5})?\b/g

/**
 * Scrubs free-text user chat messages before sending them to an external LLM.
 * Replaces known profile names, 11-digit tax IDs, tax numbers, IBANs, emails, phone numbers,
 * and — added after the live pentest of 2026-11-23 (ADR-0107 H2) — street addresses, birthdates,
 * inline employer names and honorific-prefixed third-party names, so a typed chat message leaks no
 * more PII to the provider than an uploaded document does. Every added pattern uses bounded
 * quantifiers and unambiguous separators, so this stays linear and fast in the message length
 * (ADR-0106 D1; timed by text-readers-linear-time.test.ts).
 */
export function scrubUserMessagePii(
  text: string,
  knownNames: readonly string[] = [],
): string {
  if (!text) return ''

  let scrubbed = text

  // 1. Replace structured PII patterns first (so emails like markus.brenner@firma.ch are
  // scrubbed as a complete [KONTAKT-GESCHÜTZT] unit rather than split by name replacement).
  scrubbed = scrubbed.replace(IBAN_TEXT_REGEX, '[IBAN-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STEUER_ID_TEXT_REGEX, '[STEUER-ID-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STEUERNR_TEXT_REGEX, '[STEUERNR-GESCHÜTZT]')
  scrubbed = scrubbed.replace(EMAIL_TEXT_REGEX, '[KONTAKT-GESCHÜTZT]')
  scrubbed = scrubbed.replace(PHONE_TEXT_REGEX, '[KONTAKT-GESCHÜTZT]')

  // 2. Free-text PII the system prompt promises to protect ("Geburtsdaten, Adressen") but the
  // document-only patterns used to miss on the chat path (pentest 2026-11-23, ADR-0107 H2).
  scrubbed = scrubbed.replace(ADDRESS_WITH_POSTCODE_REGEX, '[ADRESSE-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STREET_AND_NUMBER_REGEX, '[ADRESSE-GESCHÜTZT]')
  scrubbed = scrubbed.replace(DOB_VALUE_REGEX, '[GEBURTSDATUM-GESCHÜTZT]')
  scrubbed = scrubbed.replace(DOB_BEFORE_KEYWORD_REGEX, '[GEBURTSDATUM-GESCHÜTZT]')
  scrubbed = scrubbed.replace(BIRTH_YEAR_REGEX, '$1[GEBURTSDATUM-GESCHÜTZT]')
  scrubbed = scrubbed.replace(BIRTH_YEAR_BEFORE_KEYWORD_REGEX, '[GEBURTSDATUM-GESCHÜTZT]')
  scrubbed = scrubbed.replace(EMPLOYER_INLINE_REGEX, '[ARBEITGEBER-GESCHÜTZT]')
  scrubbed = scrubbed.replace(EMPLOYER_CONTEXT_REGEX, '$1[ARBEITGEBER-GESCHÜTZT]')

  // 3. Replace known names from the user's tax profile (first/last names, partner, children).
  scrubbed = replaceNamesWith(scrubbed, knownNames, '[MANDANT]')

  // 4. Only AFTER the known-name pass: third-party names still in the clear — by honorific or by
  // relationship word — are people a profile-derived list can never hold (landlord, doctor). Running
  // this last keeps "Herr <known name>" as "Herr [MANDANT]". The honorific and the relationship word
  // stay ($1): "meine Frau [NAME-GESCHÜTZT]" still tells the model whose income the question is about.
  scrubbed = scrubbed.replace(RELATED_PERSON_NAME_REGEX, '$1[NAME-GESCHÜTZT]')
  return scrubbed.replace(HONORIFIC_NAME_REGEX, '$1[NAME-GESCHÜTZT]')
}

/**
 * Replaces every part of the given names (first and last name, each part of a double name) with
 * a stand-in, as a whole word: „Gülay“ and „Ümit“ alike, never inside a longer word. The German
 * genitive counts as the name („Gülays Konto“): in the real-case test it carried the name to the model.
 */
export function replaceNamesWith(text: string, names: readonly string[], replacement: string): string {
  let replaced = text
  for (const rawName of names) {
    if (!rawName) continue
    const parts = rawName
      .trim()
      .split(/[\s-]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
    for (const part of parts) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(part)}(?:s|['’]s)?(?![\\p{L}\\p{N}_])`, 'giu')
      replaced = replaced.replace(pattern, replacement)
    }
  }
  return replaced
}

const ETIN_TEXT_REGEX = /\beTIN\s*[:-]?\s*[A-Z0-9\s-]{8,20}|\b[A-Z]{6}[0-9]{2}[A-Z0-9]{6}\b/gi
const TRANSFERTICKET_REGEX = /\bTransferticket\s*(?:[:-]\s*)?[A-Za-z0-9_-]{6,}/gi
const SVNR_TEXT_REGEX = /\b\d{2}[\s.-]?\d{6}[\s.-]?[A-Z][\s.-]?\d{3}\b/g
// The label is followed by a blank, or by „:“/„-“ and a blank: the same lines as „\s*[:-]?\s+“, without the
// overlapping quantifiers that let a long run of blanks backtrack. The indent before the label stays on its
// line: „^\s*“ ran from every line start over all blank lines below it (Sonar S8786).
const LABELED_PII_LINE_REGEX =
  /^[^\S\r\n]*(?:Arbeitgeber(?:\s*\([^)]*\))?|Arbeitnehmer(?:in)?|Name(?:,?\s*Vorname)?|Vorname|Nachname|Familienname|Anschrift|Adresse|Straße|Strasse|Geburtsdatum|geb\.?\s*am|Identifikationsnummer|IdNr|Steuer-?ID|Steueridentifikationsnummer|Steuernummer|Transferticket|Personal-?Nr\.?|Mandanten-?Nr\.?|Arbeitnehmernummer|Sozialversicherungsnummer|Versicherungsnummer|Finanzamt|AGS|Bundesland|Steuerklasse(?:\s*(?:\/\s*)?Faktor)?|Zahl\s+der\s+Kinderfreibeträge|Kirchensteuermerkmal)(?:\s|[:-]\s).*$/gim
// German capitalises every noun, so "a capitalised word behind a trigger" is not yet a name: "meine Frau
// Kinderbetreuungskosten", "Partnerin ist Beamtin", "Arbeitgeber Fahrtkostenzuschuss" and "Stellplatz 50 Euro"
// were all masked, and the model never saw the question (review of ADR-0107 H2). A candidate is therefore
// refused when it reads as a common noun: a word from the tax vocabulary, a word with a noun ending, or a
// compound longer than a name gets. Word ends are tested with LETTER_END, not `\b`: `\b` treats ä/ö/ü/ß as
// a boundary and would cut "Kostenübernahme" after "Kosten".
const LETTER_END = '(?![\\p{L}\\p{N}])'
const COMMON_NOUN_WORDS = [
  'Beamt(?:er|in|e|en)', 'Rentner(?:in)?', 'Pensionär(?:in)?', 'Student(?:in)?', 'Schüler(?:in)?', 'Azubi',
  'Angestellte[rn]?', 'Arbeitnehmer(?:in)?', 'Freiberufler(?:in)?', 'Grenzgänger(?:in)?', 'Selbst?ständige?[rn]?',
  'Minijobber(?:in)?', 'Hausfrau', 'Hausmann', 'Arbeitslos(?:e|er|en)?', 'Kita', 'Kind(?:er|ern|es)?', 'Eltern',
  'Elternzeit', 'Teilzeit', 'Vollzeit', 'Kurzarbeit', 'Homeoffice', 'Brutto', 'Netto', 'Anteil(?:e)?', 'Miete',
  'Zuschuss', 'Zuschüsse', 'Bonus', 'Prämie', 'Abfindung', 'Gehalt', 'Lohn', 'Rente', 'Pension', 'Kosten',
  'Dr', 'Prof', 'Aktien', 'Fonds', 'Zinsen', 'Dividende(?:n)?', 'Urlaub', 'Jobticket', 'Dienstrad', 'Laptop', 'Handy',
].join('|')
const COMMON_NOUN_PREFIXES =
  'Steuer|Arbeits|Fahrt|Kinder(?!mann)|Kranken|Renten|Lohn|Sozial|Pflege|Werbungs|Sonder|Kapital|Einkommen|Umsatz|Gewerbe|Miet|Unterhalts|Spenden|Pendler|Entfernungs|Dienst|Eltern|Betreuungs|Haushalts|Handwerker|Neben|Betriebs|Vorsorge|Kirchen|Wohn|Immobilien|Versicherungs|Fortbildungs|Weiterbildungs|Umzugs|Reise'
const COMMON_NOUN_SUFFIXES =
  'ung|ungen|kosten|geld|gelder|steuer|steuern|klasse|pauschale|betrag|beträge|zuschuss|zuschüsse|schaft|tion|tionen|heit|keit|beitrag|beiträge|office|wagen|ticket|rente|gehalt|zulage|bescheid|vertrag|miete|zinsen|kredit|darlehen|konto|nachweis|zimmer|anteil|anteile|prämie|regelung|erklärung'
const NOT_A_COMMON_NOUN =
  `(?!(?:${COMMON_NOUN_WORDS})${LETTER_END})` +
  `(?!(?:${COMMON_NOUN_PREFIXES})[a-zäöüß]{3,40}${LETTER_END})` +
  `(?![A-ZÄÖÜ][a-zäöüß]{2,28}(?:${COMMON_NOUN_SUFFIXES})${LETTER_END})` +
  '(?![A-ZÄÖÜ][a-zäöüß]{14})'
/** One capitalised word that can be a person's name. */
const NAME_WORD = `${NOT_A_COMMON_NOUN}[A-ZÄÖÜ][a-zäöüß]{1,30}`

// Street + house number. Two guards against over-masking (review of ADR-0107 H2): a number followed by a
// unit is a quantity, not a house number ("Radweg 5 km", "Stellplatz 50 Euro", "Heimarbeitsplatz 5 Tage"),
// and the everyday nouns that merely end like a street ("Arbeitsplatz", "Arbeitsweg", "Käufer") are no streets.
const STREET_LOOKALIKES =
  'arbeitsplatz|stellplatz|parkplatz|kitaplatz|krippenplatz|hortplatz|studienplatz|ausbildungsplatz|heimplatz|pflegeplatz|sitzplatz|arbeitsweg|fahrtweg|fahrweg|schulweg|hinweg|rückweg|heimweg|umweg|käufer|ehering'
const QUANTITY_UNITS =
  'km|m|meter|kilometer|min|minuten|euro|eur|€|cent|tage?n?|stunden?|std|prozent|%|jahre?n?|monate?n?|wochen?|mal|x|qm|m²|quadratmeter|personen|kinder|kindern|uhr'
const STREET_AND_NUMBER_REGEX = new RegExp(
  `\\b(?![a-zäöüß-]{0,40}(?:${STREET_LOOKALIKES})\\s)[A-ZÄÖÜ][a-zäöüß-]{2,60}(?:straße|strasse|str\\.|weg|allee|platz|ring|gasse|damm|ufer)\\s+\\d{1,4}[a-zA-Z]?\\b(?!\\s*(?:${QUANTITY_UNITS})(?![\\p{L}\\p{N}]))`,
  'giu',
)
// A postal address whose street has no street ending ("Am Hang 7, 10115 Berlin"): one to three capitalised
// words, a house number, then postcode and town. The postcode and town are required, so a plain number
// behind a noun is left alone. Every part is bounded (ADR-0106 D1).
const ADDRESS_WITH_POSTCODE_REGEX =
  /(?<![\p{L}\p{N}])(?:[A-ZÄÖÜ][\p{L}.-]{1,40}\s){1,3}\d{1,4}[a-zA-Z]?,?\s\d{5}\s[A-ZÄÖÜ][\p{L}-]{1,40}/gu
// Birthdate: a birth keyword plus a date in any common German shape — dotted/slashed numeric
// (12.03.1980, 12/03/1980) or a spelled-out month (12. März 1980). The keyword stays required so plain
// dates (deadlines, periods) are not masked. Bounded alternation → linear (ADR-0107 H2 review).
const DOB_DATE = '(?:\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}|\\d{1,2}\\.\\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+\\d{2,4})'
const DOB_VALUE_REGEX = new RegExp(
  `\\b(?:geboren\\s*(?:am\\s*)?|geb\\.?\\s*(?:am\\s*)?|Geburtsdatum\\s*)(?:[:-]\\s*)?${DOB_DATE}\\b`,
  'gi',
)
// The reversed word order — "… am 12.03.1980 geboren". Lookahead on the keyword so only the date is replaced.
const DOB_BEFORE_KEYWORD_REGEX = new RegExp(`\\b${DOB_DATE}(?=\\s+geboren\\b)`, 'gi')
// A birth year alone, by keyword ("Geboren 1980", "Jahrgang 1975", "bin 1980 geboren"). The keyword is kept.
const BIRTH_YEAR_REGEX = /\b((?:geboren|geb\.?|Jahrgang|Geburtsjahr)[:\s]\s{0,3}(?:(?:im\s+Jahre?|in|am)\s+)?)(?:19|20)\d{2}\b/gi
const BIRTH_YEAR_BEFORE_KEYWORD_REGEX = /\b(?:19|20)\d{2}(?=\s+geboren\b)/gi
// Inline employer: a capitalised company token (up to four words) followed by a German legal form.
// Case-sensitive on the legal form so prose words like "gegen" cannot match. The leading negative lookahead
// keeps out what is no company name: a determiner ("Eine KG gründen"), a legal form or "Co." itself
// ("Kommanditist einer GmbH & Co. KG") and the generic kinds of company ("Holding GmbH") — all questions
// about a legal form, not an employer.
// Words are separated by blanks only; a hyphen belongs to the word ("Müller-Meier GmbH"), and one hyphen may
// tie the legal form on ("Siemens-AG"). With `[\s-]+` between the words, the hyphen was both a word character
// and a separator: "A-A-A-…" could be split in 41⁴ ways from every start, 1 ms per character, 8 s for one
// message of the maximum length (review of ADR-0107 H2, ADR-0106 D1).
const NOT_A_COMPANY_NAME =
  "(?!(?:Eine?|Der|Die|Das|Dem|Den|Meine?|Keine?|Deine?|Seine?|Ihre|Unsere|Diese|Jede|Welche|Solche|Als|Co\\.?|AG|GmbH|mbH|gGmbH|UG|OHG|KGaA|KG|SE|Holding|Familien|Immobilien|Ein-Mann|Einmann|Komplementär|Vorrats|Tochter|Mutter|Beteiligungs|Vermögensverwaltende|Gemeinnützige)[\\s-])"
const EMPLOYER_INLINE_REGEX = new RegExp(
  `\\b${NOT_A_COMPANY_NAME}[A-ZÄÖÜ][\\p{L}0-9.&'-]{0,40}(?:\\s{1,3}[A-ZÄÖÜ0-9][\\p{L}0-9.&'-]{0,40}){0,3}(?:\\s{1,3}|-)(?:AG|GmbH|mbH|gGmbH|UG|OHG|KGaA|KG|SE)\\b`,
  'gu',
)
// Employer named by context word, no legal form ("arbeite bei Siemens", "Arbeitgeber ist die Deutsche Bahn",
// "Firma Müller") — the bare-brand leak the H2 review flagged. The trigger is captured ($1) and kept; only
// the company name is masked. Plain "bei <Noun>" is deliberately NOT a trigger (German capitalises every
// noun, so it would clobber "bei Bedarf"); the trigger must name employment. The verb may open the sentence
// ("Arbeite bei Siemens"). What follows the trigger must not read as a common noun: "Arbeitgeber
// Fahrtkostenzuschuss" and "Firma Dienstwagen" name a benefit, not a company.
const EMPLOYER_CONTEXT_REGEX = new RegExp(
  `\\b((?:(?:[Aa]rbeite|[Aa]ngestellt|[Bb]eschäftigt|[Tt]ätig)\\s+bei|Arbeitgeber(?:in)?|Firma)\\s+(?:(?:ist|der|dem|die|das)\\s+){0,2})${NOT_A_COMMON_NOUN}[A-ZÄÖÜ][\\p{L}0-9.&'-]{1,40}(?:\\s{1,3}${NOT_A_COMMON_NOUN}[A-ZÄÖÜ][\\p{L}0-9.&'-]{1,40}){0,2}`,
  'gu',
)
// Honorific-prefixed third-party names a profile-derived name list can never hold (landlord, doctor,
// accountant): "Herr Konrad Bauer", "Frau Dr. Schmidt". Bounded to three name words; the honorific is
// captured ($1) and kept.
const HONORIFIC_NAME_REGEX = new RegExp(
  `\\b((?:Herrn?|Frau|Dr\\.|Prof\\.)(?:\\s+(?:Dr\\.|Prof\\.|med\\.))?\\s+)${NAME_WORD}(?:[\\s-]{1,3}${NAME_WORD}){0,2}`,
  'gu',
)
// Third-party name by relationship word, without an honorific ("mein Vermieter Konrad Bauer"). Captures the
// relationship ($1) and masks only the name. Applied after the known-name pass, so "[MANDANT]" (which does
// not start with a capital letter) is never swallowed. "ist" is no link to a name: what follows it is what
// the person is ("Partnerin ist Beamtin"), which the answer depends on.
const RELATED_PERSON_NAME_REGEX = new RegExp(
  `\\b((?:Vermieter(?:in)?|Mieter(?:in)?|Nachbar(?:in|n)?|Arzt|Ärztin|Zahnarzt|Hausarzt|Steuerberater(?:in)?|Makler(?:in)?|Anwalt|Anwältin|Chef(?:in)?|Partner(?:in)?)\\s+(?:heißt\\s+)?)${NAME_WORD}(?:[\\s-]{1,3}${NAME_WORD}){0,2}`,
  'gu',
)
const EMPLOYER_LINE_REGEX =
  /^(?!.*\b(?:Bruttoarbeitslohn|Lohnsteuer|Rentenversicherung|Krankenversicherung|Pflegeversicherung|Arbeitslosenversicherung)\b).*\b(?:GmbH|mbH|UG|OHG|KGaA|GmbH\s*&\s*Co\.?\s*KG|Co\.?\s*KG|AG|SE)\b.*$/gm
// A second word of the town and trailing blanks no longer compete for the same blanks (Sonar S8786).
const LABELED_PLZ_LINE_REGEX = /^[^\S\r\n]*(?:PLZ\s*(?:\/\s*)?Ort\s*|D-\d{5}\s*|DE-\d{5}\s*|\d{5}\s+[A-ZÄÖÜ][a-zäöüß-]+(?:\s+(?:[A-ZÄÖÜ][a-zäöüß-]+\s*)?)?)$/gm

/**
 * Scrubs uploaded/OCR document text (e.g. Lohnsteuerbescheinigung) before any external AI fallback.
 * Strips personal header lines, employer names, eTIN, Transferticket, SV numbers, addresses,
 * birthdates, Steuerklasse, plus all chat PII (Steuer-ID, Steuernummer, IBAN, contact, known names).
 */
export function scrubDocumentTextPii(
  text: string,
  knownNames: readonly string[] = [],
): string {
  if (!text) return ''

  let scrubbed = text
  scrubbed = scrubbed.replace(LABELED_PII_LINE_REGEX, '[PII-ZEILE-GESCHÜTZT]')
  scrubbed = scrubbed.replace(ETIN_TEXT_REGEX, '[ETIN-GESCHÜTZT]')
  scrubbed = scrubbed.replace(TRANSFERTICKET_REGEX, '[TICKET-GESCHÜTZT]')
  scrubbed = scrubbed.replace(SVNR_TEXT_REGEX, '[SVNR-GESCHÜTZT]')
  scrubbed = scrubbed.replace(DOB_VALUE_REGEX, '[GEBURTSDATUM-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STREET_AND_NUMBER_REGEX, '[ADRESSE-GESCHÜTZT]')
  scrubbed = scrubbed.replace(EMPLOYER_LINE_REGEX, '[ARBEITGEBER-GESCHÜTZT]')
  scrubbed = scrubbed.replace(LABELED_PLZ_LINE_REGEX, '[ORT-GESCHÜTZT]')

  return scrubUserMessagePii(scrubbed, knownNames)
}


