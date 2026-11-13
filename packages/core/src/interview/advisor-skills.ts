/**
 * Skills of the owl (#495): a way of working the user switches on for the conversation. They ship
 * with the app, the user only turns them on and off. A skill changes how the owl asks and answers;
 * it never widens what she may write (Zero-Write stays, ADR-0038).
 */
export const ADVISOR_SKILL_IDS = ['berater-interview'] as const
export type AdvisorSkillId = (typeof ADVISOR_SKILL_IDS)[number]

export function isAdvisorSkillId(value: unknown): value is AdvisorSkillId {
  return typeof value === 'string' && (ADVISOR_SKILL_IDS as readonly string[]).includes(value)
}

/** One round of the interview: a few questions, each with answers to tap. */
export interface AdvisorQuestionRound {
  readonly questions: readonly AdvisorRoundQuestion[]
}

/**
 * `fact`: something the user had or did ("Hattest du Fortbildungskosten?"). The owl never
 * recommends an answer to a fact: a tap on the recommendation would claim it for the user.
 * `decision`: a choice the user makes ("Zusammen- oder Einzelveranlagung?"); here the owl names her
 * pick and why.
 */
export const ADVISOR_QUESTION_KINDS = ['fact', 'decision'] as const
export type AdvisorQuestionKind = (typeof ADVISOR_QUESTION_KINDS)[number]

export interface AdvisorRoundQuestion {
  readonly text: string
  /** Two to four answers to tap; the user can always write their own instead. */
  readonly options: readonly string[]
  /** Missing on rounds stored before questions had a kind; read those as facts. */
  readonly kind?: AdvisorQuestionKind | undefined
  /** More than one answer may be ticked ("Was davon hattest du?"). */
  readonly multiple?: boolean | undefined
  /** The owl's own pick, one of `options`; only on a decision. */
  readonly recommended?: string | undefined
  /** Why she recommends it, in one short sentence; only with `recommended`. */
  readonly reason?: string | undefined
}

/** The message a round turns into: one line per question, its number and the ticked answers. */
export function roundAnswersToMessage(round: AdvisorQuestionRound, picked: readonly (readonly string[])[]): string {
  return round.questions.map((_, i) => `${i + 1}: ${picked[i] && picked[i].length > 0 ? picked[i].join(', ') : '—'}`).join('\n')
}

/** Whether a message is a round's answers exactly as the app writes them, so it comes from the app, not the keyboard. */
export function isRoundAnswer(message: string, round: AdvisorQuestionRound | undefined): boolean {
  if (!round || round.questions.length === 0) return false
  const lines = message.trim().split('\n')
  if (lines.length !== round.questions.length) return false
  return lines.every((line, i) => {
    const prefix = `${i + 1}: `
    if (!line.startsWith(prefix)) return false
    const answer = line.slice(prefix.length)
    const question = round.questions[i]!
    if (answer === '—' || question.options.includes(answer)) return true
    return question.multiple === true && answer.split(', ').every((part) => question.options.includes(part))
  })
}

export const ADVISOR_ROUND_MAX_QUESTIONS = 4
export const ADVISOR_ROUND_MAX_OPTIONS = 4

/** What the user types in the chat to switch a skill on: `/grill-me`, as in other assistants. */
export const ADVISOR_SKILL_COMMANDS: Readonly<Record<string, AdvisorSkillId>> = { 'grill-me': 'berater-interview' }

export type SkillCommand =
  | { readonly kind: 'skill'; readonly command: string; readonly skill: AdvisorSkillId; /** What followed the command, to be sent as the first message. */ readonly rest: string }
  | { readonly kind: 'unknown'; readonly command: string }

/** Reads a message that starts with a slash command; null for an ordinary message. */
export function parseSkillCommand(text: string): SkillCommand | null {
  const match = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!match) return null
  const command = match[1]!.toLowerCase()
  const skill = Object.hasOwn(ADVISOR_SKILL_COMMANDS, command) ? ADVISOR_SKILL_COMMANDS[command] : undefined
  return skill ? { kind: 'skill', command, skill, rest: (match[2] ?? '').trim() } : { kind: 'unknown', command }
}

