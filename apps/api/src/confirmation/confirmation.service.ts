import { createHash } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConflictError, ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  validateFieldValue,
  ANNEXES,
  YEAR_INDEPENDENT,
  annexOf,
  decideWriting,
  missingConfirmations,
  isYearIndependent,
  acceptProposal,
  dismissProposal,
  decomposeProvenanceKey,
  type AdvisorUndoEntry,
  type Annex,
  type Provenance,
  type Marking,
  type Screen,
} from '@steuereule/core'
import { AssistantTaskService } from '../assistant-task/assistant-task.service.js'
import type { AssistantTaskDecision } from '../assistant-task/assistant-task.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../common/transaction-runner.js'
import { LinkService } from '../link/link.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRecord, type ProvenanceRepository } from '../marking/marking.repository.js'
import { assertAiWritable } from './ai-write-policy.js'
import { FIELD_ACCESS, type FieldAccess, type ScreenAccess } from './field-access.js'
import type { AssistantTaskDto, ConfirmationResponseDto, ProvenanceDto, FieldProvenanceDto } from './dto/confirmation.dto.js'

export type WriteResult = 'geschrieben' | 'vorschlag' | 'unveraendert'

/** A value as „Prüfen & bestätigen“ showed it: confirming binds to exactly these (MCP-4). */
export interface ShownValue {
  readonly key: string
  readonly version: string
  readonly person?: 'B' | undefined
}

/**
 * What the user saw of a field: its value, where it came from and any proposal. A value the assistant wrote
 * after the screen was drawn has another version, so the confirmation that did not show it is refused.
 */
export function valueVersion(dto: Pick<FieldProvenanceDto, 'key' | 'value' | 'provenance' | 'confirmed' | 'proposal'>): string {
  return createHash('sha256').update(JSON.stringify([dto.key, dto.value, dto.provenance, dto.confirmed, dto.proposal])).digest('base64url').slice(0, 22)
}

/** Which record a field belongs to, in words the user knows (MCP-5): the child's first name, the object's address. */
function instanceLabelOf(screen: Screen, fields: Readonly<Record<string, string | null>> | null | undefined): string | null {
  if (!fields) return null
  const words = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim() ?? '').filter((p) => p !== '').join(' ')
  if (screen === 'kind') return words(fields.firstName) || null
  if (screen === 'vermietung') return [words(fields.strasse, fields.hausnummer), words(fields.city)].filter((p) => p !== '').join(', ') || null
  return null
}

export function staleValueConflict(key: string, currentValue: string | null): ConflictError {
  return new ConflictError('ADVISOR_ACTION_STALE_CONFLICT', `Das Feld "${key}" wurde zwischenzeitlich manuell geändert.`, {
    conflicts: [{ key, currentValue }],
  })
}

interface Address {
  key: string
  screen: Screen
  instance: string | null
  field: string
  taxYear: number
  access: ScreenAccess
}

function provenanceDto(h: Provenance): ProvenanceDto {
  switch (h.kind) {
    case 'nutzer':
      return { kind: 'nutzer' }
    case 'uebernahme':
      return { kind: 'uebernahme', lastYear: h.lastYear }
    case 'assistent':
      return h.receiptId === undefined ? { kind: 'assistent', name: h.name } : { kind: 'assistent', name: h.name, receiptId: h.receiptId }
    case 'beleg':
      return { kind: 'beleg', receiptId: h.receiptId }
  }
}

/** §6/§7 — Herkunft und Bestätigung je Feld. */
@Injectable()
export class ConfirmationService {
  constructor(
    @Inject(PROVENANCE_REPOSITORY) private readonly repository: ProvenanceRepository,
    @Inject(FIELD_ACCESS) private readonly access: FieldAccess,
    @Inject(AuditService) private readonly auditService: AuditService,
    /** Whose figures the user records as Person B (ADR-0054): their values are confirmed here too. */
    @Optional() @Inject(LinkService) private readonly link?: Pick<LinkService, 'spouseForAdvisor'>,
    /** The tasks the user's assistant left (#547); without the seam the overview carries none. */
    @Optional() @Inject(AssistantTaskService) private readonly tasks?: Pick<AssistantTaskService, 'listOpen' | 'decide'>,
    /** Read, decide and write one field as a unit (MCP-16); without a runner (unit tests) the steps run as they are. */
    @Optional() @Inject(TRANSACTION_RUNNER) private readonly transactions?: TransactionRunner,
  ) {}

