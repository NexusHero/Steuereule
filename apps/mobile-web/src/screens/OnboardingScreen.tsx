// Onboarding (F: Onboarding.jsx in Funke dress) — 3-step flow: name → Steuer-ID → Steuernummer →
// summary, wired to the real Profile API (GET/PUT /v1/profile, steuereule#27/#29). The screen
// holds the profile in-memory only — nothing is written to localStorage/AsyncStorage; the
// Steuer-ID is persisted server-side, field-encrypted at rest (ADR-0008). Honest states
// throughout: a real loading screen while the profile loads, a real retryable error screen if it
// can't, and an inline retryable error if saving fails — no fake spinners, no silent failures.
// Copy via i18n (de base + en, ADR-0006). One primary action per step. No entrance/step animation,
// so `prefers-reduced-motion` is honored by omission (design-system CLAUDE.md).
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  Pressable,
  type ViewStyle,
  type TextStyle,
  type ViewProps,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, Pill, Sticker, Card, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { isValidSteuerId } from '@steuereule/core'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { formatSteuerId, formatSteuerNr, countDigits } from './onboarding/format'
import { toOnboardingProfil, toPutProfileDto, type OnboardingProfil } from './onboarding/profileMapping'

export interface OnboardingScreenProps {
  readonly onDone: () => void
}

const STEP_COUNT = 3

export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const profileQuery = useProfileControllerGetProfile()
  const putProfile = useProfileControllerPutProfile()
  const styles = makeStyles(t)

  const [profil, setProfil] = useState<OnboardingProfil | null>(null)
  const [schritt, setSchritt] = useState(0) // 0..2 = the three steps, 3 = summary
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Seed the local, in-memory profile exactly once from the loaded server value (or the
  // all-null default) — after that the user's own edits are the source of truth until submit.
  useEffect(() => {
    if (profil === null && profileQuery.data !== undefined) {
      setProfil(toOnboardingProfil(profileQuery.data.data))
    }
  }, [profileQuery.data, profil])

  if (profileQuery.isPending) {
    return <OnboardingLoading bp={bp} />
  }
  if (profileQuery.isError || profil === null) {
    return <OnboardingLoadError onRetry={() => void profileQuery.refetch()} bp={bp} />
  }

  const set = (key: keyof OnboardingProfil) => (value: string) =>
    setProfil((p) => (p ? { ...p, [key]: value } : p))
  const idDigits = countDigits(profil.steuerId)
  const steuerIdOk = isValidSteuerId(profil.steuerId.replace(/\D/g, ''))
  const stepOk = [profil.vorname.trim() !== '' && profil.nachname.trim() !== '', steuerIdOk, true]

  function weiter() {
    setSchritt((s) => (s === STEP_COUNT - 1 ? STEP_COUNT : s + 1))
  }
  function zurueck() {
    setSchritt((s) => Math.max(0, s - 1))
  }

  function submit() {
    // Defensive only: unreachable in practice — submit() is only ever passed to
    // OnboardingSummary, which never renders before `profil` is set (see the early
    // returns above). TS can't carry that narrowing into a nested function declaration.
    if (profil === null) return
    setSubmitError(null)
    putProfile.mutate(
      { data: toPutProfileDto(profil) },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            onDone()
          } else {
            setSubmitError(tr('onboarding.summary.submitError.validation'))
          }
        },
        onError: () => setSubmitError(tr('onboarding.summary.submitError.network')),
      },
    )
  }

  if (schritt === STEP_COUNT) {
    return (
      <OnboardingSummary
        profil={profil}
        onSubmit={submit}
        onEdit={() => setSchritt(0)}
        isSubmitting={putProfile.isPending}
        submitError={submitError}
        bp={bp}
      />
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
      <View style={styles.headerRow}>
        {schritt > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('onboarding.back')}
            onPress={zurueck}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <StepIndicator step={schritt} total={STEP_COUNT} />
        <Pill>{`${schritt + 1}/${STEP_COUNT}`}</Pill>
      </View>

      {schritt === 0 ? (
        <>
          <Text style={styles.heading}>
            {tr('onboarding.step1.titleBefore')}
            <Text style={styles.mark}>{tr('onboarding.step1.titleMark')}</Text>
            {tr('onboarding.step1.titleAfter')}
          </Text>
          <Text style={styles.help}>{tr('onboarding.step1.help')}</Text>
          <Feld label={tr('onboarding.step1.firstNameLabel')}>
            <Input
              value={profil.vorname}
              onChange={set('vorname')}
              placeholder={tr('onboarding.step1.firstNamePlaceholder')}
              accessibilityLabel={tr('onboarding.step1.firstNameLabel')}
            />
          </Feld>
          <Feld label={tr('onboarding.step1.lastNameLabel')}>
            <Input
              value={profil.nachname}
              onChange={set('nachname')}
              placeholder={tr('onboarding.step1.lastNamePlaceholder')}
              accessibilityLabel={tr('onboarding.step1.lastNameLabel')}
            />
          </Feld>
        </>
      ) : null}

      {schritt === 1 ? (
        <>
          <Text style={styles.heading}>
            {tr('onboarding.step2.titleBefore')}
            <Text style={styles.mark}>{tr('onboarding.step2.titleMark')}</Text>
            {tr('onboarding.step2.titleAfter')}
          </Text>
          <Text style={styles.help}>{tr('onboarding.step2.help')}</Text>
          <Feld label={tr('onboarding.step2.fieldLabel')}>
            <Input
              type="numeric"
              mono
              value={profil.steuerId}
              onChange={(value) => set('steuerId')(formatSteuerId(value))}
              placeholder={tr('onboarding.step2.placeholder')}
              accessibilityLabel={tr('onboarding.step2.fieldLabel')}
            />
          </Feld>
          <View style={styles.counterRow}>
            <Pill>{tr('onboarding.step2.counter', { count: idDigits })}</Pill>
            {steuerIdOk ? <Sticker>{tr('onboarding.step2.confirmed')}</Sticker> : null}
          </View>
        </>
      ) : null}

      {schritt === 2 ? (
        <>
          <Text style={styles.heading}>
            {tr('onboarding.step3.titleBefore')}
            <Text style={styles.mark}>{tr('onboarding.step3.titleMark')}</Text>
            {tr('onboarding.step3.titleAfter')}
          </Text>
          <Text style={styles.help}>{tr('onboarding.step3.help')}</Text>
          <Feld label={tr('onboarding.step3.fieldLabel')}>
            <Input
              type="numeric"
              mono
              value={profil.steuerNr}
              onChange={(value) => set('steuerNr')(formatSteuerNr(value))}
              placeholder={tr('onboarding.step3.placeholder')}
              accessibilityLabel={tr('onboarding.step3.fieldLabel')}
            />
          </Feld>
          <Chip onPress={() => { set('steuerNr')(''); weiter(); }}>{tr('onboarding.step3.later')}</Chip>
        </>
      ) : null}

      <Button onPress={weiter} disabled={!stepOk[schritt]} style={styles.cta}>
        {tr('onboarding.weiter')}
      </Button>
    </ScrollView>
  )
}

