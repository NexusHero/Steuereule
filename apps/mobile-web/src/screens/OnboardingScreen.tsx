// Onboarding (F: Onboarding.jsx in Funke dress) — 3-step flow: name → Steuer-ID → Steuernummer →
// summary, wired to the real Profile API (GET/PUT /v1/profile, steuereule#27/#29). The screen
// holds the profile in-memory only — nothing is written to localStorage/AsyncStorage; the
// Steuer-ID is persisted server-side, field-encrypted at rest (ADR-0008). Honest states
// throughout: a real loading screen, a real retryable error, an inline retryable save error —
// no fake spinners, no silent failures. Copy via i18n (de base + en, ADR-0006).
import { useEffect, useState } from 'react'
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, Pill, Sticker, useTheme, useBreakpoint } from '@steuereule/ui'
import { isValidSteuerId } from '@steuereule/core'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { formatSteuerId, formatSteuerNr, countDigits } from './onboarding/format'
import { toOnboardingProfil, toPutProfileDto, type OnboardingProfil } from './onboarding/profileMapping'
import { makeOnboardingStyles } from './onboarding/styles'
import { OnboardingSummary } from './onboarding/OnboardingSummary'
import { LoadingState, ErrorState } from './shared/ScreenState'
import { StepIndicator } from './shared/StepIndicator'
import { BackButton, BackButtonSpacer } from './shared/BackButton'

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
  const styles = makeOnboardingStyles(t)

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
    return <LoadingState bp={bp} label={tr('onboarding.loading')} />
  }
  if (profileQuery.isError || profil === null) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('onboarding.loadError.heading')}
        message={tr('onboarding.loadError.message')}
        retryLabel={tr('onboarding.loadError.retry')}
        onRetry={() => void profileQuery.refetch()}
      />
    )
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
    // Defensive only: `submit` is only ever passed to OnboardingSummary, which never renders
    // before `profil` is set (see the early returns above). TS can't carry that narrowing into
    // a nested function declaration.
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
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <View style={styles.headerRow}>
        {schritt > 0 ? (
          <BackButton accessibilityLabel={tr('onboarding.back')} onPress={zurueck} />
        ) : (
          <BackButtonSpacer />
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
