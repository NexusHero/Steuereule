// What the owl's text may not carry to the user: the app's own field ids („kopplung.filingType“) and
// the names of its tools („[read_current_estimate]“). A real-data run showed both in answers; the app
// takes them out before the text is stored, whatever the model wrote.
import { fieldSpec } from './field-catalog'
import { fieldLabelOfId } from './field-labels'
import { SCREENS } from './marking'
import type { AdvisorActionProposal, AdvisorMessageMeta } from './advisor'
import type { AdvisorPlanStep } from './ki-port'

const MASK_NAMES: Readonly<Record<string, string>> = {
  profil: 'Profil',
  stammdaten: 'Stammdaten',
  kopplung: 'Kopplung',
  interview: 'Interview',
  lstb: 'Lohnsteuerbescheinigung',
  commute: 'Arbeitsweg',
  chLohnausweis: 'Lohnausweis (Schweiz)',
  rente: 'Rente',
  kapital: 'Kapitalerträge',
  vermietung: 'Vermietung',
  kind: 'Kinder',
  assessment: 'Steuerbescheid',
  buchung: 'Buchungen',
}

const FIELD_ID = new RegExp(`\`?\\b(${SCREENS.join('|')})\\.([A-Za-z][A-Za-z0-9-]*)\\b\`?`, 'g')
/** A tool's name is snake_case; a legal source id is written with hyphens and stays. */
const TOOL_AS_SOURCE = /\[`?[a-z]+(?:_[a-z]+)+`?\]/g
const ESTIMATE_TOOL = /`read_current_estimate`/g

const isField = (screen: string, field: string): boolean => fieldSpec(screen, field) !== undefined

const SCREEN_IDS = SCREENS.join('|')
/** „Maske chLohnausweis“, „in Maske `kind`“: the word stays, the id becomes the mask's name. */
const MASK_WORD_ID = new RegExp(`\\b(Masken?)\\s+\`?(${SCREEN_IDS})\`?(?![\\w.])`, 'g')
/** „(stammdaten)“ after a word: the id alone in a parenthesis says nothing to the user. */
const SCREEN_IN_PARENS = new RegExp(`\\s*\\(\\s*\`?(?:${SCREEN_IDS})\`?\\s*\\)`, 'g')
/** A bare field id: camelCase („pkArbeitnehmerChf“) or hyphenated („bruttolohn-total“), backticks or not. */
const BARE_FIELD_ID = /`?\b([a-z][a-z0-9]*(?:[A-Z][A-Za-z0-9]*|(?:-[a-z0-9]+)+))\b`?/g
/** A lowercase id before a colon, as in „kinship: 1“: a German noun there would be capitalised. */
const ID_BEFORE_COLON = /`?\b([a-z][a-z0-9]*)\b`?(?=:)/g

const quotedLabel = (whole: string, id: string): string => {
  const label = fieldLabelOfId(id)
  return label === null ? whole : `„${label}“`
}

/**
 * Drops every tool name written as a source, with the blanks before it. Done by cutting the text at the names
 * and trimming each piece's end: „\s*“ in front of the pattern retried from every blank of a long run (Sonar S8786).
 */
const withoutToolSources = (text: string): string => {
  const pieces = text.split(TOOL_AS_SOURCE)
  return pieces.map((piece, index) => (index < pieces.length - 1 ? piece.trimEnd() : piece)).join('')
}

export function withoutInternalNames(text: string): string {
  const cleaned = withoutToolSources(text)
    .replace(ESTIMATE_TOOL, 'Schätzung der App')
    // „(kind.x, Kind 1)“ keeps „(Kind 1)“; a parenthesis that held only the id goes.
    .replace(/\(\s*`?([A-Za-z]+)\.([A-Za-z][A-Za-z0-9-]*)`?\s*(?:,([^()]*))?\)/g, (whole, screen: string, field: string, rest: string | undefined) =>
      isField(screen, field) ? (rest && rest.trim() !== '' ? `(${rest.trim()})` : '') : whole,
    )
    .replace(FIELD_ID, (whole, screen: string, field: string) => (isField(screen, field) ? `in der Maske „${MASK_NAMES[screen] ?? screen}“` : whole))
    .replace(MASK_WORD_ID, (_whole, word: string, screen: string) => `${word} „${MASK_NAMES[screen] ?? screen}“`)
    .replace(SCREEN_IN_PARENS, '')
    .replace(BARE_FIELD_ID, quotedLabel)
    .replace(ID_BEFORE_COLON, quotedLabel)
  // Untouched text stays exactly as written; only a removal leaves a gap to close (never an indentation).
  if (cleaned === text) return text
  return cleaned.replace(/(\S) +([:.,;!?])/g, '$1$2').replace(/(\S) {2,}(?=\S)/g, '$1 ')
}

function cleanAction<T extends Pick<AdvisorActionProposal, 'label' | 'reason'> & { readonly evidenceHint?: string | undefined }>(action: T): T {
  return {
    ...action,
    label: withoutInternalNames(action.label),
    reason: withoutInternalNames(action.reason),
    ...(action.evidenceHint ? { evidenceHint: withoutInternalNames(action.evidenceHint) } : {}),
  }
}

/**
 * The texts of an answer's meta that the chat and the workbench show: draft labels and reasons, the two
 * paths, the plan's steps. The model writes them like the reply, so they are cleaned like the reply.
 */
export function metaWithoutInternalNames<T extends AdvisorMessageMeta & { readonly plan?: readonly AdvisorPlanStep[] | undefined }>(meta: T): T {
  return {
    ...meta,
    ...(meta.action ? { action: cleanAction(meta.action) } : {}),
    ...(meta.actions ? { actions: meta.actions.map(cleanAction) } : {}),
    ...(meta.twoPaths
      ? { twoPaths: { ...meta.twoPaths, title: withoutInternalNames(meta.twoPaths.title), safePath: cleanAction(meta.twoPaths.safePath), maxPath: cleanAction(meta.twoPaths.maxPath) } }
      : {}),
    ...(meta.steps ? { steps: meta.steps.map(withoutInternalNames) } : {}),
    ...(meta.plan ? { plan: meta.plan.map((step) => ({ ...step, text: withoutInternalNames(step.text) })) } : {}),
  }
}

