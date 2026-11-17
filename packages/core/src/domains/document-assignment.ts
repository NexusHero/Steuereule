/**
 * Whose a document is (ADR-0092): Person A, Person B or a child of the year. The place of the upload
 * decides (a mask of B or of a child); in the chat or the Belege tab the app asks „Für wen?“ — but only
 * when more than one person of the household can hold this kind of document. The name printed on the
 * document only preselects the answer, or makes the app ask when it contradicts the place of the upload,
 * names nobody of the household (offer to create them) or cannot be compared because A has no name yet
 * („Bist du …?“). A fixed rule decides; no model is asked, and the names never leave the device or server.
 */
import { foldName } from './ch-salary-certificate-parser'
import { parseChHealthStatement } from './ch-health-statement'
import { looksLikeChildcareNotice } from './childcare-notice'
import { looksLikeCraftsmanInvoice } from './craftsman-invoice'
import { looksLikeDonationReceipt } from './donation-receipt'
import { looksLikeMedicalInvoice } from './medical-invoice'
import type { DetectedDocumentKind } from './document-kind'

/** `A`, `B` or `kind:<child id>`: the person a document belongs to. */
export type HolderRef = 'A' | 'B' | `kind:${string}`

const HOLDER_REF = /^(?:A|B|kind:[A-Za-z0-9_-]{1,64})$/

export function isHolderRef(value: unknown): value is HolderRef {
  return typeof value === 'string' && HOLDER_REF.test(value)
}

/** The child id of a child's reference, or null for A and B. */
export function holderChildId(ref: HolderRef): string | null {
  return ref.startsWith('kind:') ? ref.slice('kind:'.length) : null
}

/** Whose return-side record the document writes: B for B, A for A and for a child (Anlage Kind is A's). */
export function holderPerson(ref: HolderRef): 'A' | 'B' {
  return ref === 'B' ? 'B' : 'A'
}

/**
 * Who can hold a kind of document: wage and pension papers are an adult's, a childcare notice a child's,
 * a health insurer's statement anyone's. `none`: a receipt of the joint return (a donation, a craftsman),
 * which belongs to no single person and is never asked about.
 */
export type HolderScope = 'adults' | 'children' | 'everyone' | 'none'

export function holderScopeOf(kind: DetectedDocumentKind, rawText: string): HolderScope {
  switch (kind) {
    case 'lstb':
    case 'chLohnausweis':
    case 'chPensionskasse':
    case 'chPraemien':
      return 'adults'
    case 'chKrankenkasse':
      return 'everyone'
    case 'auto':
      return looksLikeChildcareNotice(rawText) ? 'children' : looksLikeWorkExpenseReceipt(rawText) ? 'adults' : 'none'
  }
}

const WORK_EXPENSE =
  /monitor|laptop|computer|hardware|drucker|schreibtisch|arbeitsmittel|b(?:ü|u)roausstattung|berufskleidung|fachliteratur|fortbildung|\bkurs\b|seminar|weiterbildung|konferenz|umzug|spedition|m(?:ö|o)beltransport|berufsverband|gewerkschaft/i

/**
 * A receipt for one person's Werbungskosten — work tools, training, a move for work, a professional body
 * (ADR-0092): it belongs to A or B like a wage paper. Donations, craftsmen and medical bills are the joint
 * return's and stay out, even when they mention one of the words.
 */
export function looksLikeWorkExpenseReceipt(text: string): boolean {
  const t = text ?? ''
  if (looksLikeDonationReceipt(t) || looksLikeMedicalInvoice(t) || looksLikeCraftsmanInvoice(t) || looksLikeChildcareNotice(t)) return false
  return WORK_EXPENSE.test(t)
}

/** A person of the household as far as the assignment needs them: the reference and the names on record. */
export interface AssignmentMember {
  readonly ref: HolderRef
  readonly firstName: string | null
  readonly lastName: string | null
}

