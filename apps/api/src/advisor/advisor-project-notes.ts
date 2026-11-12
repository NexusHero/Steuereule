import { scrubUserMessagePii, ADVISOR_NOTES_MAX, tidyNoteText, tidySituationText, type AdvisorNoteChange } from '@steuereule/core'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { type AdvisorNoteRecord, type AdvisorRepository } from './advisor.repository.js'
import type { AdvisorChatMessageDto, AdvisorNoteDto, AdvisorSituationDto } from './dto/advisor.dto.js'
import { toMessageDto, toNoteDto } from './advisor-shared.js'
import type { AdvisorCaseFacts } from './advisor-case-facts.js'

/** The project notes of a tax year: what the user edits, what the owl writes on its own, and how that is undone (#481). */
export class AdvisorProjectNotes {
  constructor(
    private readonly advisorRepo: AdvisorRepository,
    private readonly knownNamesForScrubbing: AdvisorCaseFacts['knownNamesForScrubbing'],
  ) {}

  /** The user's own description of the situation; an empty text while nothing was written (#501). */
  async getSituation(userId: string): Promise<AdvisorSituationDto> {
    const record = await this.advisorRepo.findSituation(userId)
    return { text: record?.text ?? '', updatedAt: record ? record.updatedAt.toISOString() : null }
  }

  /** Stores the description without names or identifiers: what the owl reads in every conversation must not name anyone. */
  async saveSituation(userId: string, taxYear: number, raw: string): Promise<AdvisorSituationDto> {
    const checked = tidySituationText(scrubUserMessagePii(raw, await this.knownNamesForScrubbing(userId, taxYear)))
    if (!checked.ok) throw new InvalidInputError('ADVISOR_SITUATION_INVALID', checked.reason)
    const record = await this.advisorRepo.saveSituation(userId, checked.text)
    return { text: record.text, updatedAt: record.updatedAt.toISOString() }
  }

  async listNotes(userId: string, taxYear: number): Promise<AdvisorNoteDto[]> {
    return (await this.advisorRepo.listNotes(userId, taxYear)).map(toNoteDto)
  }

  /** A note text as it may be stored: one line, within the length, without names or identifiers. */
  async storableNoteText(userId: string, taxYear: number, raw: string): Promise<string> {
    const scrubbed = scrubUserMessagePii(raw, await this.knownNamesForScrubbing(userId, taxYear))
    const text = tidyNoteText(scrubbed)
    if (!text.ok) throw new InvalidInputError('ADVISOR_NOTE_INVALID', text.reason)
    return text.text
  }

  async createNote(userId: string, taxYear: number, raw: string): Promise<AdvisorNoteDto> {
    const text = await this.storableNoteText(userId, taxYear, raw)
    if ((await this.advisorRepo.listNotes(userId, taxYear)).length >= ADVISOR_NOTES_MAX) {
      throw new ConflictError('ADVISOR_NOTE_LIMIT', `Für ein Steuerjahr sind höchstens ${ADVISOR_NOTES_MAX} Notizen möglich. Lösche eine, die nicht mehr gilt.`)
    }
    return toNoteDto(await this.advisorRepo.createNote(userId, taxYear, text, 'user'))
  }

  async ownNote(userId: string, taxYear: number, noteId: string): Promise<AdvisorNoteRecord> {
    const note = await this.advisorRepo.findNote(noteId, userId)
    if (!note || note.taxYear !== taxYear) throw new NotFoundError('ADVISOR_NOTE_NOT_FOUND', 'Diese Notiz gibt es nicht (mehr).')
    return note
  }

  async updateNote(userId: string, taxYear: number, noteId: string, raw: string): Promise<AdvisorNoteDto> {
    const note = await this.ownNote(userId, taxYear, noteId)
    const updated = await this.advisorRepo.updateNote(note.id, userId, await this.storableNoteText(userId, taxYear, raw), 'user')
    return toNoteDto(updated ?? note)
  }

  async deleteNote(userId: string, taxYear: number, noteId: string): Promise<{ deleted: true }> {
    const note = await this.ownNote(userId, taxYear, noteId)
    await this.advisorRepo.deleteNote(note.id, userId)
    return { deleted: true }
  }

  /**
   * Stores what the owl decided to note, replace or forget in an answer. The owl writes notes on
   * its own; the answer carries every change so the user sees it and can take it back.
   */
  async applyNoteChanges(userId: string, taxYear: number, changes: readonly AdvisorNoteChange[] | undefined): Promise<AdvisorNoteChange[]> {
    const applied: AdvisorNoteChange[] = []
    for (const change of changes ?? []) {
      if (change.kind === 'added') {
        if ((await this.advisorRepo.listNotes(userId, taxYear)).length >= ADVISOR_NOTES_MAX) continue
        const note = await this.advisorRepo.createNote(userId, taxYear, change.text, 'owl')
        applied.push({ ...change, noteId: note.id })
      } else if (change.noteId !== undefined) {
        const note = await this.advisorRepo.findNote(change.noteId, userId)
        if (!note || note.taxYear !== taxYear) continue
        if (change.kind === 'replaced') {
          await this.advisorRepo.updateNote(note.id, userId, change.text, 'owl')
          applied.push({ ...change, previousText: note.text })
        } else {
          await this.advisorRepo.deleteNote(note.id, userId)
          applied.push({ ...change, text: note.text })
        }
      }
    }
    return applied
  }

  /** "Rückgängig" under an answer: takes back one change the owl made to the notes. */
  async undoNoteChange(userId: string, taxYear: number, messageId: string, index: number): Promise<AdvisorChatMessageDto> {
    const message = await this.advisorRepo.findMessage(messageId, userId)
    const change = message?.taxYear === taxYear ? message.meta?.noteChanges?.[index] : undefined
    if (!message || !change) throw new NotFoundError('ADVISOR_NOTE_CHANGE_NOT_FOUND', 'Diese Änderung gibt es nicht (mehr).')
    if (change.undone) throw new ConflictError('ADVISOR_NOTE_CHANGE_UNDONE', 'Diese Änderung wurde bereits zurückgenommen.')

    let noteId = change.noteId
    if (change.kind === 'added') {
      if (noteId !== undefined) await this.advisorRepo.deleteNote(noteId, userId)
    } else if (change.kind === 'replaced') {
      if (noteId !== undefined && change.previousText !== undefined) await this.advisorRepo.updateNote(noteId, userId, change.previousText, 'owl')
    } else {
      noteId = (await this.advisorRepo.createNote(userId, taxYear, change.text, 'owl')).id
    }
    const noteChanges = message.meta!.noteChanges!.map((entry, i) => (i === index ? { ...entry, noteId, undone: true as const } : entry))
    return toMessageDto(await this.advisorRepo.updateMessageMeta(message.id, userId, { ...message.meta, noteChanges }))
  }
}
