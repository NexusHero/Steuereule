import { useState } from 'react'
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { YearHistoryResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BackButton } from '../shared/BackButton'
import { HistoryDevelopment } from './HistoryDevelopment'
import { HistoryGate, historyScreenStyles } from './HistoryGate'
import { PersonToggle } from './PersonToggle'
import { historyStyles } from './historyStyles'
import type { HistoryPerson } from './historyFormat'

export interface HistoryDevelopmentScreenProps {
  readonly isGuest: boolean
  /** The year open in the app (the context of the Lohnsteuerbescheinigung upload of an old year). */
  readonly openYear: number
  readonly onBack: () => void
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
  /** „Bescheid ↔ Erklärung“ in a year's detail opens that year's page. */
  readonly onOpenYearDetail?: ((year: number) => void) | undefined
  readonly onOpenDrafts?: (() => void) | undefined
}

/** „Entwicklung über die Jahre“ on its own page, one tap from the timeline (ADR-0098 §1, §2). */
export function HistoryDevelopmentScreen(props: HistoryDevelopmentScreenProps) {
  return (
    <HistoryGate isGuest={props.isGuest} onRegister={props.onRegister} onLogin={props.onLogin}>
      {(data) => <DevelopmentLoaded {...props} data={data} />}
    </HistoryGate>
  )
}

function DevelopmentLoaded({ data, openYear, onBack, onOpenYearDetail, onOpenDrafts }: HistoryDevelopmentScreenProps & { readonly data: YearHistoryResponseDto }) {
  const bp = useBreakpoint()
  const wide = bp !== 's'
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const years = data.years
  const [person, setPerson] = useState<HistoryPerson>('beide')
  const [selected, setSelected] = useState<number | null>(() => initialYear(data))
  const household = years.some((y) => y.persons.includes('B'))
  const back = <BackButton accessibilityLabel={tr('verlauf.zurueck')} onPress={onBack} testID="verlauf-entwicklung-zurueck" />

  if (years.length === 0) {
    return (
      <ScrollView contentContainerStyle={wide ? s.wideScreen : s.screen} testID="screen-container">
        {back}
        <View style={s.card} testID="verlauf-entwicklung-leer">
          <Text style={s.cardTitle}>{tr('verlauf.leer.titel')}</Text>
          <Text style={s.muted}>{tr('verlauf.leer.text')}</Text>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={wide ? s.wideScreen : s.screen} testID="screen-container">
      {back}
      <View style={s.headRow}>
        <View style={s.head}>
          <Text style={s.eyebrow}>{tr('verlauf.eyebrowZeitraum', { zeitraum: `${years[0]!.year}–${years[years.length - 1]!.year}` })}</Text>
          <Text style={s.title} accessibilityRole="header" testID="verlauf-entwicklung-titel">
            {tr('verlauf.entwicklung')}
          </Text>
        </View>
        {wide && household ? <PersonToggle person={person} onChange={setPerson} /> : null}
      </View>
      <HistoryDevelopment
        data={data}
        person={person}
        onPersonChange={setPerson}
        showPersonToggle={!wide && household}
        selectedYear={selected ?? years[years.length - 1]!.year}
        onSelectYear={setSelected}
        onOpenDiff={(year) => onOpenYearDetail?.(year)}
        openYear={openYear}
        onOpenDrafts={onOpenDrafts}
      />
    </ScrollView>
  )
}

/** The year the detail opens with, as the tab did: the highlighted deadline, else the newest year with an Abgleich. */
function initialYear(data: YearHistoryResponseDto): number | null {
  const highlighted = data.openItems.find((o) => o.highlighted)
  if (highlighted) return highlighted.year
  return [...data.diffs].sort((a, b) => b.year - a.year)[0]?.year ?? null
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const head: ViewStyle = { gap: 2, flexShrink: 1 }
  const headRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: t.space.s3 }
  const title: TextStyle = { ...t.type.title, color: t.color.tinte }
  return { ...base, ...historyScreenStyles(t), head, headRow, title }
}
