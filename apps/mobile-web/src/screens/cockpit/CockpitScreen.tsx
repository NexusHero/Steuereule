import { useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Card, Chip, HerkunftsChip, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { FristenBanner } from '../fristen/FristenBanner'
import { formatEuro, formatEuroRange, UNCERTAINTY_PER_ITEM } from '@steuereule/core'
import {
  useCockpitControllerGetCockpitSummary,
  useBestaetigungControllerGet,
  useInterviewControllerGetInterview,
  useStammdatenControllerLese,
  useSteuerschaetzungControllerGet,
  type SteuerschaetzungDto,
  type AnlageBestaetigungDto,
  type CockpitStandDto,
  type CockpitSummaryDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { AUSWAHL_STEUERJAHRE, CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { pfadAusAntworten, type FunnelPfad } from '../funnel/KontoWandScreen'


const AUSWAHL_JAHRE = AUSWAHL_STEUERJAHRE

export interface CockpitScreenProps {
  readonly taxYear?: number
  readonly onOpenInterview?: () => void
  readonly onOpenBescheid?: () => void
  readonly onOpenKapital?: () => void
  readonly onOpenVermietung?: () => void
  readonly onOpenKinder?: () => void
  readonly onOpenEulenModus?: (jahr: number) => void
  readonly onOpenAusdruck?: (jahr: number) => void
  readonly onOpenBestaetigung?: (jahr: number) => void
  readonly onContinuePath?: (pfad: FunnelPfad) => void
  readonly onJahrWechsel?: (jahr: number) => void
  readonly onOpenStammdaten?: () => void
}

interface Weiter {
  readonly label: string
  readonly onPress: () => void
}

export function CockpitScreen({
  taxYear = CURRENT_TAX_YEAR,
  onOpenInterview = () => {},
  onOpenBescheid = () => {},
  onOpenKapital = () => {},
  onOpenVermietung = () => {},
  onOpenKinder,
  onOpenEulenModus,
  onOpenAusdruck,
  onOpenBestaetigung,
  onContinuePath,
  onJahrWechsel,
  onOpenStammdaten,
}: CockpitScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const [jahr, setJahrIntern] = useState(taxYear)
  const setJahr = (neu: number) => {
    setJahrIntern(neu)
    onJahrWechsel?.(neu)
  }
  const query = useCockpitControllerGetCockpitSummary(jahr)
  const [pulling, setPulling] = useState(false)
  const bestaetigungQuery = useBestaetigungControllerGet(jahr)
  const interviewQuery = useInterviewControllerGetInterview(jahr)
  const stammdatenQuery = useStammdatenControllerLese()

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
  const refresh: PullToRefresh = {
    pulling,
    onPull: () => {
      setPulling(true)
      void query.refetch().finally(() => setPulling(false))
    },
  }
  const isRefreshing = query.isFetching && !pulling
  const interview = interviewQuery.data?.status === 200 ? interviewQuery.data.data : null
  const pfad = interview?.nextStep.kind === 'done' ? pfadAusAntworten(interview.answers) : null
  const fehlendeAngaben = stammdatenQuery.data?.status === 200 ? stammdatenQuery.data.data.fehlend.length : 0
  const stammdaten: Weiter | null =
    // Stays reachable once complete: it is also the way back to the Veranlagungsart and the partner.
    onOpenStammdaten === undefined
      ? null
      : {
          label: fehlendeAngaben > 0 ? tr('cockpit.stammdatenErgaenzen', { anzahl: fehlendeAngaben }) : tr('cockpit.stammdatenAnsehen'),
          onPress: onOpenStammdaten,
        }
  const weiter: Weiter | null =
    pfad !== null && onContinuePath
      ? { label: tr('cockpit.weiterMitDeinemWeg', { pfad: tr(`funnel.kontoWand.pfad.${pfad}`) }), onPress: () => onContinuePath(pfad) }
      : null

  if (summary === null) {
    return (
      <CockpitEmpty
        jahr={jahr}
        onJahrWechsel={setJahr}
        refresh={refresh}
        isRefreshing={isRefreshing}
        weiter={weiter}
        stammdaten={stammdaten}
        onOpenInterview={onOpenInterview}
        onOpenBescheid={onOpenBescheid}
        onOpenKapital={onOpenKapital}
        onOpenVermietung={onOpenVermietung}
        {...(onOpenKinder ? { onOpenKinder } : {})}
        {...(onOpenEulenModus ? { onOpenEulenModus: () => onOpenEulenModus(jahr) } : {})}
        {...(onOpenAusdruck ? { onOpenAusdruck: () => onOpenAusdruck(jahr) } : {})}
        bp={bp}
      />
    )
  }
  return (
    <CockpitLoaded
      summary={summary}
      jahr={jahr}
      onJahrWechsel={setJahr}
      bestaetigung={bestaetigungQuery.data?.status === 200 ? bestaetigungQuery.data.data.anlagen : null}
      {...(onOpenBestaetigung ? { onOpenBestaetigung: () => onOpenBestaetigung(jahr) } : {})}
      refresh={refresh}
      isRefreshing={isRefreshing}
      weiter={weiter}
      stammdaten={stammdaten}
      onOpenInterview={onOpenInterview}
      onOpenBescheid={onOpenBescheid}
      onOpenKapital={onOpenKapital}
      onOpenVermietung={onOpenVermietung}
      {...(onOpenKinder ? { onOpenKinder } : {})}
      {...(onOpenEulenModus ? { onOpenEulenModus: () => onOpenEulenModus(jahr) } : {})}
      {...(onOpenAusdruck ? { onOpenAusdruck: () => onOpenAusdruck(jahr) } : {})}
      bp={bp}
    />
  )
}

interface PullToRefresh {
  readonly pulling: boolean
  readonly onPull: () => void
}

function Erstattung({ jahr }: { readonly jahr: number }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const query = useSteuerschaetzungControllerGet(jahr)
  const schaetzung: SteuerschaetzungDto | null = query.data?.status === 200 ? query.data.data : null
  return (
    <>
      <Text style={styles.refundLater}>{erstattungsText(schaetzung, tr, i18n.language)}</Text>
      {schaetzung?.kind === 'spanne' && schaetzung.kirchensteuerOffen ? (
        <Text style={styles.refundLater}>{tr('cockpit.erstattung.kirchensteuer')}</Text>
      ) : null}
    </>
  )
}

function erstattungsText(schaetzung: SteuerschaetzungDto | null, tr: TFunction<typeof APP_NS>, sprache: string): string {
  if (schaetzung === null) return tr('cockpit.hero.refundLater')
  if (schaetzung.kind === 'offen') {
    // A married person is never estimated as single (ADR-0054): say what unlocks the couple's estimate.
    if (schaetzung.fehlt?.includes('veranlagungsart')) return tr('cockpit.erstattung.veranlagungsartOffen')
    return tr('cockpit.erstattung.offen', { count: schaetzung.fehlt?.length ?? 0 })
  }
  if (schaetzung.kind === 'nicht-moeglich') return tr(`cockpit.erstattung.grund.${schaetzung.grund ?? 'unbekannt'}`)
  const { von, bis } = schaetzung.ergebnis ?? { von: 0, bis: 0 }
  const betrag = (wert: number) => Math.abs(wert).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE')
  // A range without width ("31.192 – 31.192 €") reads like a typo; it is one figure.
  if (von === bis) return tr(von >= 0 ? 'cockpit.erstattung.erstattungRund' : 'cockpit.erstattung.nachzahlungRund', { betrag: betrag(von) })
  if (von >= 0) return tr('cockpit.erstattung.erstattung', { von: betrag(von), bis: betrag(bis) })
  if (bis <= 0) return tr('cockpit.erstattung.nachzahlung', { von: betrag(bis), bis: betrag(von) })
  return tr('cockpit.erstattung.offenesErgebnis', { nachzahlung: betrag(von), erstattung: betrag(bis) })
}

function Appbar({ jahr, onJahrWechsel, isRefreshing }: { readonly jahr: number; readonly onJahrWechsel: (jahr: number) => void; readonly isRefreshing: boolean }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.appbar}>
      <View style={styles.appbarTitleReihe}>
        <Text style={styles.appbarTitle}>{tr('cockpit.appbarTitle')}</Text>
        {isRefreshing ? <ActivityIndicator size="small" color={t.color.tinte2} accessibilityLabel={tr('cockpit.refreshing')} /> : null}
      </View>
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
  readonly refresh: PullToRefresh
  readonly isRefreshing: boolean
  readonly weiter: Weiter | null
  readonly stammdaten: Weiter | null
  readonly onOpenInterview: () => void
  readonly onOpenBescheid: () => void
  readonly onOpenKapital: () => void
  readonly onOpenVermietung: () => void
  readonly onOpenKinder?: () => void
  readonly onOpenEulenModus?: () => void
  readonly onOpenAusdruck?: () => void
  readonly bp: Breakpoint
}

function CockpitEmpty({ jahr, onJahrWechsel, refresh, isRefreshing, weiter, stammdaten, onOpenInterview, onOpenBescheid, onOpenKapital, onOpenVermietung, onOpenKinder, onOpenEulenModus, bp }: CockpitEmptyProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView
      contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen}
      refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.onPull} />}
      testID="screen-container"
    >
      <Appbar jahr={jahr} onJahrWechsel={onJahrWechsel} isRefreshing={isRefreshing} />
      <FristenBanner taxYear={jahr} />
      <View style={styles.emptyBlock}>
        <Text style={styles.heading}>{tr('cockpit.empty.heading')}</Text>
        <Text style={styles.help}>{tr('cockpit.empty.message')}</Text>
        {weiter ? (
          <Button onPress={weiter.onPress} style={styles.cta} testID="cockpit-weiter">
            {weiter.label}
          </Button>
        ) : (
          <Button onPress={onOpenInterview} style={styles.cta}>
            {tr('cockpit.answerQuestions')}
          </Button>
        )}
        {stammdaten ? (
          <Button variante="ghost" onPress={stammdaten.onPress} style={styles.secondaryCta} testID="cockpit-stammdaten">
            {stammdaten.label}
          </Button>
        ) : null}
        <Button variante="ghost" onPress={onOpenBescheid} style={styles.secondaryCta}>
          {tr('cockpit.checkBescheid')}
        </Button>
        <Button variante="ghost" onPress={onOpenKapital} style={styles.secondaryCta}>
          {tr('cockpit.checkKapital')}
        </Button>
        <Button variante="ghost" onPress={onOpenVermietung} style={styles.secondaryCta}>
          {tr('cockpit.checkVermietung')}
        </Button>
        {onOpenKinder ? (
          <Button variante="ghost" onPress={onOpenKinder} style={styles.secondaryCta} testID="cockpit-empty-kinder">
            {tr('cockpit.checkKinder')}
          </Button>
        ) : null}
        {onOpenEulenModus ? (
          <Button variante="ghost" onPress={onOpenEulenModus} style={styles.secondaryCta} testID="cockpit-empty-eulen-modus">
            {tr('cockpit.eulenModus')}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  )
}

