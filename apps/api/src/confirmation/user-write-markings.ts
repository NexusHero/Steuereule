import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { YEAR_INDEPENDENT, decomposeProvenanceKey, isYearIndependent, provenanceKey, type Screen } from '@steuereule/core'
import { LinkService } from '../link/link.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRecord, type ProvenanceRepository } from '../marking/marking.repository.js'
import { FIELD_ACCESS, type FieldAccess } from './field-access.js'

/** A record that could not be read: nothing is concluded from it. */
const UNREADABLE = Symbol('unreadable')

/** `undefined`: the record the field belongs to does not exist. */
type FieldValue = string | null | undefined | typeof UNREADABLE

/** What a field held before the user's write, and the marking on it then. */
interface Before {
  readonly owner: string
  readonly record: ProvenanceRecord
  readonly value: FieldValue
}

export interface UserWriteSnapshot {
  readonly owners: readonly string[]
  readonly years: readonly number[]
  readonly screens: ReadonlySet<Screen>
  readonly before: readonly Before[]
}

const sameMarking = (a: ProvenanceRecord, b: ProvenanceRecord): boolean =>
  a.updatedAt?.getTime() === b.updatedAt?.getTime() &&
  a.confirmed === b.confirmed &&
  JSON.stringify(a.provenance) === JSON.stringify(b.provenance) &&
  JSON.stringify(a.proposal) === JSON.stringify(b.proposal)

/**
 * „The user wins“ (ADR-0052 §7, amendment 1) for every write the user makes on a mask, in one place: a
 * field the user changed counts as the user's own, so its marking goes (and with it any proposal on the
 * value it replaced). A record the user deleted takes its markings along. The masks' services know
 * nothing of markings; the `@UserWrite` interceptor runs every user write route through here.
 *
 * Only a marking the write itself left untouched is settled: a write that sets its own provenance (a
 * scanned certificate's „Aus Beleg“) keeps it, and so does a marking someone else changed meanwhile.
 */
@Injectable()
export class UserWriteMarkings {
  private readonly logger = new Logger(UserWriteMarkings.name)

  constructor(
    @Inject(PROVENANCE_REPOSITORY) private readonly markings: ProvenanceRepository,
    @Inject(FIELD_ACCESS) private readonly access: FieldAccess,
    /** Whose figures the user records as Person B (ADR-0054): a write with `?person=B` changes hers. */
    @Optional() @Inject(LinkService) private readonly link?: Pick<LinkService, 'spouseForAdvisor'>,
  ) {}

  /** Runs one user write and settles the markings it made stale. */
  async around<T>(userId: string, taxYear: number | null, screens: readonly Screen[], write: () => Promise<T>): Promise<T> {
    const snapshot = await this.snapshot(userId, taxYear, screens)
    let result: T
    try {
      result = await write()
    } catch (error) {
      // A refused write may still have changed part of the mask. The caller gets the write's own error,
      // never a failure of the settling that follows it.
      await this.settle(snapshot).catch((settleError: unknown) => {
        this.logger.error(`Markings not settled after a failed write: ${settleError instanceof Error ? settleError.message : String(settleError)}`)
      })
      throw error
    }
    await this.settle(snapshot)
    return result
  }

  async snapshot(userId: string, taxYear: number | null, screens: readonly Screen[]): Promise<UserWriteSnapshot> {
    const wanted = new Set(screens)
    const years = [...new Set([...screens].map((screen) => (isYearIndependent(provenanceKey(screen, 'x')) ? YEAR_INDEPENDENT : taxYear)))].filter(
      (year): year is number => year !== null,
    )
    const spouse = taxYear === null ? null : await this.link?.spouseForAdvisor(userId, taxYear)
    const owners = spouse?.recordable ? [userId, spouse.spouseUserId] : [userId]
    const before: Before[] = []
    if (years.length === 0) return { owners, years, screens: wanted, before }
    for (const owner of owners) {
      const records = (await this.markings.listForUserAndYears(owner, years)).filter((r) => wanted.has(decomposeProvenanceKey(r.key).screen))
      const values = this.reader(owner)
      for (const record of records) before.push({ owner, record, value: await values(record) })
    }
    return { owners, years, screens: wanted, before }
  }

  async settle(snapshot: UserWriteSnapshot): Promise<void> {
    if (snapshot.before.length === 0) return
    for (const owner of snapshot.owners) {
      const mine = snapshot.before.filter((b) => b.owner === owner)
      if (mine.length === 0) continue
      const now = new Map((await this.markings.listForUserAndYears(owner, snapshot.years)).map((r) => [`${r.taxYear}|${r.key}`, r]))
      const values = this.reader(owner)
      const stale = new Map<number, string[]>()
      for (const { record, value } of mine) {
        if (value === UNREADABLE) continue
        const current = now.get(`${record.taxYear}|${record.key}`)
        if (current === undefined || !sameMarking(record, current)) continue
        const after = await values(record)
        if (after === UNREADABLE) continue
        // The value changed under the user's hand, or its record is gone: the marking no longer describes it.
        if (after === undefined || after !== value) stale.set(record.taxYear, [...(stale.get(record.taxYear) ?? []), record.key])
      }
      for (const [year, keys] of stale) await this.markings.remove(owner, year, keys)
    }
  }

  /** The field's value under a marking, each record read once per pass. */
  private reader(owner: string): (record: ProvenanceRecord) => Promise<FieldValue> {
    const cache = new Map<string, Promise<Readonly<Record<string, string | null>> | null | typeof UNREADABLE>>()
    return async (record) => {
      const { screen, instance, field } = decomposeProvenanceKey(record.key)
      const access = this.access[screen]
      if (access === undefined) return UNREADABLE
      const id = `${record.taxYear}|${screen}|${instance ?? ''}`
      if (!cache.has(id)) cache.set(id, access.read(owner, record.taxYear, instance).catch(() => UNREADABLE))
      const values = await cache.get(id)
      if (values === UNREADABLE) return UNREADABLE
      return values === null || values === undefined ? undefined : (values[field] ?? null)
    }
  }
}
