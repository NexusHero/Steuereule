// InterviewScreen (REQ-015, #318 task 2 — joins task 1b to the real endpoints) — the
// Minimal-Gate: three questions (job, ausland, kinder), one per screen, plus the two hard
// branches (Gewerbe-Gate, CH-only-Gate).
//
// Screen form is ported from the design-system reference (Interview.jsx): the question screens'
// header (back button, dashed progress bar with `role="progressbar"`, step pill, :210-222) and
// both gates' wording/pattern (Gewerbe :78-89, CH-only :141-159) — but NOT its question set
// (nine questions/six branches; ADR-0031 fixes this slice at three) and NOT its two now-removed
// buttons: ADR-0032 drops the Gewerbe gate's "notify me" button (#83 is unbuilt) and the CH-only
// gate's "Vormerken" button (no storage decided) — neither is rendered, not disabled, not
// "coming soon". The money sticker / running estimate is out for the same ADR (D1) and isn't
// referenced here at all. The DS reference has no network call anywhere for this screen — the
// loading/error states below are ported from the onboarding/Profil pattern instead (#318's own
// note), not from the DS, because the DS has nothing to port for them.
//
// WHERE THE TRUTH LIVES (#318 task 2 brief): the graph stays local. Every screen still renders
// from `nextStep(answers)` in `@steuereule/core` (ADR-0033) — never a round trip per tap
// (product ADR-016's 60-second budget). `answers` itself is now seeded once from the server's
// `GET .../interview` on mount (re-entry) and every answer is persisted with a
// `POST .../interview/antworten` fired the moment the user taps, without waiting for it before
// advancing — the local graph decides what's next, the server decides what's true. The server is
// the authority on PERSISTED state; if a write comes back non-200 (400 "value not accepted" or
// 409 "questionId not reachable" — see interview.controller.ts), that is the client and server
// disagreeing about the path, which the P2/#318 server-side check exists specifically to make
// impossible for a well-behaved client — so it is never swallowed: the optimistic local step is
// undone, a fresh `GET` resyncs `answers` to what the server actually holds (a concurrent write
// from another session/tab is the one real way this can legitimately happen), and an honest
// inline notice says so. A genuine network failure reverts the same way, with a retry-style
// message instead. Every successful write also invalidates the Cockpit's own query — the GWT's
// closing clause ("the Cockpit's open-items count falls") is a fact about the *next* time Cockpit
// renders, not about this screen, so this is the one place that can make that render fresh
// rather than relying on the query's default staleness alone.
//
// Gates are answerable steps, not client-remembered screens (ADR-0033): "seen and carried on"
// is stored as an answer (`GATE_ACKNOWLEDGED`) like any question, which is what lets `nextStep`
// move past a non-terminal gate. The Gewerbe gate is terminal for `job === 'Selbstständig'`
// (product ADR-028) — that screen offers no forward action at all, only the honest text and a
// way back to change the answer; `job === 'Beides'` is explicitly passable (ADR-028's
// "collect the employee part") and keeps its "prepare" button.
//
// Back navigation moves one step at a time through whatever was actually visited THIS SESSION
// (questions and acknowledged gates alike) by discarding that step's stored answer locally, so
// `nextStep(answers)` naturally recomputes back to it — no separate "current step" state to keep
// in sync, and no DELETE call: the API never gained an endpoint to un-persist an answer (#318
// scope), so a step that's answered again simply overwrites the prior row server-side (the
// service's own upsert). This diverges from the DS prototype's cosmetic pre-selection-on-back
// (it never needs to invalidate downstream answers because its question order never branches) —
// with a real graph, keeping a stale downstream answer around while an earlier answer changes
// would let `nextStep` read past data that's no longer valid, so this implementation clears it
// instead. See this slice's PR description for a fuller note.
//
// `nextStep` reaching `{ kind: 'done' }` routes back to the Cockpit (`onDone`, wired at the
// composition root, ADR-0023) — the honest choice once the real Minimal-Gate has somewhere to
// send a finished user back to.
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle, type ViewProps } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Option, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
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
import {
  useInterviewControllerGetInterview,
  useInterviewControllerPostAnswer,
  getCockpitControllerGetCockpitSummaryQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'

export interface InterviewScreenProps {
  /** Fires exactly once, when `nextStep(answers)` first reaches `{ kind: 'done' }`. */
  readonly onDone: () => void
  readonly taxYear?: number
}

/** Why a just-attempted write did not persist — shown as an honest inline notice, never swallowed. */
type PostErrorKind = 'conflict' | 'invalid' | 'network'

export function InterviewScreen({ onDone, taxYear = CURRENT_TAX_YEAR }: InterviewScreenProps) {
  const bp = useBreakpoint()
  const queryClient = useQueryClient()
  const interviewQuery = useInterviewControllerGetInterview(taxYear)
  const postAnswer = useInterviewControllerPostAnswer()

  const [answers, setAnswers] = useState<Answers>({})
  const [history, setHistory] = useState<readonly StepId[]>([])
  const [postError, setPostError] = useState<PostErrorKind | null>(null)
  // Flips true exactly once `answers` genuinely reflects the server's own state — the initial
  // GET's success, or a resync after a rejected write. Rendering waits for it (see the early
  // returns below) rather than computing `nextStep({})` for one frame on every (re)load, which
  // would flash the job question even on re-entry with answers already stored.
  const [seeded, setSeeded] = useState(false)

  // Seed local state from the server exactly once per "the server is now the truth" moment —
  // never on every render, or a background refetch (TanStack's default `staleTime: 0` triggers
  // one on every mount) would clobber whatever the user has done locally since. Setting
  // `seeded` back to `false` (see the conflict-handling branch below) is what asks this effect
  // to run again after a rejected write's resync GET.
  useEffect(() => {
    if (!seeded && interviewQuery.data?.status === 200) {
      setAnswers(interviewQuery.data.data.answers as Answers)
      setSeeded(true)
    }
  }, [seeded, interviewQuery.data])

  const current = seeded ? nextStep(answers) : null

  // `current?.kind` flips from a question/gate to 'done' exactly once — once reached, this
  // component renders nothing and offers no further interaction, so the effect cannot re-fire.
  useEffect(() => {
    if (current?.kind === 'done') onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.kind])

  if (interviewQuery.isPending) {
    return <InterviewLoading bp={bp} />
  }
  if (interviewQuery.isError || interviewQuery.data.status !== 200) {
    return <InterviewLoadError onRetry={() => void interviewQuery.refetch()} bp={bp} />
  }
  if (!seeded || current === null) {
    // The one extra render tick between "the GET resolved" and "the seeding effect committed" —
    // still an honest loading state, not a flash of the wrong question (see the effect above).
    return <InterviewLoading bp={bp} />
  }

  function answer(stepId: StepId, value: string) {
    setPostError(null)
    const previousAnswers = answers
    const previousHistory = history
    // Advance immediately — this is what keeps the Minimal-Gate inside ADR-016's 60-second
    // budget: nothing here waits on the network before showing the next screen.
    setHistory((h) => [...h, stepId])
    setAnswers((a) => ({ ...a, [stepId]: value }))

    postAnswer.mutate(
      { jahr: taxYear, data: { questionId: stepId, value } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            // The Cockpit's open-items count is this write's whole point (REQ-015's GWT) — make
            // its next render fetch fresh rather than trust it'll happen to be stale enough to
            // refetch on its own.
            void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
            return
          }
          // 400/409 — the server rejected a write the local graph believed valid/reachable.
          // That is the disagreement #318 calls out by name: undo the optimistic step and
          // resync from the server's own GET rather than trust local state any further (a
          // concurrent write from another session is the one legitimate way this happens).
          setPostError(response.status === 409 ? 'conflict' : 'invalid')
          setHistory([])
          setSeeded(false)
          void interviewQuery.refetch()
        },
        onError: () => {
          // A genuine network failure: nothing was persisted, so simply undo the optimistic
          // step — no resync needed, `previousAnswers`/`previousHistory` are still exactly
          // what the server holds.
          setAnswers(previousAnswers)
          setHistory(previousHistory)
          setPostError('network')
        },
      },
    )
  }

  function back() {
    setPostError(null)
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
    return (
      <GateScreen
        gateId={current.id}
        job={answers.job}
        onAcknowledge={(value) => answer(current.id, value)}
        onBack={back}
        bp={bp}
        notice={postError}
      />
    )
  }

  return (
    <QuestionScreen
      questionId={current.id}
      canGoBack={history.length > 0}
      onAnswer={(value) => answer(current.id, value)}
      onBack={back}
      bp={bp}
      notice={postError}
    />
  )
}

