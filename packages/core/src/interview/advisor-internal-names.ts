// What the owl's text may not carry to the user: the app's own field ids („kopplung.filingType“) and
// the names of its tools („[read_current_estimate]“). A real-data run showed both in answers; the app
// takes them out before the text is stored, whatever the model wrote.
import { fieldSpec } from './field-catalog'
import { SCREENS } from './marking'

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
const TOOL_AS_SOURCE = /\s*\[`?[a-z]+(?:_[a-z]+)+`?\]/g
const ESTIMATE_TOOL = /`read_current_estimate`/g

const isField = (screen: string, field: string): boolean => fieldSpec(screen, field) !== undefined

export function withoutInternalNames(text: string): string {
  const cleaned = text
    .replace(TOOL_AS_SOURCE, '')
    .replace(ESTIMATE_TOOL, 'Schätzung der App')
    // „(kind.x, Kind 1)“ keeps „(Kind 1)“; a parenthesis that held only the id goes.
    .replace(/\(\s*`?([A-Za-z]+)\.([A-Za-z][A-Za-z0-9-]*)`?\s*(?:,\s*([^()]*))?\)/g, (whole, screen: string, field: string, rest: string | undefined) =>
      isField(screen, field) ? (rest && rest.trim() !== '' ? `(${rest.trim()})` : '') : whole,
    )
    .replace(FIELD_ID, (whole, screen: string, field: string) => (isField(screen, field) ? `in der Maske „${MASK_NAMES[screen] ?? screen}“` : whole))
  // Untouched text stays exactly as written; only a removal leaves a gap to close (never an indentation).
  if (cleaned === text) return text
  return cleaned.replace(/(\S) +([:.,;!?])/g, '$1$2').replace(/(\S) {2,}(?=\S)/g, '$1 ')
}
