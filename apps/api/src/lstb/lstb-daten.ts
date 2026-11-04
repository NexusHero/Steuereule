import { LEERES_LSTB, deserialisiereLstbFeld, type LstbDaten } from '@steuereule/core'
import type { LstbRecord } from './lstb.repository.js'

export function lstbDatenAus(record: LstbRecord | null): LstbDaten {
  if (record === null) return LEERES_LSTB
  return {
    bruttoarbeitslohn: deserialisiereLstbFeld(record.bruttoarbeitslohn),
    lohnsteuer: deserialisiereLstbFeld(record.lohnsteuer),
    sozialversicherung: deserialisiereLstbFeld(record.sozialversicherung),
  }
}
