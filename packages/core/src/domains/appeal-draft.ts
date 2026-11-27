import { formatEuro } from '../common/format'

/**
 * A first draft of an objection (Einspruch, § 347 AO) against a Bescheid: the positions the tax office
 * recognised differently from the return, each with both figures. A template the user completes and
 * decides on; the app states what differs, it does not judge whether the objection has merit.
 * Always German: it is a letter to a German tax office.
 */
export interface AppealDraftPosition {
  readonly label: string
  /** Whole euros as filed. */
  readonly declared: number
  /** Whole euros as the Bescheid shows it. */
  readonly assessed: number
  /** The tax office's own explanation, quoted from the Bescheid, if it gave one. */
  readonly explanation: string | null
}

export interface AppealDraftInput {
  readonly taxYear: number
  /** The date printed on the Bescheid, ISO yyyy-mm-dd. */
  readonly assessmentDate: string
  /** The day of the letter, ISO yyyy-mm-dd. */
  readonly today: string
  readonly positions: readonly AppealDraftPosition[]
}

const germanDate = (iso: string): string => {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

/** What the user fills in: the app does not put a name, an address or a tax number into a letter by itself. */
export const APPEAL_DRAFT_BLANKS = ['[Dein Name]', '[Deine Anschrift]', '[Finanzamt und Anschrift]', '[Steuernummer]', '[Begründung]', '[Unterschrift]'] as const

function positionLine(position: AppealDraftPosition): string {
  const line = `- ${position.label}: erklärt ${formatEuro(position.declared)}, im Bescheid ${formatEuro(position.assessed)} (Abweichung ${formatEuro(Math.abs(position.declared - position.assessed))})`
  return position.explanation === null ? line : `${line}\n  Erläuterung des Finanzamts: „${position.explanation}“`
}

export function appealDraft(input: AppealDraftInput): string {
  if (input.positions.length === 0) throw new Error('appealDraft: an objection draft needs at least one position that differs.')
  return [
    '[Dein Name]',
    '[Deine Anschrift]',
    '',
    '[Finanzamt und Anschrift]',
    '',
    germanDate(input.today),
    '',
    'Steuernummer: [Steuernummer]',
    `Einspruch gegen den Einkommensteuerbescheid ${input.taxYear} vom ${germanDate(input.assessmentDate)}`,
    '',
    'Sehr geehrte Damen und Herren,',
    '',
    'gegen den oben genannten Bescheid lege ich Einspruch ein.',
    '',
    input.positions.length === 1 ? 'Der Bescheid weicht in folgendem Punkt von meiner Steuererklärung ab:' : 'Der Bescheid weicht in folgenden Punkten von meiner Steuererklärung ab:',
    '',
    ...input.positions.map(positionLine),
    '',
    'Ich beantrage, die Beträge wie erklärt zu berücksichtigen und den Bescheid entsprechend zu ändern.',
    '',
    'Begründung: [Begründung]',
    '',
    'Mit freundlichen Grüßen',
    '',
    '[Unterschrift]',
    '',
  ].join('\n')
}
