import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { formatEuro, formatEuroRange, type Answers } from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useMasterDataControllerRead,
  useTaxEstimateControllerGet,
  type TaxEstimateDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { useCockpitTileFacts } from '../cockpit/CockpitTiles'
import type { TileFacts } from '../cockpit/tiles'
import { pathFromAnswers, type FunnelPath } from '../funnel/KontoWandScreen'
import { LstbScreen } from '../lstb/LstbScreen'
import { WorkdaysScreen } from '../workdays/WorkdaysScreen'
import { ChildrenScreen } from '../children/ChildrenScreen'
import { PensionerScreen } from '../pension/PensionerScreen'
import { CrossBorderScreen } from '../cross-border/CrossBorderScreen'
import { AuswahlPage, BasisPage, TopicPage } from './StromPages'
import { effectOf } from './stromEffects'
import {
  isStepOpen,
  nextOpenStep,
  slugOf,
  stepAfter,
  stepBefore,
  stepFromSlug,
  stepPosition,
  stromSteps,
  type StromMaskId,
  type StromStep,
} from './stromPlan'

export interface StromScreenProps {
  readonly taxYear: number
  /** The step's address segment; an unknown one leads to the next open step. */
  readonly slug: string | undefined
  readonly isSignedIn: boolean
  readonly onGo: (step: StromStep) => void
  readonly onExit: () => void
  readonly onOpenSubmission: () => void
  /** A guest has answered the basis: the account wall comes next (the masks need an account). */
  readonly onGuestBasisDone: (path: FunnelPath) => void
}

