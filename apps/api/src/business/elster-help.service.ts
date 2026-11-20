import { Inject, Injectable } from '@nestjs/common'
import { NotFoundError } from '../common/domain-error.js'
import { AuditService } from '../audit/audit.service.js'
import { INCOME_TAX_FORMS, LATEST_LINES_YEAR, latestLineOf, lineIdsOf, lineOf, linesPublished, type FormLine } from '../printout/fill-in-lines.js'
import type { LiveForm, LiveFormInstance } from '../printout/live-values.js'
import { PrintoutService } from '../printout/printout.service.js'
import { FIRST_BUSINESS, type BusinessRef } from './business.repository.js'
import { BusinessService, type ElsterHelp, type ElsterLineValue } from './business.service.js'

/** The forms of the business itself, before the income-tax return (ADR-0101 §16). */
const BUSINESS_FORMS = ['anlage-euer', 'anlage-s', 'anlage-g', 'ust-2-a', 'gewst-1-a'] as const
/** The business form that belongs to the person: one VAT return for all his businesses (§ 2 Abs. 1 Satz 2 UStG). */
const PERSON_BUSINESS_FORMS: ReadonlySet<string> = new Set(['ust-2-a'])
/** Business lines on income-tax forms: the § 10d lines of ESt 1 A and of the Anlage Sonstiges. */
const LOSS_FORMS = ['est-1-a', 'anlage-sonstiges'] as const

/** Whose copy of a form this is: a person of a joint return, a child, a property, or the n-th copy. */
export interface ElsterInstance {
  readonly id: string
  readonly kind: 'person' | 'child' | 'property' | 'copy' | 'business'
  readonly person: 'A' | 'B' | null
  /** The child's first name, the property's street, the business's name; null where the app has none. */
  readonly name: string | null
  /** 1-based position among the copies of the form. */
  readonly number: number
}

export interface ElsterFormEntry {
  readonly form: string
  readonly group: 'business' | 'income-tax'
  readonly instance: ElsterInstance | null
}

export interface ElsterFormList {
  readonly year: number
  readonly forms: readonly ElsterFormEntry[]
}

export interface ElsterFillInHelp extends ElsterHelp {
  readonly instance: ElsterInstance | null
}

/**
 * The head of an Anlage (Name, Vorname, Steuernummer, lfd. Nr. in Zeilen 1 to 3) and the person boxes:
 * Mein ELSTER takes them from the Hauptvordruck, there is nothing to type.
 */
function isHead(line: FormLine): boolean {
  if (line.id.endsWith('.personA') || line.id.endsWith('.personB')) return true
  if (line.id === 'est1a.kopfSeite2' || line.id === 'est1a.einkommensteuererklaerung') return true
  return line.formular !== 'est-1-a' && line.seite === 1 && ['1', '2', '3'].includes(line.zeile ?? '')
}

const zeileNumber = (zeile: string | null) => (zeile === null ? Number.POSITIVE_INFINITY : Number.parseInt(zeile, 10))

/** A printed value as the help shows it: the box's text, a ticked box as „Ja“. */
const shown = (value: string | true | undefined): string | null => (value === undefined ? null : value === true ? 'Ja' : value)

/**
 * The ELSTER fill-in help over the whole return (ADR-0101 §16): the business forms from the book, the
 * income-tax forms with the values the paper printout would print (ADR-0050), per copy.
 */
