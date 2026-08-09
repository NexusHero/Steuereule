// InterviewScreen (REQ-015, #318 task 1b) — the Minimal-Gate: three questions (job, ausland,
// kinder), one per screen, plus the two hard branches (Gewerbe-Gate, CH-only-Gate). Renders
// entirely against `nextStep()` from `@steuereule/core` — the deterministic question graph
// (ADR-0033) — never branches on an answer itself. No network call in this slice (#318 task
// 1b): answers live in this component's own state only, in memory, and are never written to
// localStorage/AsyncStorage (ADR-0008) — task 2 swaps this for the real POST/GET endpoints
// once the API contract lands (task 1a), without changing what's rendered for a given path.
//
// Screen form is ported from the design-system reference (Interview.jsx): the question screens'
// header (back button, dashed progress bar with `role="progressbar"`, step pill, :210-222) and
// both gates' wording/pattern (Gewerbe :78-89, CH-only :141-159) — but NOT its question set
// (nine questions/six branches; ADR-0031 fixes this slice at three) and NOT its two now-removed
// buttons: ADR-0032 drops the Gewerbe gate's "notify me" button (#83 is unbuilt) and the CH-only
// gate's "Vormerken" button (no storage decided) — neither is rendered, not disabled, not
// "coming soon". The money sticker / running estimate is out for the same ADR (D1) and isn't
// referenced here at all.
//
// Gates are answerable steps, not client-remembered screens (ADR-0033): "seen and carried on"
// is stored as an answer (`GATE_ACKNOWLEDGED`) like any question, which is what lets `nextStep`
// move past a non-terminal gate. The Gewerbe gate is terminal for `job === 'Selbstständig'`
// (product ADR-028) — that screen offers no forward action at all, only the honest text and a
// way back to change the answer; `job === 'Beides'` is explicitly passable (ADR-028's
// "collect the employee part") and keeps its "prepare" button.
//
// Back navigation moves one step at a time through whatever was actually visited (questions and
// acknowledged gates alike) by discarding that step's stored answer, so `nextStep(answers)`
// naturally recomputes back to it — no separate "current step" state to keep in sync. This
// diverges from the DS prototype's cosmetic pre-selection-on-back (it never needs to invalidate
// downstream answers because its question order never branches) — with a real graph, keeping a
// stale downstream answer around while an earlier answer changes would let `nextStep` read past
// data that's no longer valid, so this implementation clears it instead. See this slice's PR
// description for a fuller note.
//
// `nextStep` reaching `{ kind: 'done' }` has no design-system artifact and no product ruling for
// this slice — routing on to the Cockpit is task 2's job once the real endpoints exist. Rendering
// nothing here is the honest choice (ADR-0032): inventing placeholder content would be exactly
// what that ADR forbids.
import { useEffect, useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle, type ViewProps } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Option, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import {
  nextStep,
  GATE_ACKNOWLEDGED,
  JOB_VALUES,
  AUSLAND_VALUES,
  KINDER_VALUES,
  QUESTION_ORDER,
  type Answers,
  type StepId,
  type QuestionId,
  type GateId,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'

export interface InterviewScreenProps {
  /** Fires exactly once, when `nextStep(answers)` first reaches `{ kind: 'done' }`. */
  readonly onDone: () => void
}

export function InterviewScreen({ onDone }: InterviewScreenProps) {
  const bp = useBreakpoint()
  const [answers, setAnswers] = useState<Answers>({})
  const [history, setHistory] = useState<readonly StepId[]>([])
  const current = nextStep(answers)

  // `current.kind` flips from a question/gate to 'done' exactly once — once reached, this
  // component renders nothing and offers no further interaction, so the effect cannot re-fire.
  useEffect(() => {
    if (current.kind === 'done') onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.kind])

  function answer(stepId: StepId, value: string) {
    setHistory((h) => [...h, stepId])
    setAnswers((a) => ({ ...a, [stepId]: value }))
  }

  function back() {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      if (prev === undefined) return h
      setAnswers((a) => {
        const next = { ...a }
        delete next[prev]
        return next
      })
      return h.slice(0, -1)
    })
  }

  if (current.kind === 'done') {
    return null
  }

  if (current.kind === 'gate') {
    return <GateScreen gateId={current.id} job={answers.job} onAcknowledge={(value) => answer(current.id, value)} onBack={back} bp={bp} />
  }

  return (
    <QuestionScreen
      questionId={current.id}
      canGoBack={history.length > 0}
      onAnswer={(value) => answer(current.id, value)}
      onBack={back}
      bp={bp}
    />
  )
}

