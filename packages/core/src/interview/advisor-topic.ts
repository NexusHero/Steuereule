// The owl's topic boundary (ADR-0069 §Themengrenze): a small model checks each typed message before
// the owl answers. Tax matters and what reaches directly into them pass, a grey zone passes with the
// hint to answer only the tax side, anything else gets one fixed sentence that no model wrote and no
// user can talk round.
import type { AdvisorMessageMeta, CaseDigest } from './advisor'
import type { AdvisorQuestionRound } from './advisor-skills'

export const ADVISOR_TOPIC_VERDICTS = ['tax', 'gray', 'off_topic'] as const
export type AdvisorTopicVerdict = (typeof ADVISOR_TOPIC_VERDICTS)[number]

/** Coarse, text-free categories: what is counted per user and day, never the message itself. */
export const ADVISOR_TOPIC_CATEGORIES = [
  'tax',
  'tax_adjacent',
  'general_finance',
  'legal',
  'programming',
  'creative',
  'recipe',
  'health',
  'chitchat',
  'meta',
  'injection',
  'other',
] as const
export type AdvisorTopicCategory = (typeof ADVISOR_TOPIC_CATEGORIES)[number]

export interface AdvisorTopicCheck {
  readonly verdict: AdvisorTopicVerdict
  readonly category: AdvisorTopicCategory
  /** ISO 639-1 code of the message, lower case; the refusal is said in it. */
  readonly language: string
}

/** What the turn ended up with: a verdict, or why there was none (the turn was let through). */
export type AdvisorTopicOutcome =
  | AdvisorTopicCheck
  | { readonly verdict: 'skipped' }
  | { readonly verdict: 'unavailable'; readonly reason: 'not_configured' | 'timeout' | 'error' | 'unreadable' }

export const TOPIC_REFUSAL_MAX_CHOICES = 3

const REFUSAL_BY_LANGUAGE: Readonly<Record<string, string>> = {
  de: 'Dabei kann ich dir nicht helfen – ich bin nur für deine Steuern da. Womit machen wir bei deiner Erklärung weiter?',
  en: "I can't help you with that – I'm only here for your taxes. What shall we look at in your return?",
  tr: 'Bu konuda sana yardımcı olamam – yalnızca vergilerin için buradayım. Beyannamende neye bakalım?',
  fr: "Je ne peux pas t'aider sur ce point – je suis là uniquement pour tes impôts. Que regardons-nous dans ta déclaration ?",
  it: 'Su questo non posso aiutarti – sono qui solo per le tue tasse. Cosa guardiamo nella tua dichiarazione?',
  es: 'No puedo ayudarte con eso – solo estoy aquí para tus impuestos. ¿Qué miramos en tu declaración?',
  pl: 'W tym nie mogę ci pomóc – jestem tu tylko do spraw twoich podatków. Czym zajmiemy się w twoim zeznaniu?',
}

const GENERAL_CHOICES = ['Was hab ich vergessen?', 'Kanzlei-Endprüfung starten'] as const

/** The answer to an off-topic message: one fixed sentence and the open hints of the case to go on with. */
export function topicRefusal(language: string, digest: CaseDigest): { readonly replyText: string; readonly meta: AdvisorMessageMeta } {
  const replyText = REFUSAL_BY_LANGUAGE[language.toLowerCase()] ?? REFUSAL_BY_LANGUAGE.de!
  const fromHints = digest.openOwlHints.map((hint) => hint.title.trim()).filter((title) => title.length > 0)
  const choices = [...new Set([...fromHints, ...GENERAL_CHOICES])].slice(0, TOPIC_REFUSAL_MAX_CHOICES)
  return { replyText, meta: { choices } }
}

/** The guard's answer, checked: anything without a known verdict is no verdict. */
export function parseTopicCheck(raw: unknown): AdvisorTopicCheck | null {
  if (!raw || typeof raw !== 'object') return null
  const { verdict, category, language } = raw as { verdict?: unknown; category?: unknown; language?: unknown }
  if (typeof verdict !== 'string' || !(ADVISOR_TOPIC_VERDICTS as readonly string[]).includes(verdict)) return null
  const knownCategory = typeof category === 'string' && (ADVISOR_TOPIC_CATEGORIES as readonly string[]).includes(category)
  const code = typeof language === 'string' && /^[a-z]{2}$/i.test(language.trim()) ? language.trim().toLowerCase() : 'de'
  return {
    verdict: verdict as AdvisorTopicVerdict,
    category: knownCategory ? (category as AdvisorTopicCategory) : 'other',
    language: code,
  }
}

/**
 * Whether a message is exactly one of the answers the owl offered to tap last time. Those texts come
 * from the app, so they skip the guard; a choice with anything added is typed text.
 */
export function isOfferedChoice(
  message: string,
  lastAssistantMeta: { readonly choices?: readonly string[] | undefined; readonly questionRound?: AdvisorQuestionRound | undefined } | null | undefined,
): boolean {
  if (!lastAssistantMeta) return false
  const text = message.trim()
  if (text.length === 0) return false
  const offered = [...(lastAssistantMeta.choices ?? []), ...(lastAssistantMeta.questionRound?.questions.flatMap((q) => q.options) ?? [])]
  return offered.some((option) => option.trim() === text)
}
