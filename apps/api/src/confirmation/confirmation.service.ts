import { Inject, Injectable } from '@nestjs/common'
import { ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  ANNEXES,
  YEAR_INDEPENDENT,
  annexOf,
  decideWriting,
  missingConfirmations,
  isYearIndependent,
  acceptProposal,
  dismissProposal,
  decomposeProvenanceKey,
  type Annex,
  type Provenance,
  type Marking,
  type Screen,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRecord, type ProvenanceRepository } from '../marking/marking.repository.js'
import { FIELD_ACCESS, type FieldAccess, type ScreenAccess } from './field-access.js'
import type { ConfirmationResponseDto, ProvenanceDto, FieldProvenanceDto } from './dto/confirmation.dto.js'

export type WriteResult = 'geschrieben' | 'vorschlag' | 'unveraendert'

export const AI_FORBIDDEN_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

export function assertAiWritableScreen(screen: Screen, key?: string): void {
  if (AI_FORBIDDEN_SCREENS.has(screen)) {
    throw new ForbiddenError(
      'AI_WRITE_FORBIDDEN',
      `Felder der Maske "${key ?? screen}" dürfen niemals durch den Eulen-Modus geschrieben werden.`,
    )
  }
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
  ) {}

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

  async readRawValue(userId: string, taxYear: number, key: string): Promise<string | null> {
    const a = this.address(key, taxYear)
    return this.currentValue(userId, a)
  }

  /**
   * Direct user-confirmed write triggered by clicking "✓ Jetzt übernehmen" on an In-App
   * SteuerEule Action Card. Writes the value, records provenance `{ kind: 'assistent', name: 'SteuerEule' }`
   * with `confirmed: true` (no double confirmation needed), and returns the previous value for 1-click Undo.
   */
  async writeConfirmedByAdvisor(
    userId: string,
    taxYear: number,
    key: string,
    newValue: string | null,
  ): Promise<{ previousValue: string | null }> {
    const a = this.address(key, taxYear)
    assertAiWritableScreen(a.screen, key)
    const previousValue = await this.currentValue(userId, a)
    await this.writeValue(userId, a, newValue)
    await this.repository.save(userId, a.taxYear, {
      key,
      provenance: { kind: 'assistent', name: 'SteuerEule' },
      confirmed: true,
      proposal: null,
    })
    return { previousValue }
  }

  /**
   * 1-click Undo ("↩ Rückgängig machen") for an applied SteuerEule Action Card.
   * Restores the exact previous value and removes the advisor marking.
   */
  async restoreValueByAdvisor(
    userId: string,
    taxYear: number,
    key: string,
    previousValue: string | null,
  ): Promise<void> {
    const a = this.address(key, taxYear)
    assertAiWritableScreen(a.screen, key)
    await this.writeValue(userId, a, previousValue)
    await this.repository.remove(userId, a.taxYear, [key])
  }


  async list(userId: string, taxYear: number): Promise<ProvenanceRecord[]> {
    return this.repository.listForUserAndYears(userId, [taxYear, YEAR_INDEPENDENT])
  }

  async missing(userId: string, taxYear: number): Promise<string[]> {
    return missingConfirmations((await this.list(userId, taxYear)).map((r) => ({ ...r, value: null })))
  }

  async overview(userId: string, taxYear: number): Promise<ConfirmationResponseDto> {
    const open = (await this.list(userId, taxYear)).filter((r) => !r.confirmed || r.proposal !== null)
    if (open.length === 0) return { annexes: [] }
    await this.auditService.append({ userId, action: 'READ', resource: 'kennzeichnung' })

    const read = new Map<string, Promise<Readonly<Record<string, string | null>> | null>>()
    const values: { annex: Annex; dto: FieldProvenanceDto }[] = []
    for (const r of open) {
      const { screen, instance, field } = decomposeProvenanceKey(r.key)
      const access = this.access[screen]
      const cacheKey = `${r.taxYear}|${screen}|${instance ?? ''}`
      if (access !== undefined && !read.has(cacheKey)) read.set(cacheKey, access.read(userId, r.taxYear, instance))
      const fields = access === undefined ? null : await read.get(cacheKey)
      values.push({
        annex: annexOf(r.key),
        dto: {
          key: r.key,
          screen,
          instance,
          field,
          value: fields?.[field] ?? null,
          provenance: provenanceDto(r.provenance),
          confirmed: r.confirmed,
          proposal: r.proposal === null ? null : { value: r.proposal.value, provenance: provenanceDto(r.proposal.provenance) },
        },
      })
    }
    return {
      annexes: ANNEXES.flatMap((annex) => {
        const own = values.filter((w) => w.annex === annex).map((w) => w.dto)
        return own.length === 0 ? [] : [{ annex, unconfirmed: own.filter((w) => !w.confirmed).length, values: own }]
      }),
    }
  }

  async confirmAnnex(userId: string, taxYear: number, annex: Annex): Promise<ConfirmationResponseDto> {
    if (!(ANNEXES as readonly string[]).includes(annex)) throw new InvalidInputError('ANLAGE_UNKNOWN', `"${annex}" is not an Anlage.`)
    await this.repository.confirmAnnex(userId, [taxYear, YEAR_INDEPENDENT], annex)
    return this.overview(userId, taxYear)
  }

  async decideProposal(userId: string, taxYear: number, key: string, decision: 'annehmen' | 'verwerfen'): Promise<ConfirmationResponseDto> {
    const a = this.address(key, taxYear)
    const existing = await this.repository.find(userId, a.taxYear, key)
    if (existing === null || existing.proposal === null) throw new NotFoundError('PROPOSAL_NOT_FOUND', `There is no open proposal for "${key}".`)
    const marking: Marking = { ...existing, value: await this.currentValue(userId, a) }
    if (decision === 'annehmen') {
      const assumed = acceptProposal(marking)
      await this.writeValue(userId, a, assumed.value)
      await this.repository.save(userId, a.taxYear, assumed)
    } else {
      const rest = dismissProposal(marking)
      if (rest === null) await this.repository.remove(userId, a.taxYear, [key])
      else await this.repository.save(userId, a.taxYear, rest)
    }
    return this.overview(userId, taxYear)
  }
}
