// The one place that knows how to read and write a single field of each mask by its
// Kennzeichnungs-Key. The Bestätigung needs it to show current values, to apply the conflict rule
// against the stored value and to write an accepted proposal. Every read/write goes through the
// mask's own repository (same encryption, same scoping) — never a second Prisma path.
// Masks without an entry here cannot be written by anyone but the user yet (ADR-0052: 17.3 adds
// the masks the assistant writes).
import {
  KAPITAL_FELDER,
  LSTB_FELDER,
  RENTEN_FELDER,
  VERMIETUNG_FELDER,
  type KapitalFeldId,
  type LstbFeldId,
  type Maske,
  type RentenFeldId,
  type VermietungFeldId,
} from '@steuereule/core'
import type { KapitalRepository } from '../kapital/kapital.repository.js'
import type { LstbRepository } from '../lstb/lstb.repository.js'
import type { RenteRepository } from '../rente/rente.repository.js'
import type { VermietungRepository } from '../vermietung/vermietung.repository.js'

export interface MaskenZugriff {
  readonly felder: readonly string[]
  /** Whether this mask is addressed per instance (`vermietung:<id>.feld`). */
  readonly mitInstanz: boolean
  /** The stored field strings, or null when the instance does not exist for this user. */
  lese(userId: string, steuerjahr: number, instanz: string | null): Promise<Readonly<Record<string, string | null>> | null>
  /** False when the instance does not exist for this user (nothing was written). */
  schreibe(userId: string, steuerjahr: number, instanz: string | null, feld: string, wert: string | null): Promise<boolean>
}

export type FeldZugriff = Readonly<Partial<Record<Maske, MaskenZugriff>>>

export const FELD_ZUGRIFF = Symbol('FELD_ZUGRIFF')

export interface FeldZugriffRepositories {
  readonly lstb: LstbRepository
  readonly rente: RenteRepository
  readonly kapital: KapitalRepository
  readonly vermietung: VermietungRepository
}

const RENTE_ZUGRIFF_FELDER = ['rentenart', ...RENTEN_FELDER] as const

export function feldZugriffAus({ lstb, rente, kapital, vermietung }: FeldZugriffRepositories): FeldZugriff {
  return {
    lstb: {
      felder: LSTB_FELDER,
      mitInstanz: false,
      async lese(userId, steuerjahr) {
        const r = await lstb.findForUserAndYear(userId, steuerjahr)
        return { bruttoarbeitslohn: r?.bruttoarbeitslohn ?? null, lohnsteuer: r?.lohnsteuer ?? null, sozialversicherung: r?.sozialversicherung ?? null }
      },
      async schreibe(userId, steuerjahr, _instanz, feld, wert) {
        await lstb.setFeld(userId, steuerjahr, feld as LstbFeldId, wert)
        return true
      },
    },
    rente: {
      felder: RENTE_ZUGRIFF_FELDER,
      mitInstanz: false,
      async lese(userId, steuerjahr) {
        const r = await rente.findForUserAndYear(userId, steuerjahr)
        return {
          rentenart: r?.rentenart ?? null,
          jahresbetrag: r?.jahresbetrag ?? null,
          rentenbeginnJahr: r?.rentenbeginnJahr ?? null,
          alterBeiRentenbeginn: r?.alterBeiRentenbeginn ?? null,
        }
      },
      async schreibe(userId, steuerjahr, _instanz, feld, wert) {
        if (feld === 'rentenart') await rente.setRentenart(userId, steuerjahr, wert)
        else await rente.setFeld(userId, steuerjahr, feld as RentenFeldId, wert)
        return true
      },
    },
    kapital: {
      felder: KAPITAL_FELDER,
      mitInstanz: false,
      async lese(userId, steuerjahr) {
        const r = await kapital.findForUserAndYear(userId, steuerjahr)
        return Object.fromEntries(KAPITAL_FELDER.map((f) => [f, r?.[f] ?? null]))
      },
      async schreibe(userId, steuerjahr, _instanz, feld, wert) {
        await kapital.setFeld(userId, steuerjahr, feld as KapitalFeldId, wert)
        return true
      },
    },
    vermietung: {
      felder: VERMIETUNG_FELDER,
      mitInstanz: true,
      async lese(userId, steuerjahr, instanz) {
        const objekt = (await vermietung.listForUserAndYear(userId, steuerjahr)).find((o) => o.id === instanz)
        if (objekt === undefined) return null
        return Object.fromEntries(VERMIETUNG_FELDER.map((f) => [f, objekt[f]]))
      },
      async schreibe(userId, steuerjahr, instanz, feld, wert) {
        if (instanz === null) return false
        return (await vermietung.setFeld(userId, steuerjahr, instanz, feld as VermietungFeldId, wert)) !== null
      },
    },
  }
}
