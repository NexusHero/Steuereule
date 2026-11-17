/**
 * When an owl answer carries the consent card for personal data (ADR-0091). Decided here, from
 * the turn itself, and never left to whether the model happened to call a tool: the real-data run
 * showed the owl telling the user to consent "under this answer" while no card appeared, because
 * the only triggers were a masked Steuer-ID/IBAN/name and a refused draft.
 */
export interface ConsentOfferInput {
  /** The user already consented: nothing to offer. */
  readonly consent: boolean
  /** The masking took something out of the user's message (Steuer-ID, IBAN, contact, a known name). */
  readonly maskedPersonalData: boolean
  /** The owl asked for the consent (`request_personal_data_consent`) or a draft was refused for the lack of it. */
  readonly consentRequested: boolean
  /** The user's message as the owl got it. */
  readonly message: string
  /** The owl's finished answer. */
  readonly reply: string
  /** A child is already recorded for the tax year: talking about it needs no new record. */
  readonly hasChildRecord: boolean
  /** The household already has a Person B. */
  readonly hasPersonB: boolean
}

const WORD_START = '(?<![\\p{L}\\p{N}_])'
const WORD_END = '(?![\\p{L}\\p{N}_])'
const words = (alternatives: string): RegExp => new RegExp(`${WORD_START}(?:${alternatives})${WORD_END}`, 'iu')

const NO_CHILD = new RegExp(`${WORD_START}(?:keine?n?|ohne|no|without)\\s+(?:kind(?:er)?|children|kids?|child)${WORD_END}`, 'giu')
const CHILD = words('tochter|töchter|sohn|söhne|sohnes|kind|kinder|kindes|kindern|baby|nachwuchs|daughters?|sons?|child|children|kids?')
const NOT_MARRIED = new RegExp(`${WORD_START}(?:nicht|not|un)\\s*(?:verheiratet|married)${WORD_END}`, 'giu')
const SPOUSE = words('ehefrau|ehemann|ehegatt(?:e|in)|ehepartner(?:in)?|mein(?:e|er|em|es)? (?:frau|mann|mannes|partner(?:in)?)|lebenspartner(?:in)?|verheiratet|zusammenveranlag\\p{L}*|my (?:wife|husband)|spouse|married')
const USER_CONSENTS = /einwillig|erlaube|\bconsent\b|\bi allow\b/iu
const REPLY_NAMES_CONSENT = /einwillig|\bconsent\b|erlaub[^.!?]{0,80}pers(?:ö|oe)nliche|pers(?:ö|oe)nliche[nr]? (?:daten|angaben)[^.!?]{0,80}erlaub/iu
const BIRTH_DATE = /(?:geboren|geb\.|geburtsdatum|geburtstag|born)[^.!?\n]{0,40}\d/iu
// The two letters before the street suffix are a fixed-length lookbehind, so the pattern never backtracks over a long word.
const ADDRESS = /(?<=\p{L}{2})(?:straße|strasse|str\.|weg|gasse|allee|platz|ring|damm)\s*\d{1,4}\s*[a-z]?(?![\p{L}\p{N}])/iu

/** Whether the user's words name personal data the owl may not process, or need, without the consent. */
export function messageNamesPersonalData(message: string, known: Pick<ConsentOfferInput, 'hasChildRecord' | 'hasPersonB'>): boolean {
  if (USER_CONSENTS.test(message) || BIRTH_DATE.test(message) || ADDRESS.test(message)) return true
  if (!known.hasChildRecord && CHILD.test(message.replace(NO_CHILD, ' '))) return true
  return !known.hasPersonB && SPOUSE.test(message.replace(NOT_MARRIED, ' '))
}

/** Whether the owl's answer points the user to the consent. */
export function replyNamesConsent(reply: string): boolean {
  return REPLY_NAMES_CONSENT.test(reply)
}

export function needsPersonalDataConsentOffer(input: ConsentOfferInput): boolean {
  if (input.consent) return false
  return input.maskedPersonalData || input.consentRequested || replyNamesConsent(input.reply) || messageNamesPersonalData(input.message, input)
}
