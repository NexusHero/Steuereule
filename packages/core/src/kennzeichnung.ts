export type Provenance =
  | { readonly kind: 'nutzer' }
  | { readonly kind: 'uebernahme'; readonly lastYear: number }
  | { readonly kind: 'assistent'; readonly name: string; readonly receiptId?: string }
  | { readonly kind: 'beleg'; readonly receiptId: string }

export interface Proposal {
  readonly value: string | null
  readonly provenance: Provenance
}

export interface Marking {
  readonly key: string
  readonly provenance: Provenance
  readonly confirmed: boolean
  readonly value: string | null
  readonly proposal: Proposal | null
}

export const SCREENS = ['profil', 'stammdaten', 'kopplung', 'interview', 'lstb', 'chLohnausweis', 'rente', 'kapital', 'vermietung', 'kind'] as const
export type Screen = (typeof SCREENS)[number]

export const ANNEXES = ['hauptvordruck', 'anlageN', 'anlageNGre', 'anlageR', 'anlageKap', 'anlageV', 'anlageKind'] as const
export type Annex = (typeof ANNEXES)[number]
const ANNEX_PER_SCREEN: Readonly<Record<Screen, Annex>> = {
  profil: 'hauptvordruck',
  stammdaten: 'hauptvordruck',
  kopplung: 'hauptvordruck',
  interview: 'hauptvordruck',
  lstb: 'anlageN',
  chLohnausweis: 'anlageNGre',
  rente: 'anlageR',
  kapital: 'anlageKap',
  vermietung: 'anlageV',
  kind: 'anlageKind',
}

export const YEAR_INDEPENDENT = 0

export function provenanceKey(screen: Screen, field: string, instance?: string): string {
  if (field === '' || field.includes('.') || (instance !== undefined && (instance === '' || instance.includes('.')))) {
    throw new RangeError(`kennzeichnungsKey: invalid field "${field}" or instance "${instance ?? ''}"`)
  }
  return instance === undefined ? `${screen}.${field}` : `${screen}:${instance}.${field}`
}

export function decomposeProvenanceKey(key: string): { screen: Screen; instance: string | null; field: string } {
  const point = key.indexOf('.')
  if (point <= 0 || point === key.length - 1) throw new RangeError(`Kennzeichnungs-Key "${key}" has no field`)
  const header = key.slice(0, point)
  const field = key.slice(point + 1)
  const colon = header.indexOf(':')
  const screen = colon === -1 ? header : header.slice(0, colon)
  const instance = colon === -1 ? null : header.slice(colon + 1)
  if (!(SCREENS as readonly string[]).includes(screen)) throw new RangeError(`Kennzeichnungs-Key "${key}" names no known mask`)
  if (instance === '') throw new RangeError(`Kennzeichnungs-Key "${key}" has an empty instance`)
  return { screen: screen as Screen, instance, field }
}

export function annexOf(key: string): Annex {
  return ANNEX_PER_SCREEN[decomposeProvenanceKey(key).screen]
}

export function isYearIndependent(key: string): boolean {
  const { screen } = decomposeProvenanceKey(key)
  return screen === 'profil' || screen === 'stammdaten'
}

export type WriteDecision =
  | { readonly kind: 'schreiben'; readonly marking: Marking | null }
  | { readonly kind: 'vorschlag'; readonly marking: Marking }
  | { readonly kind: 'unveraendert' }

export interface WriteAttempt {
  readonly key: string
  readonly existing: Marking | null
  readonly currentValue: string | null
  readonly newValue: string | null
  readonly provenance: Provenance
}

export function decideWriting({ key, existing, currentValue, newValue, provenance }: WriteAttempt): WriteDecision {
  if (provenance.kind === 'nutzer') return { kind: 'schreiben', marking: null }
  if (newValue === currentValue) return { kind: 'unveraendert' }
  const geschuetzt = existing === null ? currentValue !== null : existing.confirmed
  if (geschuetzt) {
    const basis: Marking = existing ?? { key, provenance: { kind: 'nutzer' }, confirmed: true, value: currentValue, proposal: null }
    return { kind: 'vorschlag', marking: { ...basis, proposal: { value: newValue, provenance } } }
  }
  return { kind: 'schreiben', marking: { key, provenance, confirmed: false, proposal: null, value: newValue } }
}

export function missingConfirmations(markings: readonly Marking[]): string[] {
  const open = new Set(markings.filter((k) => !k.confirmed).map((k) => annexOf(k.key)))
  return ANNEXES.filter((a) => open.has(a)).map((a) => `unbestaetigt.${a}`)
}

export function confirmAnnex(markings: readonly Marking[], annex: Annex): Marking[] {
  return markings.map((k) => (annexOf(k.key) === annex && !k.confirmed ? { ...k, confirmed: true } : k))
}

export function acceptProposal(k: Marking): Marking {
  if (k.proposal === null) throw new RangeError(`nimmVorschlagAn: "${k.key}" has no proposal`)
  return { key: k.key, provenance: k.proposal.provenance, confirmed: true, value: k.proposal.value, proposal: null }
}

export function dismissProposal(k: Marking): Marking | null {
  if (k.provenance.kind === 'nutzer') return null
  return { ...k, proposal: null }
}

export function provenanceText(provenance: Provenance): string {
  switch (provenance.kind) {
    case 'nutzer':
      return 'Selbst eingetragen'
    case 'uebernahme':
      return `Übernahme aus ${provenance.lastYear}`
    case 'assistent':
      return provenance.receiptId === undefined ? `Assistent: ${provenance.name}` : `Assistent: ${provenance.name}, aus Beleg`
    case 'beleg':
      return 'Aus Beleg'
  }
}
