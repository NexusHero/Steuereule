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
import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, HerkunftsChip, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { FristenBanner } from '../fristen/FristenBanner'
import { formatEuro, formatEuroRange, uebernahmeHerkunft, UNCERTAINTY_PER_ITEM } from '@steuereule/core'
import {
  useCockpitControllerGetCockpitSummary,
  useUebernahmeControllerGet,
  useUebernahmeControllerBestaetige,
  type CockpitStandDto,
  type CockpitSummaryDto,
  type UebernahmeKennzeichnungDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'

/** ADR-022: die Jahr-Auswahl zeigt das aktuelle Jahr und bis zu 4 Rückjahre („Hol dir 4 Jahre"). */
const JAHRE_ZURUECK = 4

/** The selectable years, newest first: CURRENT_TAX_YEAR … CURRENT_TAX_YEAR - 4. */
const AUSWAHL_JAHRE = Array.from({ length: JAHRE_ZURUECK + 1 }, (_, i) => CURRENT_TAX_YEAR - i)

export interface CockpitScreenProps {
  readonly taxYear?: number
  /** Opens the Minimal-Gate (REQ-015/#318) — wired at the composition root (ADR-0023); this
   *  screen never imports the router itself. Defaults to a no-op so existing call sites and
   *  tests that don't care about this flow keep compiling unchanged. */
  readonly onOpenInterview?: () => void
  /** Opens the Bescheidprüfung (REQ-023/ticket 10.3) — same composition-root wiring. */
  readonly onOpenBescheid?: () => void
  /** Opens the Kapital guided mask + Günstigerprüfung (REQ-025/ticket 10.5) — same wiring. */
  readonly onOpenKapital?: () => void
  /** Opens the Vermietung guided mask (REQ-026/ticket 10.6) — same wiring. */
  readonly onOpenVermietung?: () => void
  /** ADR-0050: opens the Formular-Ausdruck for the year shown. Omitted = no entry rendered. */
  readonly onOpenAusdruck?: (jahr: number) => void
}

export function CockpitScreen({ taxYear = CURRENT_TAX_YEAR, onOpenInterview = () => {}, onOpenBescheid = () => {}, onOpenKapital = () => {}, onOpenVermietung = () => {}, onOpenAusdruck }: CockpitScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  // ADR-022 — die prominente Jahr-Auswahl: das gewählte Jahr ist SCREEN-State (kein globaler
  // Kontext; ehrlich benannt), der Cockpit-Query läuft pro Jahr (der Query-Key trägt das Jahr).
  const [jahr, setJahr] = useState(taxYear)
  const query = useCockpitControllerGetCockpitSummary(jahr)
  // Ticket 10.8 (ADR-021) — die Übernahme-Kennzeichnungen des gewählten Jahres; der Hinweis
  // erscheint nur, wenn sie da sind (ein fehlender Query bricht den Cockpit nie).
  const uebernahmeQuery = useUebernahmeControllerGet(jahr)
  const bestaetige = useUebernahmeControllerBestaetige()

  const onBestaetige = async (postenKey: string) => {
    await bestaetige.mutateAsync({ jahr, postenKey })
    void query.refetch()
    void uebernahmeQuery.refetch()
  }

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
    return <CockpitEmpty jahr={jahr} onJahrWechsel={setJahr} onRefresh={onRefresh} isRefreshing={query.isFetching} onOpenInterview={onOpenInterview} onOpenBescheid={onOpenBescheid} onOpenKapital={onOpenKapital} onOpenVermietung={onOpenVermietung} bp={bp} />
  }
  return (
    <CockpitLoaded
      summary={summary}
      jahr={jahr}
      onJahrWechsel={setJahr}
      uebernahme={uebernahmeQuery.data?.status === 200 ? uebernahmeQuery.data.data.kennzeichnungen : null}
      onBestaetige={onBestaetige}
      isBestaetigend={bestaetige.isPending}
      onRefresh={onRefresh}
      isRefreshing={query.isFetching}
      onOpenInterview={onOpenInterview}
      onOpenBescheid={onOpenBescheid}
      onOpenKapital={onOpenKapital}
      onOpenVermietung={onOpenVermietung}
      {...(onOpenAusdruck ? { onOpenAusdruck: () => onOpenAusdruck(jahr) } : {})}
      bp={bp}
    />
  )
}

