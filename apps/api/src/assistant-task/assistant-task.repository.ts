/** What a task asks the user to do; a fixed list so the app can label it. */
export const ASSISTANT_TASK_KINDS = ['konfession', 'einwilligung', 'bestaetigen', 'beleg_nachreichen', 'kind_entfernen', 'sonstiges'] as const
export type AssistantTaskKind = (typeof ASSISTANT_TASK_KINDS)[number]

export const ASSISTANT_TASK_DECISIONS = ['erledigt', 'verworfen'] as const
export type AssistantTaskDecision = (typeof ASSISTANT_TASK_DECISIONS)[number]
export type AssistantTaskStatus = 'offen' | AssistantTaskDecision

export interface AssistantTaskRecord {
  id: string
  userId: string
  taxYear: number
  kind: AssistantTaskKind
  text: string
  /** The client name of the assistant that left the task. */
  assistant: string
  /** The OAuth client that left it. */
  clientId: string
  status: AssistantTaskStatus
  createdAt: Date
  decidedAt: Date | null
}

export interface NewAssistantTask {
  kind: AssistantTaskKind
  text: string
  assistant: string
  clientId: string
}

export const ASSISTANT_TASK_REPOSITORY = Symbol('ASSISTANT_TASK_REPOSITORY')

/** The persistence seam for the tasks an assistant leaves for the user (#547). */
export interface AssistantTaskRepository {
  /** Every task of the year, oldest first, whatever its state. */
  listForUserAndYear(userId: string, taxYear: number): Promise<AssistantTaskRecord[]>
  create(userId: string, taxYear: number, task: NewAssistantTask): Promise<AssistantTaskRecord>
  /** Settles or discards an open task; null when the account has no open task with this id in that year. */
  decide(userId: string, taxYear: number, taskId: string, decision: AssistantTaskDecision): Promise<AssistantTaskRecord | null>
  /** Removes an open task its own assistant takes back (in one statement); false when there is no such task. */
  withdraw(userId: string, taxYear: number, taskId: string, clientId: string): Promise<boolean>
}