const isChild = (ref: HolderRef): boolean => ref.startsWith('kind:')

function inScope(scope: HolderScope, ref: HolderRef): boolean {
  if (scope === 'everyone') return true
  if (scope === 'children') return isChild(ref)
  return scope === 'adults' && !isChild(ref)
}

const hasName = (m: AssignmentMember): boolean => Boolean(m.firstName?.trim())

/**
 * Whether a printed name is this member: all of the member's first names appear in it, and the last name
 * too for an adult (siblings share it, so a child is known by the first name).
 */
export function nameFitsMember(printed: string, member: AssignmentMember): boolean {
  if (!hasName(member)) return false
  const onDocument = new Set(foldName(printed))
  const first = foldName(member.firstName ?? '')
  const last = isChild(member.ref) ? [] : foldName(member.lastName ?? '')
  return first.length > 0 && [...first, ...last].every((n) => onDocument.has(n))
}

/** The member a printed name is, or null when it fits nobody or more than one person. */
export function memberNamed(printed: string | null, members: readonly AssignmentMember[]): AssignmentMember | null {
  if (printed === null) return null
  const fits = members.filter((m) => nameFitsMember(printed, m))
  return fits.length === 1 ? fits[0]! : null
}

/** Words that mark a heading or a form row, never a person's name. */
const NOT_A_NAME =
  /bescheinigung|lohn|steuer|ausweis|versicherung|kasse|pr[aä]mie|auszug|rechnung|brief|pension|vorsorge|tagegeld|taggeld|best[aä]tigung|arbeitgeber|arbeitnehmer|zusammenfassung|krankenkasse|zertifikat|certificat|salaire|bruttolohn|nummer|datum|adresse|seite|total|betrag|jahr|gmbh|\bag\b|stiftung|genossenschaft|leistung|beitrag|beitr[aä]ge|ausdruck|identifikation|transferticket|elektronisch|gesundheit|organisation|pers[oö]nlich|deutschland|schweiz/i

const NAME_TOKEN = /^\p{Lu}[\p{L}'’-]+$/u

/** Whether the line is two or three capitalised words and nothing else, such as "Nora Sommer". */
function isNameLine(line: string): boolean {
  const text = line.trim()
  if (text.length < 5 || text.length > 60 || /[\d:@/]/.test(text) || NOT_A_NAME.test(text)) return false
  const words = text.replace(/^(?:herrn?|frau)\s+/i, '').split(/\s+/)
  return words.length >= 2 && words.length <= 3 && words.every((w) => NAME_TOKEN.test(w))
}

/**
 * The holder name a document prints, or null when none is recognisable: a "Name:"/"Herr"/"Frau" label,
 * or a line that is nothing but a name. Only compared with the household, never stored.
 */
export function printedHolderName(rawText: string): string | null {
  for (const line of (rawText ?? '').split(/\r?\n/)) {
    const labelled = /^\s*(?:name(?:,\s*vorname)?|vorname,?\s*name|arbeitnehmer(?:in)?|versicherungsnehmer(?:in)?|versicherte(?:r)?|herrn?|frau)(?:\s+(?::\s+)?|:\s+)(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,2})\s*$/iu.exec(line)
    if (labelled && !NOT_A_NAME.test(labelled[1]!)) return labelled[1]!
    if (isNameLine(line)) return line.trim()
  }
  return null
}

const CHILD_NAME = /(?:[Ff](?:ü|u)r[ \t]+(?:das[ \t]+)?[Kk]ind|[Nn]ame[ \t]+des[ \t]+[Kk]indes|\b[Kk]ind)(?:[ \t]+(?::[ \t]+)?|:[ \t]+)(\p{Lu}[\p{L}'’-]+(?:[ \t]+\p{Lu}[\p{L}'’-]+){0,2})/u

/**
 * The names a document prints for the people it is about, the holder first: every insured person of a
 * health insurer's statement, the child of a childcare notice, else the one holder name.
 */