// ---------------------------------------------------------------------------------------------
// Loading / error — no design-system artifact exists for either (the DS reference makes no
// network call at all, #318's own noted blind spot); ported from CockpitScreen/ProfilScreen's
// established honest-states pattern instead.
// ---------------------------------------------------------------------------------------------

function InterviewLoading({ bp }: { readonly bp: Breakpoint }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('interview.loading')} />
      <Text style={styles.centerHelp}>{tr('interview.loading')}</Text>
    </View>
  )
}

function InterviewLoadError({ onRetry, bp }: { readonly onRetry: () => void; readonly bp: Breakpoint }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <Text style={styles.centerHeading} accessibilityRole="alert">
        {tr('interview.loadError.heading')}
      </Text>
      <Text style={styles.centerHelp}>{tr('interview.loadError.message')}</Text>
      <Button onPress={onRetry}>{tr('interview.loadError.retry')}</Button>
    </View>
  )
}

function PostErrorNotice({ kind }: { readonly kind: PostErrorKind | null }) {
  const { t: tr } = useTranslation(APP_NS)
  const t = useTheme()
  if (kind === null) return null
  return (
    <Text style={{ color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s3 }} accessibilityRole="alert">
      {tr(`interview.postError.${kind}`)}
    </Text>
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
  readonly notice: PostErrorKind | null
}

function QuestionScreen({ questionId, canGoBack, onAnswer, onBack, bp, notice }: QuestionScreenProps) {
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

      <PostErrorNotice kind={notice} />

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
  readonly notice: PostErrorKind | null
}

function GateScreen({ gateId, job, onAcknowledge, onBack, bp, notice }: GateScreenProps) {
  if (gateId === 'gewerbe') {
    return <GewerbeGate job={job} onAcknowledge={onAcknowledge} onBack={onBack} bp={bp} notice={notice} />
  }
  return <ChOnlyGate onAcknowledge={onAcknowledge} onBack={onBack} bp={bp} notice={notice} />
}

function GewerbeGate({
  job,
  onAcknowledge,
  onBack,
  bp,
  notice,
}: {
  readonly job: string | undefined
  readonly onAcknowledge: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
}) {
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
      <PostErrorNotice kind={notice} />
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

function ChOnlyGate({
  onAcknowledge,
  onBack,
  bp,
  notice,
}: {
  readonly onAcknowledge: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.gateScreen : styles.wideGateScreen} testID="screen-container">
      <PostErrorNotice kind={notice} />
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
  // Loading/error only — ported from ProfilScreen/CockpitScreen's identical centered layout,
  // not from the DS (which has no network state to show here at all).
  const centerScreen: ViewStyle = { ...screen, alignItems: 'center', justifyContent: 'center', gap: t.space.s3 }
  const wideCenterScreen: ViewStyle = { ...centerScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
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
  // Loading/error only — the question/gate `heading`/`help` above stay left-aligned (DS-ported);
  // these are the centered variants ProfilScreen/CockpitScreen use for their own honest states.
  const centerHeading: TextStyle = { ...heading, textAlign: 'center' }
  const centerHelp: TextStyle = { ...help, textAlign: 'center' }

  return {
    screen,
    wideScreen,
    gateScreen,
    wideGateScreen,
    centerScreen,
    wideCenterScreen,
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
    centerHeading,
    centerHelp,
    mark,
    help,
    gateBackLink,
    gateBackLinkText,
  }
}
