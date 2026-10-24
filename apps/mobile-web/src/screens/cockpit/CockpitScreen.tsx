// Cockpit (F: Cockpit.jsx in Funke dress) — the screen a user lands on after Onboarding. REQ-001
// (steuereule#3/#93): the walking-skeleton slice builds only the hero estimate card — the
// Spannen-Ticker (refund estimate range, ADR-015) + "N Angaben offen" + provenance. The rest of
// the full DS Cockpit is deliberately out of scope here per ADR-0005 ("walking skeleton first").
//
// Data comes from the generated `useCockpitControllerGetCockpitSummary` hook (orval-generated
// against the real `GET /v1/steuerjahre/{jahr}/cockpit`, #119). Honest states throughout: a real
// loading spinner, a real "noch keine Angaben" empty state, and a retryable error state — never
// mock/fallback data. Loading/error now render through the shared `LoadingState`/`ErrorState`
// (Phase 0.3 AC-3) instead of this screen's own private copies.
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, HerkunftsChip, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { formatEuro, formatEuroRange, UNCERTAINTY_PER_ITEM } from '@steuereule/core'
import { useCockpitControllerGetCockpitSummary, type CockpitStandDto, type CockpitSummaryDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'

export interface CockpitScreenProps {
  readonly taxYear?: number
  /** Opens the Minimal-Gate (REQ-015/#318) — wired at the composition root (ADR-0023); this
   *  screen never imports the router itself. Defaults to a no-op so existing call sites and
   *  tests that don't care about this flow keep compiling unchanged. */
  readonly onOpenInterview?: () => void
  /** Opens the Bescheidprüfung (REQ-023/ticket 10.3) — same composition-root wiring. */
  readonly onOpenBescheid?: () => void
}

export function CockpitScreen({ taxYear = CURRENT_TAX_YEAR, onOpenInterview = () => {}, onOpenBescheid = () => {} }: CockpitScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const query = useCockpitControllerGetCockpitSummary(taxYear)

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('cockpit.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('cockpit.loadError.heading')}
        message={tr('cockpit.loadError.message')}
        retryLabel={tr('cockpit.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }
  const summary = query.data.data
  const onRefresh = () => void query.refetch()

  if (summary === null) {
    return <CockpitEmpty taxYear={taxYear} onRefresh={onRefresh} isRefreshing={query.isFetching} onOpenInterview={onOpenInterview} onOpenBescheid={onOpenBescheid} bp={bp} />
  }
  return (
    <CockpitLoaded
      summary={summary}
      taxYear={taxYear}
      onRefresh={onRefresh}
      isRefreshing={query.isFetching}
      onOpenInterview={onOpenInterview}
      onOpenBescheid={onOpenBescheid}
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

interface CockpitEmptyProps {
  readonly taxYear: number
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
  readonly onOpenInterview: () => void
  readonly onOpenBescheid: () => void
  readonly bp: Breakpoint
}

function CockpitEmpty({ taxYear, onRefresh, isRefreshing, onOpenInterview, onOpenBescheid, bp }: CockpitEmptyProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar taxYear={taxYear} />
      <View style={styles.emptyBlock}>
        <Text style={styles.heading}>{tr('cockpit.empty.heading')}</Text>
        <Text style={styles.help}>{tr('cockpit.empty.message')}</Text>
        {/* The empty state IS the "no interview answers yet" case (REQ-015's GWT opening clause) —
            without this, a brand-new account has no TaxYear row and no way to reach the
            Minimal-Gate from Cockpit at all (#318 task 2). */}
        <Button onPress={onOpenInterview} style={styles.cta}>
          {tr('cockpit.answerQuestions')}
        </Button>
        <Button variante="ghost" onPress={onOpenBescheid} style={styles.secondaryCta}>
          {tr('cockpit.checkBescheid')}
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
  readonly onOpenBescheid: () => void
  readonly bp: Breakpoint
}

function CockpitLoaded({ summary, taxYear, onRefresh, isRefreshing, onOpenInterview, onOpenBescheid, bp }: CockpitLoadedProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { openItems, stand } = summary
  // One primary action per screen (design-system CLAUDE.md): while there's something to
  // resolve, that's it — "Aktualisieren" moves to the secondary/ghost slot. With nothing open,
  // refresh is the only honest action, so it keeps the primary slot.
  const hasOpenItems = openItems > 0

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar taxYear={taxYear} />
      <Card variant="nacht">
        <Text style={styles.heroLabel}>{tr('cockpit.hero.label')}</Text>
        {stand.kind === 'gated' ? (
          <GatedHero stand={stand} />
        ) : (
          <NumericHero stand={stand} />
        )}
        <Text style={styles.openItems}>{tr('cockpit.hero.openItems', { count: openItems })}</Text>
        <Text style={styles.refundLater}>{tr('cockpit.hero.refundLater')}</Text>
      </Card>
      {hasOpenItems ? (
        <Button onPress={onOpenInterview} style={styles.cta}>
          {tr('cockpit.answerQuestions')}
        </Button>
      ) : null}
      <Button
        variante="ghost"
        onPress={onOpenBescheid}
        style={styles.secondaryCta}
      >
        {tr('cockpit.checkBescheid')}
      </Button>
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

/** The deterministic number, as a point value or a range, with its provenance (ADR-015). */
function NumericHero({ stand }: { readonly stand: CockpitStandDto }) {
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(useTheme())
  const rechenweg =
    stand.kind === 'spanne'
      ? tr('cockpit.hero.herkunftRechenweg', { count: stand.offenePosten ?? 0, perItem: formatEuro(UNCERTAINTY_PER_ITEM) })
      : undefined
  const quelle = rechenweg === undefined ? { regel: tr('cockpit.hero.herkunftRegel') } : { regel: tr('cockpit.hero.herkunftRegel'), rechenweg }
  return (
    <>
      <Text style={styles.heroValue}>
        {stand.kind === 'bestimmt' ? formatEuro(stand.wert ?? 0) : formatEuroRange(stand.von ?? 0, stand.bis ?? 0)}
      </Text>
      {stand.kind === 'spanne' && (stand.offenePosten ?? 0) > 0 ? (
        <Text style={styles.offenePosten}>{tr('cockpit.hero.offenePosten', { count: stand.offenePosten ?? 0 })}</Text>
      ) : null}
      <HerkunftsChip quelle={quelle} />
    </>
  )
}

/** ADR-032 — a gated Einkunftsart is named, never widened into a fake numeric range. */
function GatedHero({ stand }: { readonly stand: CockpitStandDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      <Text style={styles.gatedHeading}>{tr('cockpit.hero.gatedHeading')}</Text>
      {(stand.gegated ?? []).map((name) => (
        <Text key={name} style={styles.gatedBody}>
          {tr('cockpit.hero.gatedBody', { name })}
        </Text>
      ))}
    </>
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
  const offenePosten: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.85,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    marginTop: t.space.s2,
  }
  const refundLater: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.6,
    fontFamily: t.font.text,
    fontSize: t.size.xs,
    marginTop: t.space.s2,
  }
  const gatedHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.funke,
    marginBottom: t.space.s2,
  }
  const gatedBody: TextStyle = {
    color: t.color.nachtText,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    marginBottom: t.space.s2,
  }

  return { screen, wideScreen, appbar, appbarTitle, heading, help, cta, secondaryCta, emptyBlock, heroLabel, heroValue, openItems, offenePosten, refundLater, gatedHeading, gatedBody }
}