// ---------------------------------------------------------------------------------------------
// Question screen — job | ausland | kinder
// ---------------------------------------------------------------------------------------------

interface OptionSpec<V extends string> {
  readonly value: V
  readonly labelKey: string
}

const JOB_OPTIONS: ReadonlyArray<OptionSpec<(typeof JOB_VALUES)[number]>> = [
  { value: 'Angestellt', labelKey: 'interview.job.options.angestellt' },
  { value: 'Selbstständig', labelKey: 'interview.job.options.selbststaendig' },
  { value: 'Beides', labelKey: 'interview.job.options.beides' },
  { value: 'Rente', labelKey: 'interview.job.options.rente' },
]
const AUSLAND_OPTIONS: ReadonlyArray<OptionSpec<(typeof AUSLAND_VALUES)[number]>> = [
  { value: 'Ja, in die Schweiz', labelKey: 'interview.ausland.options.schweiz' },
  { value: 'In ein anderes Land', labelKey: 'interview.ausland.options.andereLand' },
  { value: 'Nein', labelKey: 'interview.ausland.options.nein' },
]
const KINDER_OPTIONS: ReadonlyArray<OptionSpec<(typeof KINDER_VALUES)[number]>> = [
  { value: 'Nein', labelKey: 'interview.kinder.options.nein' },
  { value: '1 Kind', labelKey: 'interview.kinder.options.einKind' },
  { value: '2 oder mehr', labelKey: 'interview.kinder.options.mehrere' },
]

const QUESTION_COPY: Record<QuestionId, { readonly titleKey: string; readonly helpKey: string; readonly options: ReadonlyArray<OptionSpec<string>> }> = {
  job: { titleKey: 'interview.job', helpKey: 'interview.job.help', options: JOB_OPTIONS },
  ausland: { titleKey: 'interview.ausland', helpKey: 'interview.ausland.help', options: AUSLAND_OPTIONS },
  kinder: { titleKey: 'interview.kinder', helpKey: 'interview.kinder.help', options: KINDER_OPTIONS },
}

interface QuestionScreenProps {
  readonly questionId: QuestionId
  readonly canGoBack: boolean
  readonly onAnswer: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
}

function QuestionScreen({ questionId, canGoBack, onAnswer, onBack, bp }: QuestionScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const copy = QUESTION_COPY[questionId]
  const stepIndex = QUESTION_ORDER.indexOf(questionId)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {canGoBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('onboarding.back')} onPress={onBack} style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <StepIndicator step={stepIndex} total={QUESTION_ORDER.length} />
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>{`${stepIndex + 1}/${QUESTION_ORDER.length}`}</Text>
        </View>
      </View>

      <Text style={styles.heading}>
        {tr(`${copy.titleKey}.titleBefore`)}
        <Text style={styles.mark}>{tr(`${copy.titleKey}.titleMark`)}</Text>
        {tr(`${copy.titleKey}.titleAfter`)}
      </Text>
      <Text style={styles.help}>{tr(copy.helpKey)}</Text>

      {copy.options.map((opt) => (
        <Option key={opt.value} onPress={() => onAnswer(opt.value)}>
          {tr(opt.labelKey)}
        </Option>
      ))}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------------------------
// Gate screens — Gewerbe | CH-only (ADR-0032: no "notify me" / "Vormerken" controls)
// ---------------------------------------------------------------------------------------------

interface GateScreenProps {
  readonly gateId: GateId
  readonly job: string | undefined
  readonly onAcknowledge: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
}

function GateScreen({ gateId, job, onAcknowledge, onBack, bp }: GateScreenProps) {
  if (gateId === 'gewerbe') {
    return <GewerbeGate job={job} onAcknowledge={onAcknowledge} onBack={onBack} bp={bp} />
  }
  return <ChOnlyGate onAcknowledge={onAcknowledge} onBack={onBack} bp={bp} />
}

function GewerbeGate({ job, onAcknowledge, onBack, bp }: { readonly job: string | undefined; readonly onAcknowledge: (value: string) => void; readonly onBack: () => void; readonly bp: Breakpoint }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  // Product ADR-028: "Selbstständig" is a full stop — this screen offers no forward action at
  // all, only the honest text and the way back to change the answer. "Beides" is explicitly
  // passable and keeps the "prepare the employee part" button (ADR-0032: it promises nothing
  // external, unlike the removed notify-me button).
  const passable = job === 'Beides'

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.gateScreen : styles.wideGateScreen} testID="screen-container">
      <Text style={styles.gateHeading}>{tr('interview.gewerbe.heading')}</Text>
      <Text style={styles.help}>{tr('interview.gewerbe.body1')}</Text>
      <Text style={styles.help}>{tr('interview.gewerbe.body2')}</Text>
      {passable ? (
        <Option onPress={() => onAcknowledge(GATE_ACKNOWLEDGED)}>{tr('interview.gewerbe.prepareEmployeePart')}</Option>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.gateBackLink}>
        <Text style={styles.gateBackLinkText}>{tr('interview.back')}</Text>
      </Pressable>
    </ScrollView>
  )
}

