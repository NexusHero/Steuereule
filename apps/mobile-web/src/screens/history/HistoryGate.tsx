import type { ReactNode } from 'react'
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useYearHistoryControllerGet, type YearHistoryResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { historyStyles } from './historyStyles'

export interface HistoryGateProps {
  readonly isGuest: boolean
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
  /** The screen for the loaded history; the tab, the year page and the development share one request. */
  readonly children: (data: YearHistoryResponseDto) => ReactNode
}

/** `GET /v1/verlauf` once for the tab and its pages, with the honest states: guest, loading, error. */
export function HistoryGate({ isGuest, onRegister, onLogin, children }: HistoryGateProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const query = useYearHistoryControllerGet({ query: { enabled: !isGuest } })

  if (isGuest) return <GuestState onRegister={onRegister} onLogin={onLogin} />
  if (query.isPending) return <LoadingState bp={bp} label={tr('verlauf.laden')} />
  if (!query.isError && query.data.status === 401) return <GuestState onRegister={onRegister} onLogin={onLogin} />
  if (query.isError || query.data.status !== 200) {
    return <ErrorState bp={bp} heading={tr('verlauf.fehler.titel')} message={tr('verlauf.fehler.text')} retryLabel={tr('verlauf.fehler.erneut')} onRetry={() => void query.refetch()} testID="verlauf-fehler" />
  }
  return <>{children(query.data.data)}</>
}

function GuestState({ onRegister, onLogin }: { readonly onRegister?: (() => void) | undefined; readonly onLogin?: (() => void) | undefined }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? s.screen : s.wideScreen} testID="screen-container">
      <HistoryHeader />
      <View style={s.card} testID="verlauf-gast">
        <Text style={s.cardTitle}>{tr('verlauf.gast.titel')}</Text>
        <Text style={s.muted}>{tr('verlauf.gast.text')}</Text>
        <View style={s.buttonRow}>
          {onRegister ? (
            <Button onPress={onRegister} testID="verlauf-gast-registrieren">
              {tr('verlauf.gast.registrieren')}
            </Button>
          ) : null}
          {onLogin ? (
            <Button variant="ghost" onPress={onLogin} testID="verlauf-gast-anmelden">
              {tr('verlauf.gast.anmelden')}
            </Button>
          ) : null}
        </View>
      </View>
    </ScrollView>
  )
}

/** „Alle Steuerjahre · 2021–2026“ over „Verlauf“, as the tab's title. */
export function HistoryHeader({ range }: { readonly range?: string | undefined }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={s.header}>
      <Text style={s.eyebrow}>{range ? tr('verlauf.eyebrowZeitraum', { zeitraum: range }) : tr('verlauf.eyebrow')}</Text>
      <Text style={s.title} accessibilityRole="header" testID="verlauf-titel">
        {tr('verlauf.titel')}
      </Text>
    </View>
  )
}

/** The screen frame the Verlauf's pages share: the overview layout of the cockpit. */
export function historyScreenStyles(t: UiTheme) {
  const screen: ViewStyle = { ...t.layout.overview.narrow, gap: t.space.s4, paddingBottom: t.space.s7 }
  const wideScreen: ViewStyle = { ...t.layout.overview.wide, gap: t.space.s4, paddingBottom: t.space.s7 }
  const title: TextStyle = { ...t.type.title, color: t.color.tinte }
  return { screen, wideScreen, title }
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const header: ViewStyle = { gap: 2 }
  const buttonRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  return { ...base, ...historyScreenStyles(t), header, buttonRow }
}