interface BestaetigungHinweisProps {
  readonly anlagen: readonly AnlageBestaetigungDto[] | null
  readonly stand: CockpitStandDto
  readonly onOpenBestaetigung?: () => void
}

function BestaetigungHinweis({ anlagen, stand, onOpenBestaetigung }: BestaetigungHinweisProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const offen = (anlagen ?? []).filter((a) => a.unbestaetigt > 0)
  if (offen.length === 0) return null
  const summe = stand.kind === 'spanne' ? (stand.unbestaetigteSumme ?? 0) : 0

  return (
    <Card variant="default" testID="bestaetigung-hinweis">
      <Text style={styles.help}>
        {summe > 0 ? tr('cockpit.bestaetigung.hinweis', { count: offen.reduce((n, a) => n + a.unbestaetigt, 0), summe: formatEuro(summe) }) : tr('cockpit.bestaetigung.hinweisOhneSumme')}
      </Text>
      {offen.map((a) => (
        <View key={a.anlage} style={styles.uebernahmeZeile}>
          <Text style={styles.uebernahmeZeileText}>
            {tr('cockpit.bestaetigung.anlage', {
              anlage: tr(`bestaetigung.anlagen.${a.anlage}`),
              anzahl: tr('bestaetigung.unbestaetigt', { count: a.unbestaetigt }),
            })}
          </Text>
        </View>
      ))}
      {onOpenBestaetigung ? (
        <Button variante="ghost" onPress={onOpenBestaetigung} testID="bestaetigung-oeffnen">
          {tr('cockpit.bestaetigung.pruefen')}
        </Button>
      ) : null}
    </Card>
  )
}

