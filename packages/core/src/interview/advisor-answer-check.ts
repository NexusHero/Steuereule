import { ADVISOR_LEGAL_SOURCES, type AdvisorActionProposal } from './advisor'

/**
 * A check on what the owl wrote, after the fact and without a model (ADR-0066 §7). The prompt asks
 * the model to behave; this finds the answers where it did not, and the app says so under the
 * answer. It never rewrites the text: a notice the user can read beats a silently edited answer.
 */
export type AdvisorAnswerNoticeKind = 'unbacked-amount' | 'claims-write' | 'nothing-prepared' | 'invented-source' | 'out-of-scope'

export interface AdvisorAnswerNotice {
  readonly kind: AdvisorAnswerNoticeKind
  /** For the user, in German. */
  readonly text: string
  /** For `unbacked-amount`: the amounts the app did not work out, so an opening can be written again without them. */
  readonly amounts?: readonly number[] | undefined
}

export interface AdvisorAnswerCheckInput {
  readonly replyText: string
  readonly userMessage: string
  /** Every draft of this answer, the two paths included. */
  readonly drafts: readonly Pick<AdvisorActionProposal, 'newValue' | 'beforeRefundEur' | 'afterRefundEur' | 'deltaEur' | 'companionFields'>[]
  /** Drafts the app already reports as not prepared. */
  readonly notStagedCount: number
  /** Euro figures the tools worked out in this turn (estimates, simulations). */
  readonly computedFigures: readonly number[]
}

/** Ends of sentences; a dot inside a number („1.230 €“) is none. */
const SENTENCE_END = /[!?\n]+|\.(?!\d)/
const EURO_AMOUNT = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|euro\b|eur\b)/gi
const ANY_NUMBER = /\d{1,3}(?:\.\d{3})+|\d+/g
const EFFECT_WORDS = /erstattung|ersparnis|\bsparst\b|\bspart\b|steuervorteil|zurück\s?(?:bekomm|erh[aä]lt|erstattet)|bringt (?:dir|das|es)|weniger steuern?|steuerlast sinkt|mehr zurück/i
const RATE_AFTER = /^\s*(?:pro\b|je\b|\/|im Jahr\b|jährlich\b)/i
const CAP_BEFORE = /(?:bis zu|höchstens|maximal|max\.|begrenzt auf|gedeckelt auf|Pauschbetrag von|Pauschale von)\s*$/i
const FIRST_PERSON = /\bich\s+hab(?:e)?\b/i
const WRITE_CLAIM = /\b(?:eingetragen|gespeichert|übernommen|geändert|aktualisiert|hinterlegt)\b/i
const PREPARED_CLAIM = /\bvorbereitet\b|\bentw[uü]rfe?\b[^.!?\n]{0,30}\b(?:angelegt|erstellt)\b/i
/** Words that turn a claim into a condition, a negation or a look back. */
const NOT_A_CLAIM = /\bnicht\b|\bnichts\b|\bkein(?:e|en)?\b|\berst\b|\bsobald\b|\bwenn\b|\bnachdem\b|\bkannst\b|\bvorhin\b|\bbereits\b|\bzuvor\b|\bschon\b/i
const INLINE_SOURCE = /\[([a-z]+(?:-[0-9a-z]+)+)\]/g

const germanInteger = (digits: string): number => Number(digits.replace(/\./g, ''))

function numbersIn(text: string): number[] {
  return [...text.matchAll(ANY_NUMBER)].map((match) => germanInteger(match[0]))
}

function backedFigures(input: AdvisorAnswerCheckInput): Set<number> {
  const backed = new Set<number>()
  const add = (value: number) => {
    if (Number.isFinite(value)) backed.add(Math.abs(Math.round(value)))
  }
  input.computedFigures.forEach(add)
  numbersIn(input.userMessage).forEach(add)
  for (const draft of input.drafts) {
    add(draft.beforeRefundEur)
    add(draft.afterRefundEur)
    add(draft.deltaEur)
    numbersIn(draft.newValue).forEach(add)
    for (const value of Object.values(draft.companionFields ?? {})) numbersIn(value).forEach(add)
  }
  return backed
}

const euro = (value: number): string => `${value.toLocaleString('de-DE')} €`

export function checkAdvisorAnswer(input: AdvisorAnswerCheckInput): AdvisorAnswerNotice[] {
  const notices: AdvisorAnswerNotice[] = []
  const sentences = input.replyText.split(SENTENCE_END).filter((sentence) => sentence.trim() !== '')

  // 1. A euro effect the app did not work out. Amounts the user named, the drafts hold or a tool
  //    computed are fine; so is any amount outside a sentence about the effect (limits, flat rates).
  const backed = backedFigures(input)
  const unbacked = new Set<number>()
  for (const sentence of sentences) {
    if (!EFFECT_WORDS.test(sentence)) continue
    for (const match of sentence.matchAll(EURO_AMOUNT)) {
      const value = germanInteger(match[1]!)
      if (value <= 0 || backed.has(value)) continue
      // A rate („6 € pro Tag“) or a cap („bis zu 1.260 €“) explains the law; it is no claim about
      // what this user gets.
      const before = sentence.slice(Math.max(0, match.index - 16), match.index)
      const after = sentence.slice(match.index + match[0].length, match.index + match[0].length + 14)
      if (RATE_AFTER.test(after) || CAP_BEFORE.test(before)) continue
      unbacked.add(value)
    }
  }
  if (unbacked.size > 0) {
    notices.push({
      kind: 'unbacked-amount',
      text: `Diese Antwort nennt als Wirkung ${[...unbacked].map(euro).join(', ')}. Diesen Betrag hat die App nicht berechnet. Verlass dich auf die Zahlen in den Entwurfskarten und im Cockpit.`,
      amounts: [...unbacked],
    })
  }

  // 2. The owl never writes. „Ich habe … eingetragen“ is always wrong.
  if (sentences.some((s) => FIRST_PERSON.test(s) && WRITE_CLAIM.test(s) && !NOT_A_CLAIM.test(s))) {
    notices.push({ kind: 'claims-write', text: 'Die Eule trägt nichts selbst ein. Ein Wert steht erst in deiner Erklärung, wenn du einen Entwurf übernimmst.' })
  }

  // 3. „Ich habe … vorbereitet“ with nothing to show for it.
  if (
    input.drafts.length === 0 &&
    input.notStagedCount === 0 &&
    sentences.some((s) => FIRST_PERSON.test(s) && PREPARED_CLAIM.test(s) && !NOT_A_CLAIM.test(s))
  ) {
    notices.push({ kind: 'nothing-prepared', text: 'In dieser Antwort wurde kein Entwurf vorbereitet, auch wenn der Text das sagt. Bitte nenne die Angabe noch einmal.' })
  }

  // 4. A legal source that is not in the catalogue.
  const invented = [...new Set([...input.replyText.matchAll(INLINE_SOURCE)].map((m) => m[1]!))].filter((id) => !Object.hasOwn(ADVISOR_LEGAL_SOURCES, id))
  if (invented.length > 0) {
    notices.push({ kind: 'invented-source', text: `Die Quellenangabe ${invented.map((id) => `[${id}]`).join(', ')} gibt es im Quellenkatalog der App nicht. Bitte prüfe diese Aussage selbst.` })
  }

  return notices
}