function Appbar({ jahr, onJahrWechsel }: { readonly jahr: number; readonly onJahrWechsel: (jahr: number) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.appbar}>
      <Text style={styles.appbarTitle}>{tr('cockpit.appbarTitle')}</Text>
      {/* ADR-022 — bis 4 Rückjahre, aktiv beworben: das gewählte Jahr ist gefüllt, der Rest
          wählbar. */}
      <View style={styles.jahrReihe} accessibilityLabel={tr('cockpit.jahrAuswahl')}>
        {AUSWAHL_JAHRE.map((y) => (
          <Chip key={y} aktiv={y === jahr} onPress={() => onJahrWechsel(y)} testID={`jahr-${y}`}>
            {String(y)}
          </Chip>
        ))}
      </View>
    </View>
  )
}

interface CockpitEmptyProps {
  readonly jahr: number
  readonly onJahrWechsel: (jahr: number) => void
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
  readonly onOpenInterview: () => void
  readonly onOpenBescheid: () => void
  readonly onOpenKapital: () => void
  readonly onOpenVermietung: () => void
  readonly onOpenAusdruck?: () => void
  readonly bp: Breakpoint
}

function CockpitEmpty({ jahr, onJahrWechsel, onRefresh, isRefreshing, onOpenInterview, onOpenBescheid, onOpenKapital, onOpenVermietung, bp }: CockpitEmptyProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar jahr={jahr} onJahrWechsel={onJahrWechsel} />
      {/* REQ-027 (ticket 10.7) — der Fristen-Warnmodus: ein Banner, NIE ein Status (ADR-0039);
          rendert nichts bei `keine`. */}
      <FristenBanner taxYear={jahr} />
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
        <Button variante="ghost" onPress={onOpenKapital} style={styles.secondaryCta}>
          {tr('cockpit.checkKapital')}
        </Button>
        <Button variante="ghost" onPress={onOpenVermietung} style={styles.secondaryCta}>
          {tr('cockpit.checkVermietung')}
        </Button>
        <Button variante="ghost" onPress={onRefresh} disabled={isRefreshing} style={styles.secondaryCta}>
          {isRefreshing ? tr('cockpit.refreshing') : tr('cockpit.refresh')}
        </Button>
      </View>
    </ScrollView>
  )
}

/**
 * Der Label-Name eines kopierten Fakts (ADR-021) — die Kennzeichnungs-Schlüssel der
 * Jahresübernahme (M2: lstb/rente/kapital/vermietung-<id>).
 */
function postenLabel(tr: ReturnType<typeof useTranslation>['t'], postenKey: string): string {
  if (postenKey === 'lstb') return tr('cockpit.uebernahme.postenLstb')
  if (postenKey === 'rente') return tr('cockpit.uebernahme.postenRente')
  if (postenKey === 'kapital') return tr('cockpit.uebernahme.postenKapital')
  if (postenKey.startsWith('vermietung-')) return tr('cockpit.uebernahme.postenVermietung')
  return postenKey
}

interface UebernahmeHinweisProps {
  readonly uebernahme: readonly UebernahmeKennzeichnungDto[] | null
  readonly stand: CockpitStandDto
  readonly onBestaetige: (postenKey: string) => void
  readonly isBestaetigend: boolean
}

/**
 * Ticket 10.8 (ADR-021) — der ruhige Übernahme-Hinweis: unbestätigte, kopierte Posten warten auf
 * EIN Antippen (oder einen Beleg). Grau und ruhig benannt, nie ein Konflikt (ADR-008 ist für
 * Widersprüche); die Summe, die die Spanne trägt, wird ehrlich zitiert; jede Kennzeichnung trägt
 * ihre Herkunft mit Jahresbezug (ADR-022) und wird einzeln bestätigt.
 */