interface CockpitLoadedProps {
  readonly summary: CockpitSummaryDto
  readonly jahr: number
  readonly onJahrWechsel: (jahr: number) => void
  readonly bestaetigung: readonly AnlageBestaetigungDto[] | null
  readonly onOpenBestaetigung?: () => void
  readonly refresh: PullToRefresh
  readonly isRefreshing: boolean
  readonly weiter: Weiter | null
  readonly stammdaten: Weiter | null
  readonly onOpenInterview: () => void
  readonly onOpenBescheid: () => void
  readonly onOpenKapital: () => void
  readonly onOpenVermietung: () => void
  readonly onOpenKinder?: () => void
  readonly onOpenEulenModus?: () => void
  readonly onOpenAusdruck?: () => void
  readonly bp: Breakpoint
}

function CockpitLoaded({ summary, jahr, onJahrWechsel, bestaetigung, onOpenBestaetigung, refresh, isRefreshing, weiter, stammdaten, onOpenInterview, onOpenBescheid, onOpenKapital, onOpenVermietung, onOpenKinder, onOpenEulenModus, onOpenAusdruck, bp }: CockpitLoadedProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { openItems, stand } = summary
  const hasOpenItems = openItems > 0

  return (
    <ScrollView
      contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen}
      refreshControl={<RefreshControl refreshing={refresh.pulling} onRefresh={refresh.onPull} />}
      testID="screen-container"
    >
      <Appbar jahr={jahr} onJahrWechsel={onJahrWechsel} isRefreshing={isRefreshing} />
      <FristenBanner taxYear={jahr} />
      <BestaetigungHinweis anlagen={bestaetigung} stand={stand} {...(onOpenBestaetigung ? { onOpenBestaetigung } : {})} />
      <Card variant="nacht">
        <Text style={styles.heroLabel}>{tr('cockpit.hero.label')}</Text>
        {stand.kind === 'gated' ? (
          <GatedHero stand={stand} />
        ) : (
          <NumericHero stand={stand} />
        )}
        <Text style={styles.openItems}>{tr('cockpit.hero.openItems', { count: openItems })}</Text>
        <Erstattung jahr={jahr} />
      </Card>
      {weiter ? (
        <Button onPress={weiter.onPress} style={styles.cta} testID="cockpit-weiter">
          {weiter.label}
        </Button>
      ) : hasOpenItems ? (
        <Button onPress={onOpenInterview} style={styles.cta}>
          {tr('cockpit.answerQuestions')}
        </Button>
      ) : null}
      {stammdaten ? (
        <Button variante="ghost" onPress={stammdaten.onPress} style={styles.secondaryCta} testID="cockpit-stammdaten">
          {stammdaten.label}
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
      {onOpenKinder ? (
        <Button
          variante="ghost"
          onPress={onOpenKinder}
          style={styles.secondaryCta}
          testID="cockpit-kinder"
        >
          {tr('cockpit.checkKinder')}
        </Button>
      ) : null}
      {onOpenEulenModus ? (
        <Button
          variante="ghost"
          onPress={onOpenEulenModus}
          style={styles.secondaryCta}
          testID="cockpit-eulen-modus"
        >
          {tr('cockpit.eulenModus')}
        </Button>
      ) : null}
      {onOpenAusdruck ? (
        <Button variante="ghost" onPress={onOpenAusdruck} style={styles.secondaryCta} testID="cockpit-ausdruck">
          {tr('ausdruck.cockpitCta')}
        </Button>
      ) : null}
    </ScrollView>
  )
}

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
        {heroDisplay(stand, tr('cockpit.hero.nochOffen'))}
      </Text>
      {stand.kind === 'spanne' && (stand.offenePosten ?? 0) > 0 ? (
        <Text style={styles.offenePosten}>{tr('cockpit.hero.offenePosten', { count: stand.offenePosten ?? 0 })}</Text>
      ) : null}
      <HerkunftsChip quelle={quelle} />
    </>
  )
}

/**
 * A range that starts at 0 € only says "nothing reliable is entered yet" — "0–120 €" would read as a
 * real figure, so the hero says the income is still open instead.
 */
function heroDisplay(stand: CockpitStandDto, stillOpen: string): string {
  if (stand.kind === 'bestimmt') return formatEuro(stand.wert ?? 0)
  if ((stand.von ?? 0) === 0) return stillOpen
  return formatEuroRange(stand.von ?? 0, stand.bis ?? 0)
}

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
  const appbarTitleReihe: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const appbarTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
  }
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

  return { screen, wideScreen, appbar, appbarTitleReihe, appbarTitle, jahrReihe, uebernahmeZeile, uebernahmeZeileText, heading, help, cta, secondaryCta, emptyBlock, heroLabel, heroValue, openItems, offenePosten, refundLater, gatedHeading, gatedBody }
}
