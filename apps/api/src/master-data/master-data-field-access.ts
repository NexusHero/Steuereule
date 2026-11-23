import type { ScreenAccess } from '../common/screen-access.js'
import { MASTER_DATA_FIELDS, type MasterDataField, type MasterDataRepository } from './master-data.repository.js'

/** The yes/no beside the master data's text fields (ADR-0052 amendment 3). */
const CHURCH_TAX_LIABLE = 'kirchensteuerpflichtig'
export const MASTER_DATA_ACCESS_FIELDS: readonly string[] = [...MASTER_DATA_FIELDS, CHURCH_TAX_LIABLE]

/** What a user without master data has: every field empty. */
const emptyMasterData = () => ({
  geburtsdatum: null,
  strasse: null,
  hausnummer: null,
  hausnummerZusatz: null,
  plz: null,
  wohnort: null,
  beruf: null,
  religion: null,
  familienstand: null,
  familienstandSeit: null,
  iban: null,
  kontoinhaber: null,
  finanzamt: null,
  telefon: null,
  religionEinwilligungAm: null,
})

/** The confirmation path's view of the screen `stammdaten` (ADR-0066). The master data is per user, not per year. */
export function masterDataFieldAccess(masterData: MasterDataRepository): ScreenAccess {
  return {
    fields: MASTER_DATA_ACCESS_FIELDS,
    withInstance: false,
    async read(userId) {
      const m = await masterData.findByUserId(userId)
      const liable = m?.kirchensteuerpflichtig
      return { ...Object.fromEntries(MASTER_DATA_FIELDS.map((f) => [f, m?.[f] ?? null])), [CHURCH_TAX_LIABLE]: liable === true || liable === false ? String(liable) : null }
    },
    async write(userId, _year, _instance, field, value) {
      const current = (await masterData.findByUserId(userId)) ?? emptyMasterData()
      const changes =
        field === CHURCH_TAX_LIABLE
          ? { kirchensteuerpflichtig: value === null ? null : value === 'true' }
          : {
              [field as MasterDataField]: value,
              // Art. 9 DSGVO: the religion is stored only with the moment of the consent (ADR-0091 for the owl's write).
              ...(field === 'religion' ? { religionEinwilligungAm: value === null ? null : new Date() } : {}),
            }
      await masterData.save(userId, { ...current, ...changes })
      return true
    },
  }
}
