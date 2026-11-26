import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Feld, Input, useTheme } from '@steuereule/ui'
import {
  getLstbControllerGetLinesQueryKey,
  getLstbControllerGetLstbQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useLstbControllerGetLines,
  useLstbControllerSetLines,
  type LstbLinesDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { watchSaveResult } from '../shared/saveFeedback'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { eurosWithCentsOrUnreadable } from '../shared/amountField'
import { parseGermanAmount } from '../shared/germanNumber'
import { LineInput, makeStyles } from './ChurchTaxLines'

type WholeLine = 'rvArbeitgeber' | 'rvArbeitnehmer' | 'kvArbeitnehmer' | 'pvArbeitnehmer' | 'avArbeitnehmer' | 'zuschussPv'
const WHOLE_LINES: readonly WholeLine[] = ['rvArbeitgeber', 'rvArbeitnehmer', 'kvArbeitnehmer', 'pvArbeitnehmer', 'avArbeitnehmer', 'zuschussPv']

/** Euros with cents from a text field, typed the German way (WEB-46). Empty or malformed is not a value. */
export function euroCentsFrom(text: string): number | null {
  return parseGermanAmount(text)
}

export interface SocialInsuranceLinesProps {
  readonly taxYear: number
  readonly params: { readonly person: 'B' } | undefined
  /** usePendingMutations().track of the screen, so leaving waits for the save and shows a failure. */
  readonly track: (promise: Promise<unknown>) => void
}

/** LStB Zeilen 22–27, 24c and 5 (ADR-0093): the single social-security lines; the app sums 23+25+26+27. */
export function SocialInsuranceLines({ taxYear, params, track }: SocialInsuranceLinesProps) {
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(useTheme())
  const queryClient = useQueryClient()
  const query = useLstbControllerGetLines(taxYear, params)
  const save = useLstbControllerSetLines()

  if (query.isPending) return <Text style={s.help}>{tr('lstb.zeilen.loading')}</Text>
  if (query.isError) return <InlineLoadFailure what={tr('lstb.zeilen.loadError')} error={query.error} onRetry={() => void query.refetch()} testID="lstb-zeilen-ladefehler" />
  const stored = query.data.data

  function commit(line: keyof LstbLinesDto, value: number | null) {
    if (stored[line] === value) return
    track(
      watchSaveResult(save.mutateAsync({ jahr: taxYear, data: { [line]: value }, ...(params ? { params } : {}) })).then(() => {
        // The server also stores the sum as the main Sozialversicherung field.
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLinesQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) })
        void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
      }),
    )
  }

  return (
    <View style={s.section}>
      <Text style={s.heading}>{tr('lstb.zeilen.heading')}</Text>
      <Text style={s.help}>{tr('lstb.zeilen.help')}</Text>
      {WHOLE_LINES.map((line) => (
        <LineInput
          key={line}
          label={tr(`lstb.zeilen.${line}`)}
          stored={stored[line]}
          onCommit={(v) => commit(line, v)}
          testID={`lstb-zeilen-${line}`}
        />
      ))}
      <EuroCentsInput
        label={tr('lstb.zeilen.solidaritaetszuschlag')}
        stored={stored.solidaritaetszuschlag}
        onCommit={(v) => commit('solidaritaetszuschlag', v)}
        testID="lstb-zeilen-solidaritaetszuschlag"
      />
      {stored.sozialversicherung !== null ? (
        <Text style={s.help} testID="lstb-zeilen-summe">
          {tr('lstb.zeilen.summe', { betrag: stored.sozialversicherung.toLocaleString('de-DE') })} ({tr('lstb.zeilen.summeHinweis')})
        </Text>
      ) : null}
    </View>
  )
}

function EuroCentsInput({ label, stored, onCommit, testID }: { label: string; stored: number | null; onCommit: (value: number | null) => void; testID: string }) {
  const { t: tr } = useTranslation(APP_NS)
  const format = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))
  const [text, setText] = useState(format(stored))
  const [unreadable, setUnreadable] = useState(false)
  useEffect(() => setText(format(stored)), [stored])
  const commit = () => {
    const value = eurosWithCentsOrUnreadable(text)
    setUnreadable(value === 'unreadable')
    if (value !== 'unreadable') onCommit(value)
  }
  return (
    <Feld label={label} {...(unreadable ? { error: tr('betrag.unlesbar') } : {})}>
      <Input
        type="numeric"
        mono
        value={text}
        onChange={(next) => {
          setText(next)
          setUnreadable(false)
        }}
        placeholder={tr('lstb.feld.placeholderCent')}
        onSubmit={commit}
        onBlur={commit}
        accessibilityLabel={label}
        testID={testID}
      />
    </Feld>
  )
}