function OnboardingLoading({ bp }: { readonly bp: Breakpoint }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} data-testid="screen-container">
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('onboarding.loading')} />
      <Text style={styles.help}>{tr('onboarding.loading')}</Text>
    </View>
  )
}

interface OnboardingLoadErrorProps {
  readonly onRetry: () => void
  readonly bp: Breakpoint
}

function OnboardingLoadError({ onRetry, bp }: OnboardingLoadErrorProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} data-testid="screen-container">
      <Text style={styles.heading} accessibilityRole="alert">
        {tr('onboarding.loadError.heading')}
      </Text>
      <Text style={styles.help}>{tr('onboarding.loadError.message')}</Text>
      <Button onPress={onRetry}>
        {tr('onboarding.loadError.retry')}
      </Button>
    </View>
  )
}

interface OnboardingSummaryProps {
  readonly profil: OnboardingProfil
  readonly onSubmit: () => void
  readonly onEdit: () => void
  readonly isSubmitting: boolean
  readonly submitError: string | null
  readonly bp: Breakpoint
}

function OnboardingSummary({ profil, onSubmit, onEdit, isSubmitting, submitError, bp }: OnboardingSummaryProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const rows: ReadonlyArray<readonly [string, string, boolean]> = [
    [tr('onboarding.summary.rowFirstName'), profil.vorname, false],
    [tr('onboarding.summary.rowLastName'), profil.nachname, false],
    [tr('onboarding.summary.rowSteuerId'), profil.steuerId, true],
    [tr('onboarding.summary.rowSteuerNr'), profil.steuerNr || tr('onboarding.summary.steuerNrLater'), true],
  ]

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
      <View style={styles.summaryHeadingRow}>
        <Text style={styles.summaryHeading}>{tr('onboarding.summary.heading')}</Text>
        <Sticker>{tr('onboarding.summary.badge')}</Sticker>
      </View>
      <Text style={styles.help}>{tr('onboarding.summary.intro')}</Text>

      <Card variant="nacht">
        <Text style={styles.cardLabel}>{tr('onboarding.summary.cardLabel')}</Text>
        {rows.map(([label, value, mono]) => (
          <View key={label} style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>{label}</Text>
            <Text style={[styles.summaryRowValue, mono ? styles.summaryRowValueMono : null]}>{value}</Text>
          </View>
        ))}
      </Card>

      {submitError !== null ? (
        <Text style={styles.submitError} accessibilityRole="alert">
          {submitError}
        </Text>
      ) : null}

      <Button onPress={onSubmit} disabled={isSubmitting} style={styles.cta}>
        {isSubmitting ? tr('onboarding.summary.submitting') : tr('onboarding.summary.cta')}
      </Button>
      <Button variante="ghost" onPress={onEdit} disabled={isSubmitting} style={styles.summaryEditButton}>
        {tr('onboarding.summary.changeDetails')}
      </Button>
      <Text style={styles.summaryFooterNote}>{tr('onboarding.summary.footerNote')}</Text>
    </ScrollView>
  )
}