/** The Strom (ADR-0089): one continuous flow through the return, one address per step. */
export function StromScreen({ taxYear, slug, isSignedIn, onGo, onExit, onOpenSubmission, onGuestBasisDone }: StromScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  const priorQuery = useInterviewControllerGetInterview(taxYear - 1, undefined, { query: { retry: false, enabled: isSignedIn } })
  const masterDataQuery = useMasterDataControllerRead({ query: { enabled: isSignedIn } })
  const interview = interviewQuery.data?.status === 200 ? interviewQuery.data.data : null
  const answers = (interview?.answers ?? {}) as Answers
  const prior = priorQuery.data?.status === 200 ? (priorQuery.data.data.answers as Answers) : {}
  const masterData = masterDataQuery.data?.status === 200 ? masterDataQuery.data.data : null
  const path = interview?.nextStep.kind === 'done' ? pathFromAnswers(answers) : null
  const facts = useCockpitTileFacts(taxYear, isSignedIn, path, answers, masterData)
  const requested = stepFromSlug(slug)
  const settled = interview !== null && !interviewQuery.isFetching
  // An unknown address (e.g. „weiter“ from the cockpit) leads to the step the user continues with,
  // once the answers and the masks' data are in — never a guess from a half-loaded state.
  const continueAt = requested === null && settled ? (isSignedIn ? nextOpenStep(answers, facts) : { kind: 'basis' as const }) : null
  const step = requested ?? continueAt
  // After a save the next step is worked out from the fresh answers: the selection changes the plan.
  const [advanceFrom, setAdvanceFrom] = useState<StromStep | null>(null)

  useEffect(() => {
    if (requested === null && continueAt !== null) onGo(continueAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested === null, continueAt === null])

  // Every later step builds on the basis: while it is still open, it is where the Strom starts.
  const basisOpen = settled && interview.nextStep.kind !== 'done'
  useEffect(() => {
    if (basisOpen && requested !== null && requested.kind !== 'basis') onGo({ kind: 'basis' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basisOpen, requested?.kind])

  useEffect(() => {
    if (advanceFrom === null || !settled || (isSignedIn && facts === null)) return
    setAdvanceFrom(null)
    onGo(stepAfter(advanceFrom, answers, facts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceFrom, settled, facts === null, answers])

  if (interviewQuery.isPending) return <LoadingState bp={bp} label={tr('strom.laden')} />
  if (interviewQuery.isError || interview === null) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('interview.loadError.heading')}
        message={tr('interview.loadError.message')}
        retryLabel={tr('interview.loadError.retry')}
        onRetry={() => void interviewQuery.refetch()}
      />
    )
  }
  if (step === null || requested === null) return <LoadingState bp={bp} label={tr('strom.laden')} />
  if (step.kind !== 'basis' && isSignedIn && facts === null) return <LoadingState bp={bp} label={tr('strom.laden')} />

  const goNext = () => setAdvanceFrom(step)
  const previous = stepBefore(step, answers, facts)
  const goBack = () => (previous === null ? onExit() : onGo(previous))

  // A mask is the mask itself, with its own back button and title; the Strom only decides where it leads.
  if (step.kind === 'maske') {
    return (
      <View style={styles.maskFrame} testID={`strom-schritt-${slugOf(step)}`}>
        <StepBar step={step} answers={answers} facts={facts} onPause={onExit} />
        <MaskStep id={step.id} taxYear={taxYear} onDone={() => goNext()} onBack={goBack} />
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? t.layout.flow.narrow : t.layout.flow.wide} testID="screen-container">
      <View style={styles.header}>
        {step.kind === 'fertig' ? <BackButtonSpacer /> : <BackButton accessibilityLabel={tr('strom.zurueck')} onPress={goBack} testID="strom-zurueck" />}
        <StepCount step={step} answers={answers} facts={facts} />
        <PauseLink onPress={onExit} />
      </View>
      <View testID={`strom-schritt-${slugOf(step)}`}>
        {step.kind === 'basis' ? (
          <BasisPage
            key={`basis-${taxYear}`}
            taxYear={taxYear}
            stored={answers}
            onSaved={(latest) => {
              if (isSignedIn) goNext()
              else onGuestBasisDone(pathFromAnswers(latest))
            }}
          />
        ) : step.kind === 'auswahl' ? (
          <AuswahlPage key={`auswahl-${taxYear}`} taxYear={taxYear} stored={answers} onSaved={goNext} />
        ) : step.kind === 'thema' || step.kind === 'alleinerziehend' ? (
          <TopicPage
            key={slugOf(step)}
            taxYear={taxYear}
            stored={answers}
            prior={prior}
            topic={step.kind === 'thema' ? step.id : 'alleinerziehend'}
            slug={slugOf(step)}
            onSaved={() => goNext()}
          />
        ) : (
          <Summary taxYear={taxYear} answers={answers} facts={facts} onGo={onGo} onOpenSubmission={onOpenSubmission} onExit={onExit} />
        )}
      </View>
    </ScrollView>
  )
}

function StepCount({ step, answers, facts }: { readonly step: StromStep; readonly answers: Answers; readonly facts: TileFacts | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const position = stepPosition(step, answers, facts)
  if (position === null) return <Text style={{ ...t.type.metaLarge, color: t.color.tinte2 }} numberOfLines={1}>{tr('strom.fertigMarke')}</Text>
  return (
    <Text style={{ ...t.type.metaLarge, color: t.color.tinte2 }} numberOfLines={1} testID="strom-position">
      {tr('strom.position', { index: position.index, total: position.total })}
    </Text>
  )
}

function StepBar({ step, answers, facts, onPause }: { readonly step: StromStep; readonly answers: Answers; readonly facts: TileFacts | null; readonly onPause: () => void }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: t.space.s4, paddingTop: t.space.s2 }}>
      <StepCount step={step} answers={answers} facts={facts} />
      <PauseLink onPress={onPause} />
    </View>
  )
}

/** „Später weiter“: a quiet text link back to the cockpit — the page's own Weiter stays the one button. */
function PauseLink({ onPress }: { readonly onPress: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }} testID="strom-pause">
      <Text style={{ ...t.type.label, color: t.color.tinte, textDecorationLine: 'underline' }}>{tr('strom.pause')}</Text>
    </Pressable>
  )
}

function MaskStep({ id, taxYear, onDone, onBack }: { readonly id: StromMaskId; readonly taxYear: number; readonly onDone: () => void; readonly onBack: () => void }) {
  switch (id) {
    case 'lstb':
      return <LstbScreen taxYear={taxYear} onDone={onDone} onBack={onBack} />
    case 'arbeitsweg':
      return <WorkdaysScreen taxYear={taxYear} onDone={onDone} onBack={onBack} />
    case 'kinder':
      return <ChildrenScreen taxYear={taxYear} onDone={onDone} onBack={onBack} />
    case 'rente':
      return <PensionerScreen taxYear={taxYear} onDone={onDone} onBack={onBack} />
    case 'ch':
      return <CrossBorderScreen taxYear={taxYear} onDone={onDone} onBack={onBack} />
  }
}