function UebernahmeHinweis({ uebernahme, stand, onBestaetige, isBestaetigend }: UebernahmeHinweisProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const unbestaetigte = (uebernahme ?? []).filter((k) => !k.bestaetigt)
  if (unbestaetigte.length === 0) return null
  const summe = stand.kind === 'spanne' ? (stand.unbestaetigteSumme ?? 0) : 0

  return (
    <Card variant="default" testID="uebernahme-hinweis">
      <Text style={styles.help}>
        {summe > 0 ? tr('cockpit.uebernahme.hinweis', { count: unbestaetigte.length, summe: formatEuro(summe) }) : tr('cockpit.uebernahme.hinweisOhneSumme')}
      </Text>
      {unbestaetigte.map((k) => (
        <View key={k.postenKey} style={styles.uebernahmeZeile}>
          <Text style={styles.uebernahmeZeileText}>
            {postenLabel(tr, k.postenKey)} · {uebernahmeHerkunft(k.vorjahr)}
          </Text>
          <Button variante="ghost" onPress={() => onBestaetige(k.postenKey)} disabled={isBestaetigend} testID={`bestaetige-${k.postenKey}`}>
            {tr('cockpit.uebernahme.bestaetigen')}
          </Button>
        </View>
      ))}
    </Card>
  )
}

interface CockpitLoadedProps {
  readonly summary: CockpitSummaryDto
  readonly jahr: number
  readonly onJahrWechsel: (jahr: number) => void
  /** Die Übernahme-Kennzeichnungen des Jahres, oder null wenn der Query noch lief/scheiterte. */
  readonly uebernahme: readonly UebernahmeKennzeichnungDto[] | null
  readonly onBestaetige: (postenKey: string) => void
  readonly isBestaetigend: boolean
  readonly onRefresh: () => void
  readonly isRefreshing: boolean
  readonly onOpenInterview: () => void
  readonly onOpenBescheid: () => void
  readonly onOpenKapital: () => void
  readonly onOpenVermietung: () => void
  readonly onOpenAusdruck?: () => void
  readonly bp: Breakpoint
}

function CockpitLoaded({ summary, jahr, onJahrWechsel, uebernahme, onBestaetige, isBestaetigend, onRefresh, isRefreshing, onOpenInterview, onOpenBescheid, onOpenKapital, onOpenVermietung, onOpenAusdruck, bp }: CockpitLoadedProps) {
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
      <Appbar jahr={jahr} onJahrWechsel={onJahrWechsel} />
      {/* REQ-027 (ticket 10.7) — der Fristen-Warnmodus: ein Banner, NIE ein Status (ADR-0039). */}
      <FristenBanner taxYear={jahr} />
      {/* Ticket 10.8 (ADR-021) — der ruhige Übernahme-Hinweis: unbestätigte Posten aus der
          Jahresübernahme, einzeln bestätigt. Grau und ruhig, nie ein Konflikt. */}
      <UebernahmeHinweis uebernahme={uebernahme} stand={stand} onBestaetige={onBestaetige} isBestaetigend={isBestaetigend} />
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
        variante="ghost"
        onPress={onOpenKapital}
        style={styles.secondaryCta}
      >
        {tr('cockpit.checkKapital')}
      </Button>
      <Button
        variante="ghost"
        onPress={onOpenVermietung}
        style={styles.secondaryCta}
      >
        {tr('cockpit.checkVermietung')}
      </Button>
      {onOpenAusdruck ? (
        <Button variante="ghost" onPress={onOpenAusdruck} style={styles.secondaryCta} testID="cockpit-ausdruck">
          {tr('ausdruck.cockpitCta')}
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
  // ADR-022 — die Jahr-Auswahl: eine Chip-Reihe, das gewählte Jahr gefüllt (aktiv).
  const jahrReihe: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: t.space.s1,
    maxWidth: '55%',
  }
  const uebernahmeZeile: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s3,
    marginTop: t.space.s3,
  }
  const uebernahmeZeileText: TextStyle = {
    flex: 1,
    flexWrap: 'wrap',
    color: t.color.tinte,
    fontSize: t.size.s,
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

  return { screen, wideScreen, appbar, appbarTitle, jahrReihe, uebernahmeZeile, uebernahmeZeileText, heading, help, cta, secondaryCta, emptyBlock, heroLabel, heroValue, openItems, offenePosten, refundLater, gatedHeading, gatedBody }
}
