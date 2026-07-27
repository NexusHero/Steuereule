// Cockpit (F: Cockpit.jsx in Funke dress) — the screen a user lands on after Onboarding. REQ-001
// (steuereule#3/#93): the walking-skeleton slice builds only the hero estimate card — the
// Spannen-Ticker (refund estimate range, ADR-015) + "N Angaben offen" + provenance — from
// finanzo-funke-design-system/project/ui_kits/app/Cockpit.jsx (lines ~113-129). The rest of the
// full DS Cockpit (Vollständigkeits-Ring, Eulen/Berater card, GG-Tracker, Bescheid, Lebenslagen,
// …) is deliberately out of scope here per ADR-0005 ("walking skeleton first, the app widens
// screen by screen") — those become their own REQs once their own backend data exists.
//
// Data comes from the generated `useCockpitControllerGetCockpitSummary` hook (@steuereule/api-client,
// orval-generated from apps/api/openapi.json against the real `GET /v1/steuerjahre/{jahr}/cockpit`
// endpoint, #119) — the R2 swap off the provisional contract-pinned client now that the backend has
// landed (steuereule#91). Honest states throughout: a real loading spinner
// while in flight, a real "noch keine Angaben" empty state when the API has no tax year yet, and
// a retryable error state on genuine failure — never mock/fallback data. Exactly one primary
// action (a functioning "Aktualisieren" refetch): no Belege/Interview screen exists yet to route
// "resolve your open items" to, so refresh is the one honest, real action available at this slice
// (see steuereule#93 — revisit the CTA's target once the app widens). Copy via i18n (de + en,
// ADR-0006). No entrance/step animation, so `prefers-reduced-motion` is honored by omission
// (design-system CLAUDE.md).
import { ActivityIndicator, ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, HerkunftsChip, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { formatEuro, formatEuroRange, UNCERTAINTY_PER_ITEM } from '@steuereule/core'
import { useCockpitControllerGetCockpitSummary, type CockpitSummaryDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'

export interface CockpitScreenProps {
  readonly taxYear?: number
}

export function CockpitScreen({ taxYear = CURRENT_TAX_YEAR }: CockpitScreenProps) {
  const bp = useBreakpoint()
  const query = useCockpitControllerGetCockpitSummary(taxYear)

  if (query.isPending) {
    return <CockpitLoading bp={bp} />
  }
  if (query.isError || query.data.status !== 200) {
    return <CockpitLoadError onRetry={() => void query.refetch()} bp={bp} />
  }
  const summary = query.data.data
  const onRefresh = () => void query.refetch()

  if (summary === null) {
    return <CockpitEmpty taxYear={taxYear} onRefresh={onRefresh} isRefreshing={query.isFetching} bp={bp} />
  }
  return <CockpitLoaded summary={summary} taxYear={taxYear} onRefresh={onRefresh} isRefreshing={query.isFetching} bp={bp} />
}

function Appbar({ taxYear }: { readonly taxYear: number }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.appbar}>
      <Text style={styles.appbarTitle}>{tr('cockpit.appbarTitle')}</Text>
      <Pill>{String(taxYear)}</Pill>
    </View>
  )
}

function CockpitLoading({ bp }: { readonly bp: Breakpoint }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} data-testid="screen-container">
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('cockpit.loading')} />
      <Text style={styles.help}>{tr('cockpit.loading')}</Text>
    </View>
  )
}

interface CockpitLoadErrorProps {
  readonly onRetry: () => void
  readonly bp: Breakpoint
}

function CockpitLoadError({ onRetry, bp }: CockpitLoadErrorProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} data-testid="screen-container">
      <Text style={styles.heading} accessibilityRole="alert">
        {tr('cockpit.loadError.heading')}
      </Text>
      <Text style={styles.help}>{tr('cockpit.loadError.message')}</Text>
      <Button onPress={onRetry} style={styles.cta}>
        {tr('cockpit.loadError.retry')}
      </Button>
    </View>
  )
}

interface CockpitEmptyProps {
  readonly taxYear: number
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
  readonly bp: Breakpoint
}

function CockpitEmpty({ taxYear, onRefresh, isRefreshing, bp }: CockpitEmptyProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} data-testid="screen-container">
      <Appbar taxYear={taxYear} />
      <View style={styles.emptyBlock}>
        <Text style={styles.heading}>{tr('cockpit.empty.heading')}</Text>
        <Text style={styles.help}>{tr('cockpit.empty.message')}</Text>
        <Button onPress={onRefresh} disabled={isRefreshing} style={styles.cta}>
          {isRefreshing ? tr('cockpit.refreshing') : tr('cockpit.refresh')}
        </Button>
      </View>
    </ScrollView>
  )
}

interface CockpitLoadedProps {
  readonly summary: CockpitSummaryDto
  readonly taxYear: number
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
  readonly bp: Breakpoint
}

function CockpitLoaded({ summary, taxYear, onRefresh, isRefreshing, bp }: CockpitLoadedProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { openItems } = summary

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} data-testid="screen-container">
      <Appbar taxYear={taxYear} />
      <Card variant="nacht">
        <Text style={styles.heroLabel}>{tr('cockpit.hero.label')}</Text>
        <Text style={styles.heroValue}>{formatEuroRange(summary.estimate.from, summary.estimate.to)}</Text>
        <Text style={styles.openItems}>{tr('cockpit.hero.openItems', { count: openItems })}</Text>
        <HerkunftsChip
          quelle={{
            regel: tr('cockpit.hero.herkunftRegel'),
            rechenweg: tr('cockpit.hero.herkunftRechenweg', { count: openItems, perItem: formatEuro(UNCERTAINTY_PER_ITEM) }),
          }}
        />
      </Card>
      <Button onPress={onRefresh} disabled={isRefreshing} style={styles.cta}>
        {isRefreshing ? tr('cockpit.refreshing') : tr('cockpit.refresh')}
      </Button>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const centerScreen: ViewStyle = {
    ...screen,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s3,
  }
  const wideCenterScreen: ViewStyle = { ...centerScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const appbar: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: t.space.s4,
  }
  const appbarTitle: TextStyle = {
    // `.appbar h1` in the DS reference is `font-size: var(--text-2xl)` (32px), weight 800.
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
  }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
    textAlign: 'center',
  }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    marginBottom: t.space.s3,
    textAlign: 'center',
  }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  const emptyBlock: ViewStyle = { alignItems: 'center', paddingVertical: t.space.s6 }
  const heroLabel: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s2,
  }
  const heroValue: TextStyle = {
    // 44px matches the DS reference exactly (Cockpit.jsx hero: fontSize 44 === theme's `3xl`).
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.funke,
    fontVariant: ['tabular-nums'],
    lineHeight: t.size['3xl'] * 1.05,
  }
  const openItems: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.75,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    marginTop: t.space.s2,
    marginBottom: t.space.s3,
  }

  return { screen, wideScreen, centerScreen, wideCenterScreen, appbar, appbarTitle, heading, help, cta, emptyBlock, heroLabel, heroValue, openItems }
}
