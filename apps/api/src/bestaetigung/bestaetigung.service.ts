import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
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
  type Kennzeichnung,
  type Screen,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRecord, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { FIELD_ACCESS, type FieldAccess, type ScreenAccess } from './feld-zugriff.js'
import type { ConfirmationResponseDto, ProvenanceDto, FieldProvenanceDto } from './dto/bestaetigung.dto.js'

export type WriteResult = 'geschrieben' | 'vorschlag' | 'unveraendert'

interface Address {
  key: string
  screen: Screen
  instance: string | null
  field: string
  steuerjahr: number
  access: ScreenAccess
}

function provenanceDto(h: Provenance): ProvenanceDto {
  switch (h.art) {
    case 'nutzer':
      return { art: 'nutzer' }
    case 'uebernahme':
      return { art: 'uebernahme', vorjahr: h.vorjahr }
    case 'assistent':
      return h.receiptId === undefined ? { art: 'assistent', name: h.name } : { art: 'assistent', name: h.name, receiptId: h.receiptId }
    case 'beleg':
      return { art: 'beleg', receiptId: h.receiptId }
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

  private address(key: string, steuerjahr: number): Address {
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
    return { key, ...parts, steuerjahr: isYearIndependent(key) ? YEAR_INDEPENDENT : steuerjahr, access }
  }

  private async currentValue(userId: string, a: Address): Promise<string | null> {
    const values = await a.access.read(userId, a.steuerjahr, a.instance)
    if (values === null) throw new NotFoundError('FIELD_NOT_FOUND', `"${a.key}" does not exist in this tax year.`)
    return values[a.field] ?? null
  }

  private async writeValue(userId: string, a: Address, value: string | null): Promise<void> {
    if (!(await a.access.write(userId, a.steuerjahr, a.instance, a.field, value))) {
      throw new NotFoundError('FIELD_NOT_FOUND', `"${a.key}" does not exist in this tax year.`)
    }
  }

  async write(userId: string, steuerjahr: number, key: string, newValue: string | null, provenance: Provenance): Promise<WriteResult> {
    if (provenance.art === 'nutzer') throw new Error('BestaetigungService.schreibe is for non-user writes; the masks handle user writes.')
    const a = this.address(key, steuerjahr)
    const currentValue = await this.currentValue(userId, a)
    const existing = await this.repository.find(userId, a.steuerjahr, key)
    const decision = decideWriting({ key, existing: existing === null ? null : { ...existing, value: currentValue }, currentValue, newValue, provenance })
    switch (decision.art) {
      case 'unveraendert':
        return 'unveraendert'
      case 'vorschlag':
        await this.repository.save(userId, a.steuerjahr, decision.marking)
        return 'vorschlag'
      case 'schreiben':
        await this.writeValue(userId, a, newValue)
        if (decision.marking === null) await this.repository.remove(userId, a.steuerjahr, [key])
        else await this.repository.save(userId, a.steuerjahr, decision.marking)
        return 'geschrieben'
    }
  }

  async list(userId: string, steuerjahr: number): Promise<ProvenanceRecord[]> {
    return this.repository.listForUserAndYears(userId, [steuerjahr, YEAR_INDEPENDENT])
  }

  async missing(userId: string, steuerjahr: number): Promise<string[]> {
    return missingConfirmations((await this.list(userId, steuerjahr)).map((r) => ({ ...r, value: null })))
  }

  async overview(userId: string, steuerjahr: number): Promise<ConfirmationResponseDto> {
    const open = (await this.list(userId, steuerjahr)).filter((r) => !r.bestaetigt || r.proposal !== null)
    if (open.length === 0) return { annexes: [] }
    await this.auditService.append({ userId, action: 'READ', resource: 'kennzeichnung' })

    const read = new Map<string, Promise<Readonly<Record<string, string | null>> | null>>()
    const values: { anlage: Annex; dto: FieldProvenanceDto }[] = []
    for (const r of open) {
      const { screen, instance, field } = decomposeProvenanceKey(r.key)
      const access = this.access[screen]
      const cacheKey = `${r.steuerjahr}|${screen}|${instance ?? ''}`
      if (access !== undefined && !read.has(cacheKey)) read.set(cacheKey, access.read(userId, r.steuerjahr, instance))
      const fields = access === undefined ? null : await read.get(cacheKey)
      values.push({
        anlage: annexOf(r.key),
        dto: {
          key: r.key,
          screen,
          instance,
          field,
          value: fields?.[field] ?? null,
          provenance: provenanceDto(r.provenance),
          bestaetigt: r.bestaetigt,
          proposal: r.proposal === null ? null : { value: r.proposal.value, provenance: provenanceDto(r.proposal.provenance) },
        },
      })
    }
    return {
      annexes: ANNEXES.flatMap((anlage) => {
        const own = values.filter((w) => w.anlage === anlage).map((w) => w.dto)
        return own.length === 0 ? [] : [{ anlage, unconfirmed: own.filter((w) => !w.bestaetigt).length, values: own }]
      }),
    }
  }

  async confirmAnnex(userId: string, steuerjahr: number, anlage: Annex): Promise<ConfirmationResponseDto> {
    if (!(ANNEXES as readonly string[]).includes(anlage)) throw new InvalidInputError('ANLAGE_UNKNOWN', `"${anlage}" is not an Anlage.`)
    await this.repository.confirmAnnex(userId, [steuerjahr, YEAR_INDEPENDENT], anlage)
    return this.overview(userId, steuerjahr)
  }

  async decideProposal(userId: string, steuerjahr: number, key: string, decision: 'annehmen' | 'verwerfen'): Promise<ConfirmationResponseDto> {
    const a = this.address(key, steuerjahr)
    const existing = await this.repository.find(userId, a.steuerjahr, key)
    if (existing === null || existing.proposal === null) throw new NotFoundError('PROPOSAL_NOT_FOUND', `There is no open proposal for "${key}".`)
    const marking: Kennzeichnung = { ...existing, value: await this.currentValue(userId, a) }
    if (decision === 'annehmen') {
      const assumed = acceptProposal(marking)
      await this.writeValue(userId, a, assumed.value)
      await this.repository.save(userId, a.steuerjahr, assumed)
    } else {
      const rest = dismissProposal(marking)
      if (rest === null) await this.repository.remove(userId, a.steuerjahr, [key])
      else await this.repository.save(userId, a.steuerjahr, rest)
    }
    return this.overview(userId, steuerjahr)
  }
}