export function printedPersonNames(kind: DetectedDocumentKind, rawText: string): string[] {
  if (kind === 'chKrankenkasse') return parseChHealthStatement(rawText).insured.map((p) => p.name)
  // An invoice prints the shop's name, not the buyer's: the household's names are looked up in the text.
  if (kind === 'auto' && looksLikeWorkExpenseReceipt(rawText)) return []
  if (holderScopeOf(kind, rawText) === 'children') {
    const child = CHILD_NAME.exec(rawText ?? '')
    return child ? [child[1]!] : []
  }
  const holder = printedHolderName(rawText)
  return holder === null ? [] : [holder]
}

/** Why the app asks before it reads a document for someone. */
export type AssignmentQuestionReason =
  /** Several people can hold it (chat, Belege tab): „Für wen?“, the named person preselected. */
  | 'which'
  /** The name on it is someone else than the person of the upload area. */
  | 'contradiction'
  /** The name on it is nobody of the household. */
  | 'unknown'
  /** A has no name on record yet, the document names someone: „Bist du …?“ (N1). */
  | 'confirmSelf'

export type AssignmentDecision =
  | { readonly kind: 'assigned'; readonly holder: HolderRef }
  | {
      readonly kind: 'ask'
      readonly reason: AssignmentQuestionReason
      /** Who the user may choose. */
      readonly options: readonly HolderRef[]
      readonly preselected: HolderRef | null
      /** The name printed on the document, to show in the question; null when none was recognised. */
      readonly printedName: string | null
      /** The person of the upload area, for „du bist bei …“. */
      readonly area: HolderRef | null
      /** Who could be created from the document: a Person B, a child. */
      readonly offerCreate: readonly ('B' | 'kind')[]
    }

export interface AssignmentInput {
  readonly scope: Exclude<HolderScope, 'none'>
  /** The upload area: B's or a child's mask (A's own mask is `A`); absent in the chat and the Belege tab. */
  readonly area?: HolderRef | undefined
  /** The user's own answer to „Für wen?“: final, nothing is asked again. */
  readonly chosen?: HolderRef | undefined
  /** The household of the year, A first. */
  readonly members: readonly AssignmentMember[]
  /** The names the document prints, the holder first (`printedPersonNames`). */
  readonly printed: readonly string[]
  /**
   * The whole text: when no printed name fits anyone, an adult whose full name stands anywhere in it is the
   * one it names (a pension statement prints the name beside the birth date, not on a line of its own).
   */
  readonly rawText?: string | undefined
}

/** Whom the app can create from a document nobody of the household is named on. */
function creatable(scope: AssignmentInput['scope'], members: readonly AssignmentMember[]): ('B' | 'kind')[] {
  return [
    ...(scope !== 'children' && !members.some((m) => m.ref === 'B') ? (['B'] as const) : []),
    ...(scope !== 'adults' ? (['kind'] as const) : []),
  ]
}