function ChOnlyGate({ onAcknowledge, onBack, bp }: { readonly onAcknowledge: (value: string) => void; readonly onBack: () => void; readonly bp: Breakpoint }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.gateScreen : styles.wideGateScreen} testID="screen-container">
      <Text style={styles.gateHeading}>{tr('interview.chOnly.heading')}</Text>
      <Text style={styles.help}>{tr('interview.chOnly.body1')}</Text>
      <Text style={styles.help}>{tr('interview.chOnly.body2')}</Text>
      <Option onPress={() => onAcknowledge(GATE_ACKNOWLEDGED)}>{tr('interview.chOnly.continueWithoutForeign')}</Option>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.gateBackLink}>
        <Text style={styles.gateBackLinkText}>{tr('interview.back')}</Text>
      </Pressable>
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------------------------
// Step indicator — ported from OnboardingScreen.tsx's identical pattern (dashed progress bar,
// `role="progressbar"`, DS reference :216-220).
// ---------------------------------------------------------------------------------------------

interface StepIndicatorProps {
  readonly step: number
  readonly total: number
}

// React-Native-Web forwards a step indicator's ARIA min/max/now from the flat legacy
// `accessibilityValueMin/Max/Now` props, not from RN's `accessibilityValue` object — see
// OnboardingScreen.tsx's identical note (verified against RNW's forwardedProps/createDOMProps).
type WebProgressAria = Pick<ViewProps, never>

function StepIndicator({ step, total }: StepIndicatorProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const ariaProps = {
    accessibilityValueMin: 1,
    accessibilityValueMax: total,
    accessibilityValueNow: step + 1,
  } as unknown as WebProgressAria

  return (
    <View accessibilityRole="progressbar" style={styles.progressRow} {...ariaProps}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.segment, i <= step ? styles.segmentFilled : null]} />
      ))}
    </View>
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
  const gateScreen: ViewStyle = { ...screen, paddingTop: t.space.s6 }
  const wideGateScreen: ViewStyle = { ...gateScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingBottom: t.space.s5 }
  const backButton: ViewStyle = {
    width: 44,
    height: 44,
    borderRadius: t.radius.pille,
    borderWidth: 2,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadow.hartS,
  }
  const backArrow: TextStyle = { fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const backSpacer: ViewStyle = { width: 44, height: 44 }
  const progressRow: ViewStyle = { flexDirection: 'row', gap: t.space.s1, flex: 1 }
  const segment: ViewStyle = { flex: 1, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: t.color.tinte, backgroundColor: t.color.karte }
  const segmentFilled: ViewStyle = { backgroundColor: t.color.funke }
  const stepPill: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    paddingVertical: 4,
    paddingHorizontal: 12,
  }
  const stepPillText: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
  }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const gateHeading: TextStyle = { ...heading, marginBottom: t.space.s3 }
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    marginBottom: t.space.s3,
  }
  const gateBackLink: ViewStyle = { alignSelf: 'center', marginTop: t.space.s3, minHeight: 44, justifyContent: 'center' }
  const gateBackLinkText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte, textDecorationLine: 'underline' }

  return {
    screen,
    wideScreen,
    gateScreen,
    wideGateScreen,
    headerRow,
    backButton,
    backArrow,
    backSpacer,
    progressRow,
    segment,
    segmentFilled,
    stepPill,
    stepPillText,
    heading,
    gateHeading,
    mark,
    help,
    gateBackLink,
    gateBackLinkText,
  }
}
