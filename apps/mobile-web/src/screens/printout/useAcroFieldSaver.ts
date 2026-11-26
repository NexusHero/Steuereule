import { useQueryClient } from '@tanstack/react-query'
import {
  getCapitalControllerGetQueryKey,
  getChSalaryCertificateControllerGetQueryKey,
  getChildrenControllerListQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getLinkControllerGetQueryKey,
  getLstbControllerGetLstbQueryKey,
  getMasterDataControllerReadQueryKey,
  getPensionControllerGetQueryKey,
  getPrintoutControllerLiveValuesQueryKey,
  getRentalControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useCapitalControllerSetField,
  useChSalaryCertificateControllerSetField,
  useChildrenControllerUpdate,
  useLinkControllerUpdatePersonB,
  useLstbControllerSetField,
  useMasterDataControllerSave,
  usePensionControllerSetField,
  useRentalControllerSetAddress,
  type MasterDataResponseDto,
} from '@steuereule/api-client'
import { toDraft, zuPutDto, type MasterDataDraft } from '../master-data/masterDataMapping'
import {
  acroEditSpec,
  parseAcroInput,
  type AcroInstanceContext,
  type AcroSaveOutcome,
  type DirectAcroEdit,
  type TextAcroEdit,
} from './acroFieldEditing'

export interface AcroSaveContext {
  readonly year: number
  /** Master data is saved as a whole record, so the current one is needed to change one field. */
  readonly masterData: MasterDataResponseDto | null
}

export type SaveAcroField = (acroFieldId: string, rawValue: string, copy: AcroInstanceContext) => Promise<AcroSaveOutcome>

type Target = DirectAcroEdit['endpoint'] | TextAcroEdit['target']

const QUERY_KEY_FOR: Readonly<Record<Target, (year: number) => readonly unknown[]>> = {
  lstb: getLstbControllerGetLstbQueryKey,
  ch: getChSalaryCertificateControllerGetQueryKey,
  kapital: getCapitalControllerGetQueryKey,
  rente: getPensionControllerGetQueryKey,
  stammdaten: () => getMasterDataControllerReadQueryKey(),
  personB: getLinkControllerGetQueryKey,
  child: getChildrenControllerListQueryKey,
  rental: getRentalControllerGetQueryKey,
}

const SAVED = 'saved' as const

/** Master data is saved as a whole record; text fields of the draft are the editable ones. */
type MasterDataTextField = Exclude<keyof MasterDataDraft, 'religion' | 'religionConsent' | 'familienstand'>

/**
 * Writes one editable form field back through the endpoint its mask uses. Returns what happened; every
 * failure rejects (WEB-28) and comes back as `failed` with its error, for the shared wording.
 */
export function useAcroFieldSaver(context: AcroSaveContext): SaveAcroField {
  const queryClient = useQueryClient()
  const lstbSetField = useLstbControllerSetField()
  const chSetField = useChSalaryCertificateControllerSetField()
  const capSetField = useCapitalControllerSetField()
  const pensionSetField = usePensionControllerSetField()
  const masterDataSave = useMasterDataControllerSave()
  const personBUpdate = useLinkControllerUpdatePersonB()
  const childUpdate = useChildrenControllerUpdate()
  const rentalAddress = useRentalControllerSetAddress()
  const { year } = context

  async function saveDirect(spec: DirectAcroEdit, value: number | null): Promise<typeof SAVED> {
    const data = value === null ? { kind: 'offen' as const } : { kind: 'erfasst' as const, value }
    const params = spec.person === 'B' ? { params: { person: 'B' as const } } : {}
    switch (spec.endpoint) {
      case 'lstb':
        await lstbSetField.mutateAsync({ jahr: year, feld: spec.field, data, ...params })
        return SAVED
      case 'ch':
        await chSetField.mutateAsync({ jahr: year, feld: spec.field, data, ...params })
        return SAVED
      case 'kapital':
        await capSetField.mutateAsync({ jahr: year, feld: spec.field, data })
        return SAVED
      case 'rente':
        await pensionSetField.mutateAsync({ jahr: year, feld: spec.field, data, ...params })
        return SAVED
    }
  }

  /** null = the record this field belongs to is not loaded, so there is nothing safe to write to. */
  async function saveText(spec: TextAcroEdit, value: string | null): Promise<typeof SAVED | null> {
    switch (spec.target) {
      case 'stammdaten': {
        if (!context.masterData) return null
        const draft = toDraft(context.masterData)
        draft[spec.field as MasterDataTextField] = value ?? ''
        await masterDataSave.mutateAsync({ data: zuPutDto(draft) })
        return SAVED
      }
      case 'personB':
        await personBUpdate.mutateAsync({ jahr: year, data: { [spec.field]: value } })
        return SAVED
      case 'child':
        if (!spec.entityId || value === null) return null
        await childUpdate.mutateAsync({ jahr: year, id: spec.entityId, data: { [spec.field]: value } })
        return SAVED
      case 'rental':
        if (!spec.entityId || value === null) return null
        await rentalAddress.mutateAsync({ jahr: year, objektId: spec.entityId, data: { [spec.field]: value } })
        return SAVED
    }
  }

  return async (acroFieldId, rawValue, copy) => {
    const spec = acroEditSpec(acroFieldId, copy)
    if (!spec || spec.kind === 'derived') return { kind: 'not-editable' }
    const parsed = parseAcroInput(spec, rawValue)
    if (parsed.kind === 'invalid') return { kind: 'invalid', reason: parsed.reason }
    const value = parsed.kind === 'value' ? parsed.value : null
    try {
      const status =
        spec.kind === 'direct' ? await saveDirect(spec, value as number | null) : await saveText(spec, value as string | null)
      if (status === null) return { kind: 'not-editable' }
    } catch (error) {
      return { kind: 'failed', error }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_FOR[spec.kind === 'direct' ? spec.endpoint : spec.target](year) }),
      queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(year) }),
      queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(year) }),
      queryClient.invalidateQueries({ queryKey: getPrintoutControllerLiveValuesQueryKey(year) }),
    ])
    return { kind: parsed.kind === 'value' ? 'saved' : 'cleared' }
  }
}