/** Whose a document is, or the question to ask the user first. */
export function decideDocumentHolder(input: AssignmentInput): AssignmentDecision {
  if (input.chosen !== undefined) return { kind: 'assigned', holder: input.chosen }
  const { scope, members } = input
  const eligible = members.filter((m) => inScope(scope, m.ref))
  const printedFirst = input.printed[0] ?? null
  const inText =
    memberNamed(printedFirst, members) === null && input.rawText
      ? members.filter((m) => !isChild(m.ref) && Boolean(m.lastName) && nameFitsMember(input.rawText!, m))
      : []
  const named = memberNamed(printedFirst, members) ?? (inText.length === 1 ? inText[0]! : null)
  const printedName = inText.length === 1 && named !== null ? `${named.firstName} ${named.lastName}` : printedFirst
  const unknown = printedName !== null && named === null
  const offerCreate = unknown || eligible.length === 0 ? creatable(scope, members) : []
  const options = eligible.map((m) => m.ref)
  const ask = (reason: AssignmentQuestionReason, preselected: HolderRef | null): AssignmentDecision => ({
    kind: 'ask',
    reason,
    options,
    preselected,
    printedName,
    area: input.area ?? null,
    offerCreate,
  })
  const aNameless = !members.some((m) => m.ref === 'A' && hasName(m))

  // A mask of someone who cannot hold this document (a Lohnausweis in a child's mask) is no upload area.
  if (input.area !== undefined && inScope(scope, input.area)) {
    const area = input.area
    if (printedName === null || named?.ref === area) return { kind: 'assigned', holder: area }
    if (named !== null) return ask('contradiction', inScope(scope, named.ref) ? named.ref : area)
    const areaMember = members.find((m) => m.ref === area)
    if (areaMember !== undefined && hasName(areaMember)) return ask('contradiction', area)
    return area === 'A' ? ask('confirmSelf', 'A') : { kind: 'assigned', holder: area }
  }

  if (eligible.length > 1) return ask('which', named !== null && inScope(scope, named.ref) ? named.ref : null)
  if (eligible.length === 0) return ask('unknown', null)
  const only = eligible[0]!
  if (printedName === null || named?.ref === only.ref) return { kind: 'assigned', holder: only.ref }
  if (only.ref === 'A' && aNameless && named === null) return ask('confirmSelf', 'A')
  return ask('unknown', null)
}

/**
 * The other people of the household a multi-person document names (a family statement, one Kita notice
 * for two children), for „auch für … übernehmen?“. The holder and those already linked are left out.
 */
export function otherNamedMembers(
  scope: HolderScope,
  printed: readonly string[],
  members: readonly AssignmentMember[],
  holder: HolderRef,
  alreadyLinked: readonly HolderRef[] = [],
  rawText = '',
): HolderRef[] {
  if (scope !== 'everyone' && scope !== 'children') return []
  const named = new Set<HolderRef>()
  for (const name of printed) {
    const member = memberNamed(name, members)
    if (member !== null) named.add(member.ref)
  }
  // A childcare notice for two children prints both first names in its text.
  if (scope === 'children') for (const m of members) if (isChild(m.ref) && nameFitsMember(rawText, m)) named.add(m.ref)
  return [...named].filter((ref) => ref !== holder && !alreadyLinked.includes(ref) && inScope(scope, ref))
}

/**
 * The part of a multi-child document about one child: from the line naming this child to the line naming
 * another one of the household. The whole text when the document is not laid out by child.
 */
export function sectionForMember(rawText: string, member: AssignmentMember, others: readonly AssignmentMember[]): string {
  const lines = (rawText ?? '').split(/\r?\n/)
  const start = lines.findIndex((l) => nameFitsMember(l, member))
  if (start < 0) return rawText
  const other = others.filter((o) => o.ref !== member.ref)
  const firstNamed = lines.findIndex((l) => nameFitsMember(l, member) || other.some((o) => nameFitsMember(l, o)))
  const end = lines.slice(start + 1).findIndex((l) => other.some((o) => nameFitsMember(l, o)))
  return [...lines.slice(0, firstNamed), ...lines.slice(start, end < 0 ? undefined : start + 1 + end)].join('\n')
}

/** The details a document prints for creating its holder: names, birth date (ISO) and Steuer-ID. */
export interface PrintedPersonDetails {
  readonly firstName: string | null
  readonly lastName: string | null
  readonly birthDate: string | null
  readonly taxId: string | null
}

const DATE = /(\d{2})\.(\d{2})\.(\d{4})/

/**
 * What a document says about the person it names, for „als Person B anlegen?“ / „als Kind anlegen?“: the
 * user sees and can correct it before anything is saved. A Swiss certificate prints the last name first.
 */
