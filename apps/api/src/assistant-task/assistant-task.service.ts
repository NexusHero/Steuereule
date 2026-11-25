import { Inject, Injectable } from '@nestjs/common'
import { NotFoundError } from '../common/domain-error.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import {
  ASSISTANT_TASK_KINDS,
  ASSISTANT_TASK_REPOSITORY,
  type AssistantTaskDecision,
  type AssistantTaskRecord,
  type AssistantTaskRepository,
  type NewAssistantTask,
} from './assistant-task.repository.js'

export const MAX_TASK_TEXT = 300

/**
 * Whether a text carries a web address in any form (MCP-12): a scheme, `www.`, an IP address, or any
 * `name.tld` with a top-level domain of letters (not a fixed list of them: .eu, .info, .ly, .xyz and every
 * other one count). A word glued to the next after a full stop ("erledigt.Bitte") counts too; the assistant
 * then writes it with a space.
 */
export function containsLink(text: string): boolean {
  return /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b\d{1,3}(?:\.\d{1,3}){3}\b|[\p{L}\p{N}-]{2,}\.(?:xn--[a-z0-9-]+|\p{L}{2,24})(?![\p{L}\p{N}])/iu.test(text)
}

export const MAX_OPEN_TASKS = 20

export type CreateTaskResult =
  | { readonly ok: true; readonly task: AssistantTaskRecord; readonly existing: boolean }
  | { readonly ok: false; readonly code: 'KIND_UNKNOWN' | 'TEXT_INVALID' | 'TEXT_HAS_LINK' | 'TEXT_HAS_IDENTIFIER' | 'TOO_MANY_TASKS'; readonly reason: string }

/**
 * The tasks the user's own assistant leaves for the user (#547, ADR-0052): what only the user can do
 * in the app. The text comes from an external model, so it is bounded, checked for identifiers and
 * only ever shown as plain text; the reasons of a refusal are German because the assistant reads them.
 */
@Injectable()
export class AssistantTaskService {
  constructor(@Inject(ASSISTANT_TASK_REPOSITORY) private readonly repository: AssistantTaskRepository) {}

  async create(userId: string, taxYear: number, input: NewAssistantTask): Promise<CreateTaskResult> {
    if (!(ASSISTANT_TASK_KINDS as readonly string[]).includes(input.kind)) {
      return { ok: false, code: 'KIND_UNKNOWN', reason: `Die Art muss eine von ${ASSISTANT_TASK_KINDS.join(', ')} sein.` }
    }
    const text = input.text.replace(/\s+/g, ' ').trim()
    if (text.length === 0 || text.length > MAX_TASK_TEXT) {
      return { ok: false, code: 'TEXT_INVALID', reason: `Der Text braucht 1 bis ${MAX_TASK_TEXT} Zeichen.` }
    }
    // The text stands in the app under its name: a link in it could send the user anywhere.
    if (containsLink(text)) {
      return { ok: false, code: 'TEXT_HAS_LINK', reason: 'Der Text darf keinen Link und keine Webadresse enthalten.' }
    }
    try {
      checkPiiFree({ text })
    } catch {
      return {
        ok: false,
        code: 'TEXT_HAS_IDENTIFIER',
        reason: 'Der Text enthält eine Kennung (IBAN oder Steuer-ID). Schreibe die Aufgabe ohne Namen und Kennungen.',
      }
    }
    const open = (await this.repository.listForUserAndYear(userId, taxYear)).filter((t) => t.status === 'offen')
    const same = open.find((t) => t.kind === input.kind && t.text === text)
    if (same !== undefined) return { ok: true, task: same, existing: true }
    if (open.length >= MAX_OPEN_TASKS) {
      return { ok: false, code: 'TOO_MANY_TASKS', reason: `Es sind schon ${MAX_OPEN_TASKS} Aufgaben offen. Der Nutzer muss erst welche erledigen oder verwerfen.` }
    }
    const task = await this.repository.create(userId, taxYear, { kind: input.kind, text, assistant: input.assistant, clientId: input.clientId })
    return { ok: true, task, existing: false }
  }

  /** What the user still has to look at, oldest first. */
  async listOpen(userId: string, taxYear: number): Promise<AssistantTaskRecord[]> {
    return (await this.repository.listForUserAndYear(userId, taxYear)).filter((t) => t.status === 'offen')
  }

  /** The tasks one assistant left, with their state: it sees its own, not another assistant's. */
  async listForAssistant(userId: string, taxYear: number, clientId: string): Promise<AssistantTaskRecord[]> {
    return (await this.repository.listForUserAndYear(userId, taxYear)).filter((t) => t.clientId === clientId)
  }

  /** An open task taken back by the assistant that left it; another's or a decided one stays. */
  async withdrawOwn(userId: string, taxYear: number, taskId: string, clientId: string): Promise<boolean> {
    return this.repository.withdraw(userId, taxYear, taskId, clientId)
  }

  async decide(userId: string, taxYear: number, taskId: string, decision: AssistantTaskDecision): Promise<AssistantTaskRecord> {
    const decided = await this.repository.decide(userId, taxYear, taskId, decision)
    if (decided === null) throw new NotFoundError('TASK_NOT_FOUND', 'There is no open task with this id in this tax year.')
    return decided
  }
}
