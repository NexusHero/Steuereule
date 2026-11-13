import { classifyChInsuranceLetter } from './ch-insurance-letters'
/** Document kinds the parse endpoint has a strategy for (`auto` = generic receipt classifier). */
export type DetectedDocumentKind = 'lstb' | 'chLohnausweis' | 'chPensionskasse' | 'chPraemien' | 'auto'

const LSTB_TITLE = /lohnsteuerbescheinigung/i
const LSTB_ROW_MARKERS = [
  /\bBruttoarbeitslohn\b/i,
  /\bEinbehaltene\s+Lohnsteuer\b/i,
  /Arbeitnehmeranteil.*Rentenversicherung/i,
  /Arbeitnehmerbeitr(?:ä|ae)ge.*(?:Kranken|Pflege|Arbeitslosen)versicherung/i,
  /\beTIN\b/i,
]

/**
 * Deterministic routing of an uploaded document to its parse strategy (#444): a
 * Lohnsteuerbescheinigung is recognised by its title plus at least one certificate row,
 * or by two certificate rows when OCR lost the title. Everything else is a generic receipt.
 */
export function classifyDocumentKind(text: string): DetectedDocumentKind {
  if (!text) return 'auto'
  // The Swiss salary certificate: its German and French title and the gross total; a receipt that
  // merely mentions a Lohnausweis is none.
  if (/Lohnausweis/i.test(text) && /Certificat\s+de\s+salaire/i.test(text) && /Bruttolohn\s+total/i.test(text)) return 'chLohnausweis'
  // The Swiss pension fund's statement and the employer's premium letter (ADR-0075).
  const letter = classifyChInsuranceLetter(text)
  if (letter !== null) return letter
  const rows = LSTB_ROW_MARKERS.filter((marker) => marker.test(text)).length
  if (LSTB_TITLE.test(text) && rows >= 1) return 'lstb'
  return rows >= 2 ? 'lstb' : 'auto'
}