export function printedPersonDetails(kind: DetectedDocumentKind, rawText: string, name: string | null): PrintedPersonDetails {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  const lastFirst = kind === 'chLohnausweis'
  const firstName = words.length === 0 ? null : lastFirst ? words.slice(1).join(' ') || null : words.length === 1 ? words[0]! : words.slice(0, -1).join(' ')
  const lastName = words.length < 2 ? null : lastFirst ? words[0]! : words[words.length - 1]!
  const text = rawText ?? ''
  const nameLine = name ? text.split(/\r?\n/).find((l) => l.includes(name)) : undefined
  const born = /geburtsdatum[^\n\d]{0,60}(\d{2}\.\d{2}\.\d{4})/i.exec(text)?.[1] ?? (nameLine ? DATE.exec(nameLine)?.[0] : undefined) ?? null
  const iso = born ? born.replace(DATE, '$3-$2-$1') : null
  const taxId = /identifikationsnummer\D{0,40}(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})/i.exec(text)?.[1]?.replace(/\s/g, '') ?? null
  return { firstName, lastName, birthDate: iso, taxId }
}

/** Where the value already in a field came from, as far as adding up or replacing is concerned. */
export type ExistingValueSource = 'none' | 'thisDocument' | 'other'

const AMOUNT = /^\d+(?:\.\d+)?$/

/**
 * Whether a document's amount may simply be written, or the user must say whether it comes on top
 * („zusätzlich“, a second employer) or replaces what is there („ersetzen“, a correction). Never added or
 * overwritten silently (ADR-0092 §6, finding N2): an amount from another document, typed by hand or told
 * in the chat makes the app ask. Empty, zero, the same amount, or this document's own value: written.
 */
export function amountCombination(existing: string | null, incoming: string, source: ExistingValueSource): 'write' | 'ask' {
  if (source !== 'other' || existing === null || !AMOUNT.test(existing) || !AMOUNT.test(incoming)) return 'write'
  if (Number(existing) === 0 || Number(existing) === Number(incoming)) return 'write'
  return 'ask'
}

/** The two amounts added, in the field's own whole-number form where both are whole. */
export function addAmounts(existing: string, incoming: string): string {
  const sum = Number(existing) + Number(incoming)
  return Number.isInteger(sum) ? String(sum) : sum.toFixed(2)
}

/**
 * What marks one receipt of a sum field (ADR-0092 §6): its issuer (the letterhead, folded), amount and date.
 * Two receipts are the same one again only when issuer and amount match and the dates do not differ.
 */
export interface ReceiptMark {
  readonly issuer: string
  readonly amount: string
  readonly date: string | null
}

/** The issuer of a receipt: its first line with words that is not a document heading or a date. */
export function receiptIssuer(rawText: string): string {
  for (const line of (rawText ?? '').split(/\r?\n/)) {
    const words = foldName(line)
    if (words.length === 0 || /^\s*(?:rechnung|quittung|beleg|kassenbon|kassenbeleg|datum|seite)\b/i.test(line)) continue
    return words.join(' ')
  }
  return ''
}

export function sameReceiptAgain(mark: ReceiptMark, others: readonly ReceiptMark[]): boolean {
  return others.some((o) => o.issuer !== '' && o.issuer === mark.issuer && Number(o.amount) === Number(mark.amount) && (o.date === null || mark.date === null || o.date === mark.date))
}

/**
 * How a receipt's amount goes into a field that sums several receipts (donations, work tools, medical
 * costs, craftsmen, moving costs): written into an empty field; added without a question when it is another
 * receipt (another issuer, date or amount); asked „zusätzlich oder ersetzen?“ only when it looks like the
 * same receipt again — a copy, or a corrected one (ADR-0092 §6).
 */
export function sumFieldCombination(existing: string | null, incoming: string, source: ExistingValueSource, again: boolean): 'write' | 'add' | 'ask' {
  if (source !== 'other' || existing === null || !AMOUNT.test(existing) || !AMOUNT.test(incoming) || Number(existing) === 0) return 'write'
  return again ? 'ask' : 'add'
}
