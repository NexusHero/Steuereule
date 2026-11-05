import { EMPTY_LSTB, LEERES_LSTB, deserializeLstbField, type LstbData } from '@steuereule/core'
import type { LstbRecord } from './lstb.repository.js'

export function lstbDataFrom(record: LstbRecord | null): LstbData {
  if (record === null) return EMPTY_LSTB ?? LEERES_LSTB
  return {
    bruttoarbeitslohn: deserializeLstbField(record.bruttoarbeitslohn),
    lohnsteuer: deserializeLstbField(record.lohnsteuer),
    sozialversicherung: deserializeLstbField(record.sozialversicherung),
  }
}

export const lstbDatenAus = lstbDataFrom
