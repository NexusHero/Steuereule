import { assignmentFromData, isHolderRef, type AdvisorActionStatus, type ReceiptInboxFacts, type ReceiptInboxItem } from '@steuereule/core'
import type { ReceiptRecord } from '../receipt/receipt.repository.js'

/** The newest Belege the owl is told about; more are counted, not listed. */
export const RECEIPT_INBOX_CAP = 30

/** A draft of the year as far as it matters here: which Beleg it came from and where it stands. */
export interface ReceiptDraftState {
  readonly receiptId?: string | undefined
  readonly status: AdvisorActionStatus
}

function itemOf(record: ReceiptRecord, taxYear: number, drafts: readonly ReceiptDraftState[]): ReceiptInboxItem | null {
  const assignment = assignmentFromData({
    taxYear: record.taxYear,
    belegdatum: record.belegdatum ?? record.receiptDate ?? null,
    zahlungsdatum: record.zahlungsdatum ?? record.paymentDate ?? null,
    proposalDismissed: record.proposalDismissed,
  } as Parameters<typeof assignmentFromData>[0])
  const year = assignment.kind === 'zugeordnet' ? assignment.taxYear : assignment.kind === 'konflikt' ? assignment.assigned : assignment.kind === 'vorgeschlagen' ? assignment.proposal.taxYear : null
  const proposalYear = assignment.kind === 'konflikt' ? assignment.proposal.taxYear : null
  // A Beleg belongs to the year it is assigned or suggested for; one without any year may still be for this one.
  if (year !== null && year !== taxYear && proposalYear !== taxYear) return null
  const own = drafts.filter((draft) => draft.receiptId === record.id)
  const holderRef = record.holderTaxYear === taxYear ? record.holders?.[0] : undefined
  return {
    kind: record.kind ?? record.receiptType ?? null,
    belegdatum: record.belegdatum ?? record.receiptDate ?? null,
    zahlungsdatum: record.zahlungsdatum ?? record.paymentDate ?? null,
    assignment: assignment.kind,
    year,
    holder: holderRef === undefined || !isHolderRef(holderRef) ? null : holderRef === 'A' || holderRef === 'B' ? holderRef : 'kind',
    values: own.some((draft) => draft.status === 'applied') ? 'uebernommen' : own.some((draft) => draft.status === 'pending') ? 'entwurf-offen' : 'keine',
  }
}

/**
 * What the owl may know about the stored Belege of a year (newest first, `records` as the repository returns
 * them): the fields of `ReceiptInboxItem` and nothing else. The file name is deliberately never read here.
 */
export function buildReceiptInbox(records: readonly ReceiptRecord[], taxYear: number, drafts: readonly ReceiptDraftState[], cap = RECEIPT_INBOX_CAP): ReceiptInboxFacts {
  const relevant = records.flatMap((record) => {
    const item = itemOf(record, taxYear, drafts)
    return item === null ? [] : [item]
  })
  return { items: relevant.slice(0, cap), total: relevant.length, truncated: relevant.length > cap }
}

const KIND_LABEL: Readonly<Record<string, string>> = {
  Lohnausweis: 'Lohnausweis',
  Quellensteuer: 'Quellensteuer-Beleg',
  Pensionskasse: 'Pensionskasse',
  Saeule3a: 'Säule 3a',
  Krankenkasse: 'Krankenkasse',
  Familienzulage: 'Familienzulage',
  Rentenbezugsmitteilung: 'Rentenbezugsmitteilung',
  Steuerbescheinigung: 'Steuerbescheinigung',
  Steuerbescheid: 'Steuerbescheid',
  Sonstiges: 'Sonstiger Beleg',
}

const german = (iso: string | null) => (iso === null ? null : `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`)

const ASSIGNMENT_TEXT: Readonly<Record<ReceiptInboxItem['assignment'], (year: number | null) => string>> = {
  zugeordnet: (year) => `zugeordnet ${year}`,
  vorgeschlagen: (year) => `Jahr ${year} vorgeschlagen, noch nicht bestätigt`,
  ungebunden: () => 'noch keinem Jahr zugeordnet',
  konflikt: (year) => `Konflikt, zugeordnet ${year}`,
}

const VALUES_TEXT: Readonly<Record<ReceiptInboxItem['values'], string>> = {
  uebernommen: 'Wert übernommen',
  'entwurf-offen': 'Entwurf wartet auf Freigabe',
  keine: 'noch kein Wert gelesen',
}

/** The prompt block: the owl's view of the Belege inbox, with the rule for talking about it. */
export function describeReceiptInboxForPrompt(inbox: ReceiptInboxFacts | undefined): string[] {
  if (inbox === undefined || inbox.total === 0) return []
  const lines = inbox.items.map((item, i) => {
    const dates = [german(item.belegdatum) && `Belegdatum ${german(item.belegdatum)}`, german(item.zahlungsdatum) && `Zahlung ${german(item.zahlungsdatum)}`].filter(Boolean).join(', ')
    const holder = item.holder === null ? null : item.holder === 'kind' ? 'für ein Kind' : `für Person ${item.holder}`
    return `- Beleg ${i + 1}: ${KIND_LABEL[item.kind ?? ''] ?? 'Beleg ohne Art'}${dates ? `, ${dates}` : ''}; ${ASSIGNMENT_TEXT[item.assignment](item.year)}${holder ? `; ${holder}` : ''}; ${VALUES_TEXT[item.values]}`
  })
  return [
    '',
    `Belege im Posteingang (Tab „Belege“) für dieses Steuerjahr: ${inbox.total}${inbox.truncated ? `; hier die neuesten ${inbox.items.length}, die übrigen sind nicht aufgeführt` : ''}. Dateinamen und Inhalte kennst du nicht.`,
    ...lines,
    'Du darfst auf einen gespeicherten Beleg verweisen (z. B. „dein Krankenkassen-Beleg vom 03.11.“) und den Nutzer auf den Tab „Belege“ lenken oder darauf, den Beleg im Chat anzuhängen. Behaupte nie, einen Beleg gelesen zu haben, dessen Werte nicht übernommen sind oder als Entwurf warten: Dafür muss er ihn im Chat anhängen.',
  ]
}