  private inTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.transactions === undefined ? work() : this.transactions.run(work)
  }

  /** The open tasks of the user's own account, as the Cockpit and the confirmation screen show them. */
  private async openTasks(userId: string, taxYear: number): Promise<AssistantTaskDto[]> {
    const open = (await this.tasks?.listOpen(userId, taxYear)) ?? []
    if (open.length > 0) await this.auditService.append({ userId, action: 'READ', resource: 'assistent-aufgabe' })
    return open.map((t) => ({ id: t.id, kind: t.kind, text: t.text, assistant: t.assistant, createdAt: t.createdAt.toISOString() }))
  }

  /** The user settles or discards a task; the assistant reads the state with `aufgaben_auflisten`. */
  async decideTask(userId: string, taxYear: number, taskId: string, decision: AssistantTaskDecision): Promise<ConfirmationResponseDto> {
    if (this.tasks === undefined) throw new NotFoundError('TASK_NOT_FOUND', 'There is no open task with this id in this tax year.')
    await this.tasks.decide(userId, taxYear, taskId, decision)
    return this.overview(userId, taxYear)
  }

  /** The Person B whose data the user records in a joint return; null when B keeps an own account. */
  private async recordedSpouse(userId: string, taxYear: number): Promise<string | null> {
    const spouse = await this.link?.spouseForAdvisor(userId, taxYear)
    return spouse?.recordable ? spouse.spouseUserId : null
  }

  private async dataUserFor(userId: string, taxYear: number, person: 'A' | 'B'): Promise<string> {
    if (person === 'A') return userId
    const spouse = await this.recordedSpouse(userId, taxYear)
    if (spouse === null) throw new ForbiddenError('PERSON_B_OWNS_DATA', 'Person B maintains their data in their own account.')
    return spouse
  }

  private address(key: string, taxYear: number): Address {
    let parts: ReturnType<typeof decomposeProvenanceKey>
    try {
      parts = decomposeProvenanceKey(key)
    } catch {
      throw new InvalidInputError('FIELD_UNKNOWN', `"${key}" is not a known field.`)
    }
    const access = this.access[parts.screen]
    if (access === undefined || !access.fields.includes(parts.field) || access.withInstance !== (parts.instance !== null)) {
      throw new InvalidInputError('FIELD_NOT_WRITABLE', `"${key}" is not a field that can be written here.`)
    }
    return { key, ...parts, taxYear: isYearIndependent(key) ? YEAR_INDEPENDENT : taxYear, access }
  }

  private async currentValue(userId: string, a: Address): Promise<string | null> {
    const values = await a.access.read(userId, a.taxYear, a.instance)
    if (values === null) throw new NotFoundError('FIELD_NOT_FOUND', `"${a.key}" does not exist in this tax year.`)
    return values[a.field] ?? null
  }

  private async writeValue(userId: string, a: Address, value: string | null): Promise<void> {
    if (!(await a.access.write(userId, a.taxYear, a.instance, a.field, value))) {
      throw new NotFoundError('FIELD_NOT_FOUND', `"${a.key}" does not exist in this tax year.`)
    }
  }

  async write(userId: string, taxYear: number, key: string, newValue: string | null, provenance: Provenance): Promise<WriteResult> {
    if (provenance.kind === 'nutzer') throw new Error('BestaetigungService.schreibe is for non-user writes; the masks handle user writes.')
    const a = this.address(key, taxYear)
    // The value read, the decision and the write see one snapshot: a user write in between cannot be overwritten (MCP-16).
    return this.inTransaction(() => this.writeDecided(userId, a, key, newValue, provenance))
  }

  private async writeDecided(userId: string, a: Address, key: string, newValue: string | null, provenance: Provenance): Promise<WriteResult> {
    const currentValue = await this.currentValue(userId, a)
    const existing = await this.repository.find(userId, a.taxYear, key)
    const decision = decideWriting({ key, existing: existing === null ? null : { ...existing, value: currentValue }, currentValue, newValue, provenance })
    switch (decision.kind) {
      case 'unveraendert':
        return 'unveraendert'
      case 'vorschlag':
        await this.repository.save(userId, a.taxYear, decision.marking)
        return 'vorschlag'
      case 'schreiben':
        await this.writeValue(userId, a, newValue)
        if (decision.marking === null) await this.repository.remove(userId, a.taxYear, [key])
        else await this.repository.save(userId, a.taxYear, decision.marking)
        return 'geschrieben'
    }
  }

  /**
   * The value in a field and the document it came from (ADR-0092): a value applied from a Beleg names its
   * receipt; one typed by hand, told in the chat or taken over from last year names none. A field whose
   * record does not exist yet holds nothing.
   */
  async valueWithSource(userId: string, taxYear: number, key: string): Promise<{ value: string | null; receiptId: string | null }> {
    const a = this.address(key, taxYear)
    const values = await a.access.read(userId, a.taxYear, a.instance)
    const value = values?.[a.field] ?? null
    if (value === null) return { value: null, receiptId: null }
    const provenance = (await this.repository.find(userId, a.taxYear, key))?.provenance
    const receiptId = provenance?.kind === 'beleg' ? provenance.receiptId : provenance?.kind === 'assistent' ? (provenance.receiptId ?? null) : null
    return { value, receiptId }
  }

  /**
   * Several fields of one person at once, each record read once. A field that cannot be read here
   * (no such field, no record yet) reads as empty: the caller asks what is empty (ADR-0091, Nachtrag).
   */
  async readRawValues(userId: string, taxYear: number, keys: readonly string[]): Promise<Record<string, string | null>> {
    const records = new Map<string, Promise<Record<string, string | null> | null>>()
    const out: Record<string, string | null> = {}
    for (const key of keys) {
      let a: Address
      try {
        a = this.address(key, taxYear)
      } catch {
        out[key] = null
        continue
      }
      const recordKey = `${a.screen}:${a.instance ?? ''}:${a.taxYear}`
      if (!records.has(recordKey)) records.set(recordKey, a.access.read(userId, a.taxYear, a.instance).catch(() => null))
      out[key] = (await records.get(recordKey))?.[a.field] ?? null
    }
    return out
  }

  async readRawValue(userId: string, taxYear: number, key: string): Promise<string | null> {
    const a = this.address(key, taxYear)
    return this.currentValue(userId, a)
  }

  /**
   * User-confirmed write of an Eulen-Modus draft ("✓ Jetzt übernehmen"). The field policy is
   * enforced here, on the write path, not only when the draft was proposed. With
   * `expectedCurrentValue` the write is a compare-and-set; inside a TransactionRunner the
   * comparison and the write see the same snapshot.
   */
  async writeConfirmedByAdvisor(
    userId: string,
    taxYear: number,
    key: string,
    newValue: string | null,
    expectedCurrentValue?: string | null,
    provenanceOverride?: Provenance,
    /** The user consented to personal data for the owl (ADR-0091): the identifying fields are open. */
    options: { readonly personalDataConsent?: boolean } = {},
  ): Promise<AdvisorUndoEntry> {
    const a = this.address(key, taxYear)
    assertAiWritable(a.screen, a.field, key, options.personalDataConsent === true)
    // The catalogue's value check on the write itself (ADR-0066): a draft made before a rule
    // existed, or by a path that skipped the check, still cannot store a value the field cannot hold.
    let valueToStore = newValue
    if (newValue !== null) {
      const check = validateFieldValue(a.screen, a.field, newValue)
      if (!check.ok) throw new InvalidInputError('FIELD_VALUE_INVALID', `"${key}": ${check.reason}`)
      valueToStore = check.value
    }
    const previousValue = await this.currentValue(userId, a)
    if (expectedCurrentValue !== undefined && previousValue !== expectedCurrentValue) {
      throw staleValueConflict(key, previousValue)
    }
    const existing = await this.repository.find(userId, a.taxYear, key)
    await this.writeValue(userId, a, valueToStore)
    await this.repository.save(userId, a.taxYear, {
      key,
      provenance: provenanceOverride ?? { kind: 'assistent', name: 'SteuerEule' },
      confirmed: true,
      proposal: null,
    })
    return {
      key,
      previousValue,
      appliedValue: valueToStore,
      previousMarking:
        existing === null ? null : { provenance: existing.provenance, confirmed: existing.confirmed, proposal: existing.proposal },
    }
  }

  /**
   * 1-click undo of an applied draft: restores value and provenance exactly as they were,
   * but only while the field still holds what the Eule wrote — a later manual edit wins.
   */
  async restoreByAdvisor(userId: string, taxYear: number, entry: AdvisorUndoEntry, options: { readonly personalDataConsent?: boolean } = {}): Promise<void> {
    const a = this.address(entry.key, taxYear)
    assertAiWritable(a.screen, a.field, entry.key, options.personalDataConsent === true)
    const currentValue = await this.currentValue(userId, a)
    if (currentValue !== entry.appliedValue) throw staleValueConflict(entry.key, currentValue)
    await this.writeValue(userId, a, entry.previousValue)
    if (entry.previousMarking === null) await this.repository.remove(userId, a.taxYear, [entry.key])
    else await this.repository.save(userId, a.taxYear, { key: entry.key, ...entry.previousMarking })
  }

  async list(userId: string, taxYear: number): Promise<ProvenanceRecord[]> {
    return this.repository.listForUserAndYears(userId, [taxYear, YEAR_INDEPENDENT])
  }

  /** The markings of several tax years in one read (the MCP take-back of a receipt looks for every entry naming it). */
  async listForYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]> {
    return this.repository.listForUserAndYears(userId, taxYears)
  }

  async missing(userId: string, taxYear: number): Promise<string[]> {
    return missingConfirmations((await this.list(userId, taxYear)).map((r) => ({ ...r, value: null })))
  }

  async overview(userId: string, taxYear: number): Promise<ConfirmationResponseDto> {
    const values = await this.openValues(userId, taxYear)
    const tasks = await this.openTasks(userId, taxYear)
    return {
      tasks,
      annexes: ANNEXES.flatMap((annex) => {
        const own = values.filter((w) => w.annex === annex).map((w) => w.dto)
        return own.length === 0 ? [] : [{ annex, unconfirmed: own.filter((w) => !w.confirmed).length, values: own }]
      }),
    }
  }

  /** Every unconfirmed value and open proposal of the user and of the Person B she records, as the screen shows them. */
  private async openValues(userId: string, taxYear: number): Promise<{ annex: Annex; dataUserId: string; dto: FieldProvenanceDto }[]> {
    const spouse = await this.recordedSpouse(userId, taxYear)
    const isOpen = (r: ProvenanceRecord) => !r.confirmed || r.proposal !== null
    const open = [
      ...(await this.list(userId, taxYear)).filter(isOpen).map((record) => ({ record, dataUserId: userId, person: undefined })),
      ...(spouse === null ? [] : (await this.list(spouse, taxYear)).filter(isOpen).map((record) => ({ record, dataUserId: spouse, person: 'B' as const }))),
    ]
    if (open.length === 0) return []
    await this.auditService.append({ userId, action: 'READ', resource: 'kennzeichnung' })

    const read = new Map<string, Promise<Readonly<Record<string, string | null>> | null>>()
    const values: { annex: Annex; dataUserId: string; dto: FieldProvenanceDto }[] = []
    for (const { record: r, dataUserId, person } of open) {
      const { screen, instance, field } = decomposeProvenanceKey(r.key)
      const access = this.access[screen]
      const cacheKey = `${dataUserId}|${r.taxYear}|${screen}|${instance ?? ''}`
      if (access !== undefined && !read.has(cacheKey)) read.set(cacheKey, access.read(dataUserId, r.taxYear, instance))
      const fields = access === undefined ? null : await read.get(cacheKey)
      const shown = {
        key: r.key,
        value: fields?.[field] ?? null,
        provenance: provenanceDto(r.provenance),
        confirmed: r.confirmed,
        proposal: r.proposal === null ? null : { value: r.proposal.value, provenance: provenanceDto(r.proposal.provenance) },
      }
      values.push({
        annex: annexOf(r.key),
        dataUserId,
        dto: {
          ...shown,
          screen,
          instance,
          instanceLabel: instance === null ? null : instanceLabelOf(screen, fields),
          field,
          version: valueVersion(shown),
          ...(person === undefined ? {} : { person }),
        },
      })
    }
    return values
  }

  /**
   * Confirms the unconfirmed values of an Anlage — exactly those the user was shown (MCP-4). When any of them
   * changed since, or a value came in that the screen did not show, nothing is confirmed and the user looks again.
   * Person B's values the user records are confirmed with hers (ADR-0054).
   */
  async confirmAnnex(userId: string, taxYear: number, annex: Annex, shown: readonly ShownValue[]): Promise<ConfirmationResponseDto> {
    if (!(ANNEXES as readonly string[]).includes(annex)) throw new InvalidInputError('ANLAGE_UNKNOWN', `"${annex}" is not an Anlage.`)
    await this.inTransaction(async () => {
      const current = (await this.openValues(userId, taxYear)).filter((v) => v.annex === annex && !v.dto.confirmed)
      const id = (person: 'B' | undefined, key: string) => `${person ?? 'A'}|${key}`
      const seen = new Map(shown.map((s) => [id(s.person, s.key), s.version]))
      if (current.length !== seen.size || current.some((v) => seen.get(id(v.dto.person, v.dto.key)) !== v.dto.version)) {
        throw new ConflictError('CONFIRMATION_STALE', 'Seit du die Werte gesehen hast, hat sich etwas geändert. Prüf sie bitte noch einmal.')
      }
      for (const dataUserId of new Set(current.map((v) => v.dataUserId))) {
        const keys = current.filter((v) => v.dataUserId === dataUserId).map((v) => v.dto.key)
        await this.repository.confirmKeys(dataUserId, [taxYear, YEAR_INDEPENDENT], annex, keys)
      }
    })
    return this.overview(userId, taxYear)
  }

  /**
   * The user's assistant takes back what it entered itself (ADR-0052 amendment 2): its unconfirmed value
   * is cleared, or its proposal on a value the user confirmed is dropped. Anything the user entered or
   * confirmed, and anything another assistant wrote, stays.
   */
  async withdrawAssistantEntry(userId: string, taxYear: number, key: string, own: (provenance: Provenance | undefined) => boolean): Promise<'zurueckgenommen' | 'vorschlag-entfernt'> {
    const a = this.address(key, taxYear)
    const existing = await this.repository.find(userId, a.taxYear, key)
    if (existing?.proposal && own(existing.proposal.provenance)) {
      const rest = dismissProposal({ ...existing, value: await this.currentValue(userId, a) })
      if (rest === null) await this.repository.remove(userId, a.taxYear, [key])
      else await this.repository.save(userId, a.taxYear, rest)
      return 'vorschlag-entfernt'
    }
    if (existing && !existing.confirmed && existing.proposal === null && own(existing.provenance)) {
      await this.writeValue(userId, a, null)
      await this.repository.remove(userId, a.taxYear, [key])
      return 'zurueckgenommen'
    }
    throw new ForbiddenError('NOT_OWN_ENTRY', `"${key}" is not an unconfirmed entry of this assistant; the user changes it in the app.`)
  }

  /** Drops the markings of a record that is gone (a child the assistant removed). */
  async forget(userId: string, taxYear: number, keys: readonly string[]): Promise<void> {
    if (keys.length > 0) await this.repository.remove(userId, taxYear, keys)
  }

  /** Values a non-user wrote outside this service (a child the assistant created): unconfirmed, with their source. */
  async markUnconfirmed(userId: string, taxYear: number, keys: readonly string[], provenance: Provenance): Promise<void> {
    if (provenance.kind === 'nutzer') throw new Error('markUnconfirmed is for non-user writes.')
    for (const key of keys) {
      const a = this.address(key, taxYear)
      await this.repository.save(userId, a.taxYear, { key, provenance, confirmed: false, proposal: null })
    }
  }

  /**
   * A value a non-user offers that must not be written before the user takes it (a booking draft of the
   * user's assistant, ADR-0052 amendment 6): an open proposal on an empty field, decided with
   * `decideProposal`. Only for a field no one has marked yet.
   */
  async fileProposal(userId: string, taxYear: number, key: string, value: string, provenance: Provenance): Promise<void> {
    if (provenance.kind === 'nutzer') throw new Error('fileProposal is for non-user proposals.')
    const a = this.address(key, taxYear)
    if ((await this.repository.find(userId, a.taxYear, key)) !== null || (await this.currentValue(userId, a)) !== null) {
      throw new ConflictError('PROPOSAL_TARGET_TAKEN', `"${key}" already holds a value or a marking.`)
    }
    await this.repository.save(userId, a.taxYear, { key, provenance: { kind: 'nutzer' }, confirmed: true, proposal: { value, provenance } })
  }

  async decideProposal(userId: string, taxYear: number, key: string, decision: 'annehmen' | 'verwerfen', person: 'A' | 'B' = 'A'): Promise<ConfirmationResponseDto> {
    const dataUserId = await this.dataUserFor(userId, taxYear, person)
    const a = this.address(key, taxYear)
    const existing = await this.repository.find(dataUserId, a.taxYear, key)
    if (existing === null || existing.proposal === null) throw new NotFoundError('PROPOSAL_NOT_FOUND', `There is no open proposal for "${key}".`)
    const marking: Marking = { ...existing, value: await this.currentValue(dataUserId, a) }
    if (decision === 'annehmen') {
      const assumed = acceptProposal(marking)
      await this.writeValue(dataUserId, a, assumed.value)
      await this.repository.save(dataUserId, a.taxYear, assumed)
    } else {
      const rest = dismissProposal(marking)
      if (rest === null) await this.repository.remove(dataUserId, a.taxYear, [key])
      else await this.repository.save(dataUserId, a.taxYear, rest)
    }
    return this.overview(userId, taxYear)
  }
}
