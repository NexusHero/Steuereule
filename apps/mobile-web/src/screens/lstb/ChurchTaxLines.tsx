import { useEffect, useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Feld, Input, useTheme, type UiTheme } from '@steuereule/ui'
import {
  getLstbControllerGetChurchTaxQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useLstbControllerGetChurchTax,
  useLstbControllerSetChurchTax,
  type LstbChurchTaxDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/integer'
import { watchSaveResult } from '../shared/saveFeedback'

type Line = keyof LstbChurchTaxDto

export interface ChurchTaxLinesProps {
  readonly taxYear: number
  readonly params: { readonly person: 'B' } | undefined
  /** usePendingMutations().track of the screen, so leaving waits for the save and shows a failure. */
  readonly track: (promise: Promise<unknown>) => void
}

/** LStB Zeilen 6 und 7 (#450 Teil 6F, ADR-0063): optional, next to the three required fields. */
export function ChurchTaxLines({ taxYear, params, track }: ChurchTaxLinesProps) {
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(useTheme())
  const queryClient = useQueryClient()
  const query = useLstbControllerGetChurchTax(taxYear, params)
  const save = useLstbControllerSetChurchTax()

  if (query.isPending) return <Text style={s.help}>{tr('lstb.kirchensteuer.loading')}</Text>
  if (query.isError || query.data.status !== 200) return <Text style={s.error}>{tr('lstb.kirchensteuer.loadError')}</Text>
  const stored = query.data.data

  function commit(line: Line, value: number | null) {
    if (stored[line] === value) return
    const data: LstbChurchTaxDto = { ...stored, [line]: value }
    track(
      watchSaveResult(save.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) })).then(() => {
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetChurchTaxQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
      }),
    )
  }

  return (
    <View style={s.section}>
      <Text style={s.heading}>{tr('lstb.kirchensteuer.heading')}</Text>
      <Text style={s.help}>{tr('lstb.kirchensteuer.help')}</Text>
      <LineInput label={tr('lstb.kirchensteuer.zeile6')} stored={stored.kirchensteuer} onCommit={(v) => commit('kirchensteuer', v)} testID="lstb-kirchensteuer" />
      <LineInput
        label={tr('lstb.kirchensteuer.zeile7')}
        stored={stored.kirchensteuerEhegatte}
        onCommit={(v) => commit('kirchensteuerEhegatte', v)}
        testID="lstb-kirchensteuer-ehegatte"
      />
    </View>
  )
}

function LineInput({ label, stored, onCommit, testID }: { label: string; stored: number | null; onCommit: (value: number | null) => void; testID: string }) {
  const { t: tr } = useTranslation(APP_NS)
  const [text, setText] = useState(stored === null ? '' : String(stored))
  useEffect(() => setText(stored === null ? '' : String(stored)), [stored])
  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === '') return onCommit(null)
    const value = integerFrom(trimmed)
    if (value !== null && value >= 0) onCommit(value)
  }
  return (
    <Feld label={label}>
      <Input
        type="numeric"
        mono
        value={text}
        onChange={setText}
        placeholder={tr('lstb.feld.placeholder')}
        onSubmit={commit}
        onBlur={commit}
        accessibilityLabel={`${label} (${tr('lstb.feld.placeholder')})`}
        testID={testID}
      />
    </Feld>
  )
}

function makeStyles(t: UiTheme): { section: ViewStyle; heading: TextStyle; help: TextStyle; error: TextStyle } {
  return {
    section: { marginTop: t.space.s5, marginBottom: t.space.s4 },
    heading: { ...t.type.cardTitle, color: t.color.tinte, marginBottom: t.space.s2 },
    help: { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s3 },
    error: { ...t.type.body, color: t.color.tinte, marginBottom: t.space.s3 },
  }
}