/** The commands that start with what the user has typed so far (`/gr` → grill-me). */
export function matchingSkillCommands(typed: string): readonly string[] {
  const match = /^\/([a-z0-9-]*)$/i.exec(typed)
  if (!match) return []
  return Object.keys(ADVISOR_SKILL_COMMANDS).filter((command) => command.startsWith(match[1]!.toLowerCase()))
}

/**
 * The areas the Berater-Interview works through (the intake checklist of the steuerberater skill).
 * The app keeps for each tax year which of them are settled, so the interview neither asks twice
 * nor stops before every area is done, whatever the model remembers.
 */
export const INTERVIEW_AREAS = [
  { id: 'grunddaten', label: 'Grunddaten (Familienstand, Veranlagungsart, Bundesland, Kirche)' },
  { id: 'kinder', label: 'Kinder' },
  { id: 'einkuenfte', label: 'Einkünfte (Lohn, Rente, Kapital, Vermietung, selbstständig, Lohnersatz)' },
  { id: 'arbeit', label: 'Arbeit (Arbeitsweg, Homeoffice, Arbeitsmittel, Fortbildung, Reisen, Umzug)' },
  { id: 'vorsorge', label: 'Vorsorge (Kranken-, Pflege-, Rentenversicherung, Rürup, Riester, weitere Versicherungen)' },
  { id: 'haushalt', label: 'Haushalt (Handwerker, haushaltsnahe Dienste, Nebenkostenabrechnung)' },
  { id: 'belastungen', label: 'Belastungen (Krankheit, Pflege, Behinderung, Unterhalt, Beerdigung)' },
  { id: 'spenden', label: 'Spenden, Mitgliedsbeiträge, gezahlte Kirchensteuer' },
  { id: 'ausland', label: 'Ausland (Grenzgänger, Konten und Einkünfte im Ausland)' },
  { id: 'vorjahr', label: 'Vorjahr (Bescheid, Verlustvortrag, offene Einsprüche, Vorauszahlungen)' },
] as const
export type InterviewAreaId = (typeof INTERVIEW_AREAS)[number]['id']
export const INTERVIEW_AREA_IDS: readonly InterviewAreaId[] = INTERVIEW_AREAS.map((area) => area.id)

/** `done`: asked and answered. `not_applicable`: the user has none of it. Missing means open. */
export const INTERVIEW_AREA_STATUSES = ['open', 'done', 'not_applicable'] as const
export type InterviewAreaStatus = (typeof INTERVIEW_AREA_STATUSES)[number]
export type InterviewProgress = Readonly<Partial<Record<InterviewAreaId, InterviewAreaStatus>>>

export interface InterviewAreaChange {
  readonly area: InterviewAreaId
  readonly status: InterviewAreaStatus
}

export function isInterviewAreaId(value: unknown): value is InterviewAreaId {
  return typeof value === 'string' && (INTERVIEW_AREA_IDS as readonly string[]).includes(value)
}

/** The progress after the changes of one answer, later changes winning; `open` drops the entry. */
export function applyInterviewChanges(progress: InterviewProgress, changes: readonly InterviewAreaChange[]): InterviewProgress {
  const next: Partial<Record<InterviewAreaId, InterviewAreaStatus>> = { ...progress }
  for (const change of changes) {
    if (change.status === 'open') delete next[change.area]
    else next[change.area] = change.status
  }
  return next
}

/** Reads stored progress, keeping only known areas and statuses. */
export function parseInterviewProgress(value: unknown): InterviewProgress {
  if (typeof value !== 'object' || value === null) return {}
  const progress: Partial<Record<InterviewAreaId, InterviewAreaStatus>> = {}
  for (const [area, status] of Object.entries(value)) {
    if (isInterviewAreaId(area) && (status === 'done' || status === 'not_applicable')) progress[area] = status
  }
  return progress
}

/** The areas grouped by where they stand, in the order of the checklist. */
export function interviewStanding(progress: InterviewProgress): { readonly open: readonly InterviewAreaId[]; readonly done: readonly InterviewAreaId[]; readonly notApplicable: readonly InterviewAreaId[] } {
  return {
    open: INTERVIEW_AREA_IDS.filter((id) => progress[id] === undefined),
    done: INTERVIEW_AREA_IDS.filter((id) => progress[id] === 'done'),
    notApplicable: INTERVIEW_AREA_IDS.filter((id) => progress[id] === 'not_applicable'),
  }
}