interface StepIndicatorProps {
  readonly step: number
  readonly total: number
}

// React-Native-Web forwards a step indicator's ARIA min/max/now from the flat legacy
// `accessibilityValueMin/Max/Now` props, not from RN's `accessibilityValue` object (verified
// against react-native-web's forwardedProps/createDOMProps — the object form is silently dropped).
// Contained to this one cast so the rest of the screen stays on RN's documented API.
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
  const centerScreen: ViewStyle = {
    ...screen,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s3,
  }
  const wideCenterScreen: ViewStyle = { ...centerScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s3,
    paddingBottom: t.space.s5,
  }
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
  const segment: ViewStyle = {
    flex: 1,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
  }
  const segmentFilled: ViewStyle = { backgroundColor: t.color.funke }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
    textAlign: 'center',
  }
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    marginBottom: t.space.s5,
    textAlign: 'center',
  }
  const counterRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  // #176: `cta`'s marginTop only applies at the step-form Weiter (:201) and summary submit (:286),
  // where nothing before them already claims the seam. The LoadError button (:235) passes no
  // `style` at all: centerScreen's own `gap` plus help's `marginBottom` already supply its
  // leading space, so a competing marginTop would double it.
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const submitError: TextStyle = {
    color: t.color.fehler,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    marginTop: t.space.s3,
  }
  const summaryHeadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s2 }
  const summaryHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
  }
  const cardLabel: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s2,
  }
  const summaryRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: t.space.s3,
    borderBottomWidth: 1.5,
    borderBottomColor: t.color.nachtKarte,
    paddingVertical: t.space.s2,
  }
  const summaryRowLabel: TextStyle = { color: t.color.nachtText, opacity: 0.7, fontFamily: t.font.text, fontSize: t.size.s }
  const summaryRowValue: TextStyle = { color: t.color.funke, fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s }
  const summaryRowValueMono: TextStyle = { fontFamily: t.font.mono, fontVariant: ['tabular-nums'] }
  const summaryEditButton: ViewStyle = { marginTop: t.space.s2 }
  const summaryFooterNote: TextStyle = { fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }

  return {
    screen,
    wideScreen,
    centerScreen,
    wideCenterScreen,
    headerRow,
    backButton,
    backArrow,
    backSpacer,
    progressRow,
    segment,
    segmentFilled,
    heading,
    mark,
    help,
    counterRow,
    cta,
    submitError,
    summaryHeadingRow,
    summaryHeading,
    cardLabel,
    summaryRow,
    summaryRowLabel,
    summaryRowValue,
    summaryRowValueMono,
    summaryEditButton,
    summaryFooterNote,
  }
}
