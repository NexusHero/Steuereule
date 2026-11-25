import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@steuereule/ui'
import {
  getLstbControllerGetLinesQueryKey,
  getLstbControllerGetSubsidiesQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useLstbControllerGetLines,
  useLstbControllerGetSubsidies,
  useLstbControllerSetSubsidies,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { watchSaveResult } from '../shared/saveFeedback'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { LineInput, makeStyles } from './ChurchTaxLines'

export interface SubsidyLineProps {
  readonly taxYear: number
  readonly params: { readonly person: 'B' } | undefined
  /** usePendingMutations().track of the screen, so leaving waits for the save and shows a failure. */
  readonly track: (promise: Promise<unknown>) => void
}

/**
 * LStB Zeile 24 a–c (ADR-0090): the employer's tax-free subsidies to health and care insurance. Optional;
 * whoever has them deducts only what they bore themselves, so the estimate takes them off.
 */
export function SubsidyLine({ taxYear, params, track }: SubsidyLineProps) {
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(useTheme())
  const queryClient = useQueryClient()
  const query = useLstbControllerGetSubsidies(taxYear, params)
  const save = useLstbControllerSetSubsidies()
  const lines = useLstbControllerGetLines(taxYear, params)

  if (query.isPending) return <Text style={s.help}>{tr('lstb.zuschuesse.loading')}</Text>
  if (query.isError) return <InlineLoadFailure what={tr('lstb.zuschuesse.loadError')} error={query.error} onRetry={() => void query.refetch()} testID="lstb-zuschuesse-ladefehler" />
  const stored = query.data.data.zuschuesseKvPv
  // A failed lines query only hides this hint; the field itself is the subsidies' own query.
  const subsidyOpen = lines.data?.data.subsidyOpen === true

  function commit(value: number | null) {
    if (stored === value) return
    track(
      watchSaveResult(save.mutateAsync({ jahr: taxYear, data: { zuschuesseKvPv: value }, ...(params ? { params } : {}) })).then(() => {
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetSubsidiesQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLinesQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
      }),
    )
  }

  return (
    <View style={s.section}>
      <Text style={s.heading}>{tr('lstb.zuschuesse.heading')}</Text>
      <Text style={s.help}>{tr('lstb.zuschuesse.help')}</Text>
      <LineInput label={tr('lstb.zuschuesse.zeile24')} stored={stored} onCommit={commit} testID="lstb-zuschuesse" />
      {subsidyOpen ? (
        <Text style={s.error} accessibilityRole="alert" testID="lstb-zuschuesse-offen">
          {tr('lstb.zuschuesse.offen')}
        </Text>
      ) : null}
    </View>
  )
}
