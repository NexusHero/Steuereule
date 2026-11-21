import type { PartnerAreaParam } from '../../navigation/routes'
import type { TileId } from './tiles'

/** Where the user enters a missing detail: one of their own tiles, or one of Person B's areas. */
export type MissingTarget =
  | { readonly kind: 'tile'; readonly tile: TileId }
  | { readonly kind: 'partner'; readonly area: PartnerAreaParam }

export interface MissingItem {
  /** The id without the `personB.` prefix; the label key is `cockpit.erstattung.fehlt.<id>`. */
  readonly id: string
  /** The id as the estimate reported it. */
  readonly raw: string
  readonly person: 'A' | 'B'
  /** False for an id this app has no wording for: it is shown as „eine weitere Angabe“. */
  readonly known: boolean
  readonly target: MissingTarget | null
}

/** The mask that holds each id the estimate (`GET …/steuerschaetzung`) can report as missing. */
const HOLDER: Readonly<Record<string, { readonly tile: TileId; readonly partner: PartnerAreaParam | null }>> = {
  bruttoarbeitslohn: { tile: 'lstb', partner: 'lstb' },
  lohnsteuer: { tile: 'lstb', partner: 'lstb' },
  sozialversicherung: { tile: 'lstb', partner: 'lstb' },
  'lohnsteuer-uebersteigt-brutto': { tile: 'lstb', partner: 'lstb' },
  'sozialversicherung-uebersteigt-brutto': { tile: 'lstb', partner: 'lstb' },
  'grenzgaenger-status': { tile: 'ch', partner: 'schweiz' },
  'bruttolohn-total': { tile: 'ch', partner: 'schweiz' },
  'berufliche-vorsorge': { tile: 'ch', partner: 'schweiz' },
  quellensteuer: { tile: 'ch', partner: 'schweiz' },
  wechselkurs: { tile: 'ch', partner: 'schweiz' },
  'pk-obligatorium': { tile: 'ch', partner: 'schweiz' },
  rente: { tile: 'rente', partner: 'rente' },
  'lohnersatz-betrag': { tile: 'lebenslagen', partner: null },
  selbststaendig: { tile: 'selbststaendig', partner: null },
}

/** Ids with a wording of their own but no single mask to send the user to. */
const KNOWN_WITHOUT_HOLDER = new Set(['einkommen'])

const PERSON_B = 'personB.'

/** One item per missing id, in the order the estimate named them; duplicates folded. */
export function missingItems(ids: readonly string[]): readonly MissingItem[] {
  const items: MissingItem[] = []
  for (const raw of ids) {
    if (items.some((item) => item.raw === raw)) continue
    const person = raw.startsWith(PERSON_B) ? 'B' : 'A'
    const id = person === 'B' ? raw.slice(PERSON_B.length) : raw
    const holder = HOLDER[id]
    const target: MissingTarget | null =
      holder === undefined
        ? null
        : person === 'A'
          ? { kind: 'tile', tile: holder.tile }
          : holder.partner === null
            ? null
            : { kind: 'partner', area: holder.partner }
    items.push({ id, raw, person, known: holder !== undefined || KNOWN_WITHOUT_HOLDER.has(id), target })
  }
  return items
}

/** The user's own tiles that hold something the estimate still lacks. */
export function tilesWithMissing(items: readonly MissingItem[]): ReadonlyMap<TileId, readonly MissingItem[]> {
  const byTile = new Map<TileId, MissingItem[]>()
  for (const item of items) {
    if (item.target?.kind !== 'tile') continue
    byTile.set(item.target.tile, [...(byTile.get(item.target.tile) ?? []), item])
  }
  return byTile
}

/** Person B's areas that hold something the estimate still lacks. */
export function partnerAreasWithMissing(items: readonly MissingItem[]): ReadonlyMap<PartnerAreaParam, readonly MissingItem[]> {
  const byArea = new Map<PartnerAreaParam, MissingItem[]>()
  for (const item of items) {
    if (item.target?.kind !== 'partner') continue
    byArea.set(item.target.area, [...(byArea.get(item.target.area) ?? []), item])
  }
  return byArea
}