function refundLine(estimate: TaxEstimateDto | null, tr: (key: string) => string): { readonly label: string; readonly value: string } | null {
  if (estimate?.kind !== 'spanne' || estimate.result == null) return null
  const { from, to } = estimate.result
  const label = from >= 0 ? tr('strom.fertig.erstattung') : to <= 0 ? tr('strom.fertig.nachzahlung') : tr('strom.fertig.ergebnis')
  const lo = Math.min(Math.abs(from), Math.abs(to))
  const hi = Math.max(Math.abs(from), Math.abs(to))
  return { label, value: from === to ? formatEuro(Math.abs(from)) : formatEuroRange(lo, hi) }
}

function Summary({
  taxYear,
  answers,
  facts,
  onGo,
  onOpenSubmission,
  onExit,
}: {
  readonly taxYear: number
  readonly answers: Answers
  readonly facts: TileFacts | null
  readonly onGo: (step: StromStep) => void
  readonly onOpenSubmission: () => void
  readonly onExit: () => void
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const estimateQuery = useTaxEstimateControllerGet(taxYear)
  const estimate = estimateQuery.data?.status === 200 ? estimateQuery.data.data : null
  const refund = refundLine(estimate, (key) => tr(key))
  const steps = facts === null ? [] : stromSteps(answers, facts).filter((s) => s.kind !== 'basis' && s.kind !== 'auswahl' && s.kind !== 'fertig')
  const open = facts === null ? [] : steps.filter((s) => isStepOpen(s, answers, facts))
  const taken = steps.filter((s) => !open.includes(s))
  const titleOf = (s: StromStep) =>
    s.kind === 'maske' ? tr(`strom.maske.${s.id}`) : s.kind === 'thema' ? tr(`strom.thema.${s.id}`) : tr('strom.alleinerziehend.titel')

  return (
    <View>
      <View style={styles.hero} testID="strom-fertig-erstattung">
        <Text style={styles.heroLabel}>{refund?.label ?? tr('strom.fertig.ohneSchaetzung')}</Text>
        {refund !== null ? <Text style={styles.heroValue}>{refund.value}</Text> : null}
      </View>
      {taken.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listTitle}>{tr('strom.fertig.uebernommen')}</Text>
          {taken.map((s) => {
            const effect = effectOf(taxYear, slugOf(s))
            return (
              <View key={slugOf(s)} style={styles.row} testID={`strom-uebernommen-${slugOf(s)}`}>
                <Text style={styles.rowText}>{titleOf(s)}</Text>
                {effect !== null && effect !== 0 ? <Text style={styles.effect}>{`${effect > 0 ? '+' : '−'}${formatEuro(Math.abs(effect))}`}</Text> : null}
              </View>
            )
          })}
        </View>
      ) : null}
      {open.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listTitle}>{tr('strom.fertig.offen')}</Text>
          {open.map((s) => (
            <Button key={slugOf(s)} variant="ghost" onPress={() => onGo(s)} style={styles.openButton} testID={`strom-offen-${slugOf(s)}`}>
              {titleOf(s)}
            </Button>
          ))}
        </View>
      ) : null}
      <Button onPress={onOpenSubmission} testID="strom-abgabe">
        {tr('strom.fertig.abgabe')}
      </Button>
      <Button variant="leise" onPress={onExit} style={styles.openButton} testID="strom-cockpit">
        {tr('strom.fertig.cockpit')}
      </Button>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const header: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space.s4 }
  const maskFrame: ViewStyle = { flex: 1 }
  const hero: ViewStyle = { paddingBottom: t.space.s4, marginBottom: t.space.s4, borderBottomWidth: 1, borderBottomColor: t.color.tinte2 }
  const heroLabel: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const heroValue: TextStyle = { ...t.type.hero, color: t.color.tinte }
  const list: ViewStyle = { marginBottom: t.space.s4 }
  const listTitle: TextStyle = { ...t.type.label, color: t.color.tinte2, marginBottom: t.space.s2 }
  const row: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: t.space.s2 }
  const rowText: TextStyle = { ...t.type.body, color: t.color.tinte }
  const effect: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte }
  const openButton: ViewStyle = { marginTop: t.space.s2 }
  return { header, maskFrame, hero, heroLabel, heroValue, list, listTitle, row, rowText, effect, openButton }
}
