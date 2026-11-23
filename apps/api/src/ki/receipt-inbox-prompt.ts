import type { ReceiptInboxFacts, ReceiptInboxItem } from '@steuereule/core'

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
