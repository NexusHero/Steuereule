import { sentencesOf, speechChunks, speechText } from '../readAloud/speechText'

/** A first sentence shorter than this ("Ja.") is spoken together with the next one. */
const SHORT_OPENING = 12

/**
 * An answer in passages for a conversation: its first sentence alone, so the owl starts to speak as soon as
 * one sentence is written, then pieces a voice takes whole.
 */
export function conversationPassages(spoken: string): string[] {
  const sentences = sentencesOf(spoken)
  let opening = ''
  let taken = 0
  while (taken < sentences.length && opening.trim().length < SHORT_OPENING) opening += sentences[taken++]
  const [first = '', ...cut] = speechChunks(opening)
  // An opening too long for the voice is cut like any other text.
  return [first, ...cut, ...speechChunks(sentences.slice(taken).join(''))].filter((passage) => passage !== '')
}

/**
 * The passages of an answer that can be spoken now, while the answer is still being written. The last
 * passage of an unfinished answer is held back: it may still grow, or end in half a citation.
 */
export function speakablePassages(answer: string, done: boolean, language: string): string[] {
  const passages = conversationPassages(speechText(answer, language))
  return done ? passages : passages.slice(0, -1)
}

/**
 * Which of `passages` are new after `spoken`. Nothing when what was already said no longer matches the
 * answer (it was rewritten under way): what is said cannot be taken back, and saying it twice is worse.
 */
export function passagesAfter(spoken: readonly string[], passages: readonly string[]): string[] {
  if (spoken.some((passage, index) => passages[index] !== passage)) return []
  return passages.slice(spoken.length)
}
