import { looksLikeChHealthStatement } from './ch-health-statement'
import { classifyChInsuranceLetter } from './ch-insurance-letters'
import { looksLikeAssessmentNotice } from './assessment-notice'
/** Document kinds the parse endpoint has a strategy for (`auto` = generic receipt classifier). */
export type DetectedDocumentKind = 'lstb' | 'chLohnausweis' | 'chPensionskasse' | 'chPraemien' | 'chKrankenkasse' | 'steuerbescheid' | 'auto'

const LSTB_TITLE = /lohnsteuerbescheinigung/i
const LSTB_ROW_MARKERS = [
  /\bBruttoarbeitslohn\b/i,
  /\bEinbehaltene\s+Lohnsteuer\b/i,
  /Arbeitnehmeranteil.*Rentenversicherung/i,
  /Arbeitnehmerbeitr(?:ä|ae)ge.*(?:Kranken|Pflege|Arbeitslosen)versicherung/i,
  /\beTIN\b/i,
]

/** Lower case without accents, „ß“ as „ss“: OCR and Swiss spelling write the same word differently. */
function fold(text: string): string {
  return text.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** What the head of Form 11 prints: its three titles, the pension line below them and the form number. */
const CH_CERTIFICATE_TITLES = [/lohn\s*ausw\w{2,4}/, /certificat\s+de\s+sala/, /certificato\s+di\s+sala/, /rentenbescheinigung|attestation\s+de\s+rentes/, /605\.040\.18|form\.?\s*11\b/]
/** The Ziffern every certificate carries (8, 9, 10, 11, 12), German or French. */
const CH_CERTIFICATE_ROWS = [
  /brutto\s*lohn\s+total|salaire\s+brut\s+total/,
  /ahv\/iv\/eo|avs\/a[il]\/apg/,
  /berufliche\s+vorsorge|prevoyance\s+professionnelle/,
  /netto\s*lohn|salaire\s+net/,
  /quellensteuerabzug|imp.t\s+a\s+la\s+source/,
]

/**
 * The Swiss salary certificate (Form 11), told by what the form prints rather than by one exact phrase:
 * three of its titles and one of its rows, two and two, or one and three. A scan whose text was complete
 * was filed as „sonstiges“ because OCR had misread one marker (real-data run, step 3a).
 */
function looksLikeChSalaryCertificateForm(text: string): boolean {
  const folded = fold(text)
  const titles = CH_CERTIFICATE_TITLES.filter((re) => re.test(folded)).length
  const rows = CH_CERTIFICATE_ROWS.filter((re) => re.test(folded)).length
  // The gross total (Ziffer 8) is the form's own phrase: with two titles it is enough.
  return (titles >= 2 && CH_CERTIFICATE_ROWS[0]!.test(folded)) || (titles >= 3 && rows >= 1) || (titles >= 2 && rows >= 2) || (titles >= 1 && rows >= 3)
}

/**
 * Deterministic routing of an uploaded document to its parse strategy (#444): a
 * Lohnsteuerbescheinigung is recognised by its title plus at least one certificate row,
 * or by two certificate rows when OCR lost the title. Everything else is a generic receipt.
 */
export function classifyDocumentKind(text: string): DetectedDocumentKind {
  if (!text) return 'auto'
  // A tax notice quotes the LStB's rows (Bruttoarbeitslohn, einbehaltene Lohnsteuer): it is told first (ADR-0098 §4).
  if (looksLikeAssessmentNotice(text)) return 'steuerbescheid'
  // The Swiss salary certificate; a receipt that merely mentions a Lohnausweis is none.
  if (looksLikeChSalaryCertificateForm(text)) return 'chLohnausweis'
  // A Swiss health insurer's statement for the tax return (ADR-0080).
  if (looksLikeChHealthStatement(text)) return 'chKrankenkasse'
  // The Swiss pension fund's statement and the employer's premium letter (ADR-0075).
  const letter = classifyChInsuranceLetter(text)
  if (letter !== null) return letter
  const rows = LSTB_ROW_MARKERS.filter((marker) => marker.test(text)).length
  if (LSTB_TITLE.test(text) && rows >= 1) return 'lstb'
  return rows >= 2 ? 'lstb' : 'auto'
}
