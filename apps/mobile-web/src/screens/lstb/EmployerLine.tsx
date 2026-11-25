import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Feld, Input, useTheme } from '@steuereule/ui'
import { getLstbControllerGetEmployerQueryKey, getYearHistoryControllerGetQueryKey, useLstbControllerGetEmployer, useLstbControllerSetEmployer } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { watchSaveResult } from '../shared/saveFeedback'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { makeStyles } from './ChurchTaxLines'

export interface EmployerLineProps {
  readonly taxYear: number
  readonly params: { readonly person: 'B' } | undefined
  /** usePendingMutations().track of the screen, so leaving waits for the save and shows a failure. */
  readonly track: (promise: Promise<unknown>) => void
}

/**
 * The employer as printed on the Lohnsteuerbescheinigung (ADR-0099 §8). Optional; the Verlauf derives „neuer
 * Arbeitgeber“ from it (§4), nothing else reads it. An empty field clears it.
 */
export function EmployerLine({ taxYear, params, track }: EmployerLineProps) {
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(useTheme())
  const queryClient = useQueryClient()
  const query = useLstbControllerGetEmployer(taxYear, params)
  const save = useLstbControllerSetEmployer()
  const stored = query.data?.data.arbeitgeber ?? ''
  const [text, setText] = useState(stored)
  useEffect(() => setText(stored), [stored])

  if (query.isPending) return <Text style={s.help}>{tr('lstb.arbeitgeber.loading')}</Text>
  if (query.isError) return <InlineLoadFailure what={tr('lstb.arbeitgeber.loadError')} error={query.error} onRetry={() => void query.refetch()} testID="lstb-arbeitgeber-ladefehler" />

  function commit() {
    const value = text.trim()
    if (value === stored.trim()) return
    track(
      watchSaveResult(save.mutateAsync({ jahr: taxYear, data: { arbeitgeber: value === '' ? null : value }, ...(params ? { params } : {}) })).then(() => {
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetEmployerQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getYearHistoryControllerGetQueryKey() })
      }),
    )
  }

  return (
    <View style={s.section}>
      <Text style={s.heading}>{tr('lstb.arbeitgeber.heading')}</Text>
      <Text style={s.help}>{tr('lstb.arbeitgeber.help')}</Text>
      <Feld label={tr('lstb.arbeitgeber.label')}>
        <Input value={text} onChange={setText} placeholder="Muster GmbH" onBlur={commit} onSubmit={commit} accessibilityLabel={tr('lstb.arbeitgeber.label')} testID="lstb-arbeitgeber" />
      </Feld>
    </View>
  )
}