@Injectable()
export class ElsterHelpService {
  constructor(
    @Inject(BusinessService) private readonly business: BusinessService,
    @Inject(PrintoutService) private readonly printout: PrintoutService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The forms with at least one value for this household and year, business forms first. */
  async forms(userId: string, year: number, ref: BusinessRef): Promise<ElsterFormList> {
    await this.business.assertElsterOpen(userId, year)
    const businesses = await this.business.listBusinesses(userId, year, ref.person)
    const [perBusiness, { forms, names }] = await Promise.all([
      Promise.all(businesses.map(async (b) => ({ b, withValues: await this.business.elsterFormsWithValues(userId, year, { person: ref.person, business: b.business }) }))),
      this.printout.fillInValues(userId, year),
    ])
    const withValues = perBusiness.find((x) => x.b.business === FIRST_BUSINESS)?.withValues ?? perBusiness[0]?.withValues ?? []
    const several = businesses.length > 1
    // One copy of a business form per business (ADR-0101 §22); the VAT return once for the person.
    const entries: ElsterFormEntry[] = BUSINESS_FORMS.flatMap((form): ElsterFormEntry[] =>
      PERSON_BUSINESS_FORMS.has(form) || !several
        ? perBusiness.some((x) => x.withValues.includes(form)) ? [{ form, group: 'business', instance: null }] : []
        : perBusiness
            .filter((x) => x.withValues.includes(form))
            .map((x) => ({ form, group: 'business', instance: { id: `betrieb-${x.b.business}`, kind: 'business', person: ref.person, name: x.b.name, number: x.b.business } })),
    )
    for (const live of forms) {
      for (const [index, copy] of live.instances.entries()) {
        if (this.linesOf(year, live.formular, copy).some((line) => line.value !== null)) {
          entries.push({ form: live.formular, group: 'income-tax', instance: instanceOf(live, copy, index, names) })
        }
      }
    }
    // A loss year without any other ESt 1 A value still needs the Hauptvordruck for its § 10d line.
    if (withValues.includes('est-1-a') && !entries.some((entry) => entry.form === 'est-1-a')) entries.push({ form: 'est-1-a', group: 'income-tax', instance: null })
    if (withValues.includes('anlage-sonstiges')) entries.push({ form: 'anlage-sonstiges', group: 'income-tax', instance: null })
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    return { year, forms: entries }
  }

  /** One form (one copy of it): per line Zeile, Kennzahl, label and the value to type. */
  async help(userId: string, year: number, ref: BusinessRef, form: string, instanceId: string | undefined): Promise<ElsterFillInHelp> {
    if (!INCOME_TAX_FORMS.includes(form)) {
      const business = /^betrieb-(\d+)$/.exec(instanceId ?? '')
      const target = business ? { person: ref.person, business: Number(business[1]) } : ref
      const instance: ElsterInstance | null = business ? { id: instanceId!, kind: 'business', person: ref.person, name: null, number: target.business } : null
      return { ...(await this.business.elsterHelp(userId, year, target, form)), instance }
    }
    const person = ref
    await this.business.assertElsterOpen(userId, year)
    const { forms, names } = await this.printout.fillInValues(userId, year)
    const live = forms.find((f) => f.formular === form)
    const index = live ? (instanceId === undefined ? 0 : live.instances.findIndex((copy, i) => instanceKey(copy, i) === instanceId)) : -1
    if (instanceId !== undefined && index < 0) throw new NotFoundError('ELSTER_INSTANCE_UNKNOWN', `Dieses Exemplar von „${form}“ gibt es für ${year} nicht.`)
    const copy = live?.instances[index]
    let lines = copy ? this.linesOf(year, form, copy) : []
    if ((LOSS_FORMS as readonly string[]).includes(form)) lines = [...lines, ...(await this.business.elsterHelp(userId, year, person, form)).lines]
    await this.audit.append({ userId, action: 'READ', resource: 'selbststaendig' })
    const instance = live && copy ? instanceOf(live, copy, index, names) : null
    if (!linesPublished(year)) {
      return {
        form,
        year,
        status: 'not_published',
        note: `Das Formular ${form} für ${year} ist noch nicht veröffentlicht (zuletzt ${LATEST_LINES_YEAR}). Die App nennt die Werte, aber keine Zeilen, bis es erscheint.`,
        sourceUrl: null,
        lineNumbersAvailable: false,
        lines,
        instance,
      }
    }
    return { form, year, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: lines.some((line) => line.zeile !== null), lines, instance }
  }

  /**
   * Every line of the form in the year's order with the copy's value. A value whose field the year's
   * form lacks (NOT_ON_FORM) still shows, without a Zeile, named as the latest form names it; an
   * unpublished year names every line that way and gives no Zeile or Kennzahl.
   */
  private linesOf(year: number, form: string, copy: LiveFormInstance): ElsterLineValue[] {
    const published = linesPublished(year)
    const rows: { line: FormLine; value: string | null; own: boolean }[] = []
    const seen = new Set<string>()
    if (published) {
      for (const id of Object.keys(copy.values).concat(lineIdsOf(year, form))) {
        if (seen.has(id)) continue
        seen.add(id)
        const own = lineOf(year, id)
        const line = own ?? latestLineOf(id)
        if (!line || line.formular !== form || isHead(line)) continue
        rows.push({ line, value: shown(copy.values[id]), own: own !== null })
      }
    } else {
      for (const [id, value] of Object.entries(copy.values)) {
        const line = latestLineOf(id)
        if (line && line.formular === form && !isHead(line)) rows.push({ line, value: shown(value), own: false })
      }
    }
    rows.sort((a, b) => Number(b.own) - Number(a.own) || a.line.seite - b.line.seite || zeileNumber(a.line.zeile) - zeileNumber(b.line.zeile))
    return rows.map(({ line, value, own }) => ({
      id: line.id,
      zeile: own ? line.zeile : null,
      kennzahlen: own ? line.kennzahlen : [],
      // A box whose line has no text of its own (the second „Sonstiges“ row) is named by the latest form.
      label: line.label || latestLineOf(line.id)?.label || '',
      column: own ? line.spalte : null,
      value,
    }))
  }
}

/** The id the app passes back for a copy: the record behind it, the person, or the copy's number. */
function instanceKey(copy: LiveFormInstance, index: number): string {
  return copy.entityId ?? copy.person ?? String(index + 1)
}

function instanceOf(live: LiveForm, copy: LiveFormInstance, index: number, names: Readonly<Record<string, string | null>>): ElsterInstance | null {
  const id = instanceKey(copy, index)
  if (copy.entityId !== null) {
    return { id, kind: live.formular === 'anlage-kind' ? 'child' : 'property', person: copy.person, name: names[copy.entityId] ?? null, number: index + 1 }
  }
  if (copy.person !== null) return { id, kind: 'person', person: copy.person, name: null, number: index + 1 }
  return live.instances.length > 1 ? { id, kind: 'copy', person: null, name: null, number: index + 1 } : null
}
