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
// action: while items are open, it's "Fragen beantworten", routing to the real Minimal-Gate
// (`onOpenInterview`, REQ-015/#318 task 2 — the revisit this file itself announced, steuereule#93:
// "no Belege/Interview screen exists yet ... revisit the CTA's target once the app widens" is now
// true) — "Aktualisieren" demotes to the secondary slot alongside it. With nothing open (or no
// tax year yet), refresh is the only honest action left, so it stays primary. Copy via i18n (de +
// en, ADR-0006). No entrance/step animation, so `prefers-reduced-motion` is honored by omission
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
  /** Opens the Minimal-Gate (REQ-015/#318) — wired at the composition root (ADR-0023); this
   *  screen never imports the router itself. Defaults to a no-op so every existing call site
   *  (and every test that doesn't care about this flow) keeps compiling unchanged. */
  readonly onOpenInterview?: () => void
}

export function CockpitScreen({ taxYear = CURRENT_TAX_YEAR, onOpenInterview = () => {} }: CockpitScreenProps) {
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
    return <CockpitEmpty taxYear={taxYear} onRefresh={onRefresh} isRefreshing={query.isFetching} onOpenInterview={onOpenInterview} bp={bp} />
  }
  return (
    <CockpitLoaded
      summary={summary}
      taxYear={taxYear}
      onRefresh={onRefresh}
      isRefreshing={query.isFetching}
      onOpenInterview={onOpenInterview}
      bp={bp}
    />
  )
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
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
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
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <Text style={styles.heading} accessibilityRole="alert">
        {tr('cockpit.loadError.heading')}
      </Text>
      <Text style={styles.help}>{tr('cockpit.loadError.message')}</Text>
      <Button onPress={onRetry}>
        {tr('cockpit.loadError.retry')}
      </Button>
    </View>
  )
}

interface CockpitEmptyProps {
  readonly taxYear: number
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
  readonly onOpenInterview: () => void
  readonly bp: Breakpoint
}

function CockpitEmpty({ taxYear, onRefresh, isRefreshing, onOpenInterview, bp }: CockpitEmptyProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar taxYear={taxYear} />
      <View style={styles.emptyBlock}>
        <Text style={styles.heading}>{tr('cockpit.empty.heading')}</Text>
        <Text style={styles.help}>{tr('cockpit.empty.message')}</Text>
        {/* The empty state IS the "no interview answers yet" case (REQ-015's GWT opening
            clause) — without this, a brand-new account has no TaxYear row and therefore no
            way to ever reach the Minimal-Gate from Cockpit at all (found by actually driving
            this screen against a fresh account, real API, real Postgres — #318 task 2). */}
        <Button onPress={onOpenInterview} style={styles.cta}>
          {tr('cockpit.answerQuestions')}
        </Button>
        <Button variante="ghost" onPress={onRefresh} disabled={isRefreshing} style={styles.secondaryCta}>
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
  readonly onOpenInterview: () => void
  readonly bp: Breakpoint
}

function CockpitLoaded({ summary, taxYear, onRefresh, isRefreshing, onOpenInterview, bp }: CockpitLoadedProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { openItems } = summary
  // One primary action per screen (design-system CLAUDE.md): while there's something to
  // resolve, that's it — "Aktualisieren" moves to the secondary/ghost slot alongside it. With
  // nothing open, refresh is the only honest action, so it keeps the primary slot.
  const hasOpenItems = openItems > 0

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
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
      {hasOpenItems ? (
        <Button onPress={onOpenInterview} style={styles.cta}>
          {tr('cockpit.answerQuestions')}
        </Button>
      ) : null}
      <Button
        variante={hasOpenItems ? 'ghost' : 'primaer'}
        onPress={onRefresh}
        disabled={isRefreshing}
        style={hasOpenItems ? styles.secondaryCta : styles.cta}
      >
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
  // #176: `cta`'s marginTop applies at the Loaded screen's primary button (after Card — nothing
  // before it already claims the seam) and at Empty's own primary "Fragen beantworten" (#318
  // task 2 — Empty gained a second button, so it now needs the same explicit spacing Loaded
  // uses, rather than relying solely on `help`'s `marginBottom` the way a single button could).
  // The LoadError button alone still passes no `style`: `centerScreen`'s own `gap` and the
  // preceding help text's `marginBottom` already supply its leading space.
  const cta: ViewStyle = { marginTop: t.space.s4 }
  // Only used once "Fragen beantworten" already claimed `cta`'s marginTop — the secondary
  // "Aktualisieren" needs its own, smaller gap underneath it, not a doubled one.
  const secondaryCta: ViewStyle = { marginTop: t.space.s3 }
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

  return { screen, wideScreen, centerScreen, wideCenterScreen, appbar, appbarTitle, heading, help, cta, secondaryCta, emptyBlock, heroLabel, heroValue, openItems }
}
