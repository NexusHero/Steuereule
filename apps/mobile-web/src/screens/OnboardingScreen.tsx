import { useEffect, useState } from 'react'
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, Pill, Sticker, useTheme, useBreakpoint } from '@steuereule/ui'
import { isValidTaxId } from '@steuereule/core'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { formatTaxId, sanitizeTaxNumberInput, countDigits } from './onboarding/format'
import { toOnboardingProfile, toPutProfileDto, type OnboardingProfile } from './onboarding/profileMapping'
import { makeOnboardingStyles } from './onboarding/styles'
import { OnboardingSummary } from './onboarding/OnboardingSummary'
import { LoadingState, LoadFailedState } from './shared/ScreenState'
import { StepIndicator } from './shared/StepIndicator'
import { BackButton, BackButtonSpacer } from './shared/BackButton'
import { triggerSaveErrorHaptic } from './shared/saveFeedback'
import { useProfileSaveFailureMessage } from './onboarding/profileSaveFailure'

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

  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [step, setStep] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const saveFailureMessage = useProfileSaveFailureMessage('onboarding.summary.submitError')

  // WEB-28 / NR-01: the form starts only from a profile that loaded. A failed load is a failure state with a
  // retry — never an empty form whose save would clear the stored Steuer-ID and Steuernummer.
  const loaded = profileQuery.isSuccess ? toOnboardingProfile(profileQuery.data.data) : null
  const loadedKey = loaded === null ? null : JSON.stringify(loaded)
  useEffect(() => {
    if (profile === null && loadedKey !== null) setProfile(JSON.parse(loadedKey) as OnboardingProfile)
  }, [loadedKey, profile])

  if (profileQuery.isPending) {
    return <LoadingState bp={bp} label={tr('onboarding.loading')} />
  }
  if (loaded === null) {
    return <LoadFailedState bp={bp} error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
  }
  if (profile === null) {
    return <LoadingState bp={bp} label={tr('onboarding.loading')} />
  }
  // "später" skips a step without touching the stored value (it used to clear it).
  const stored: OnboardingProfile = loaded

  const set = (key: keyof OnboardingProfile) => (value: string) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p))
  const idDigits = countDigits(profile.steuerId)
  const taxIdOk = isValidTaxId(profile.steuerId.replace(/\D/g, ''))
  const stepOk = [profile.firstName.trim() !== '' && profile.lastName.trim() !== '', taxIdOk, true]

  function next() {
    setStep((s) => (s === STEP_COUNT - 1 ? STEP_COUNT : s + 1))
  }
  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  function submit() {
    if (profile === null) return
    setSubmitError(null)
    putProfile.mutate(
      { data: toPutProfileDto(profile, stored) },
      {
        onSuccess: () => onDone(),
        onError: (error) => {
          triggerSaveErrorHaptic()
          setSubmitError(saveFailureMessage(error))
        },
      },
    )
  }

  if (step === STEP_COUNT) {
    return (
      <OnboardingSummary
        profile={profile}
        onSubmit={submit}
        onEdit={() => setStep(0)}
        isSubmitting={putProfile.isPending}
        submitError={submitError}
        bp={bp}
      />
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <View style={styles.headerRow}>
        {step > 0 ? (
          <BackButton accessibilityLabel={tr('onboarding.back')} onPress={back} />
        ) : (
          <BackButtonSpacer />
        )}
        <StepIndicator step={step} total={STEP_COUNT} />
        <Pill>{`${step + 1}/${STEP_COUNT}`}</Pill>
      </View>

      {step === 0 ? (
        <>
          <Text style={styles.heading}>
            {tr('onboarding.step1.titleBefore')}
            <Text style={styles.mark}>{tr('onboarding.step1.titleMark')}</Text>
            {tr('onboarding.step1.titleAfter')}
          </Text>
          <Text style={styles.help}>{tr('onboarding.step1.help')}</Text>
          <Feld label={tr('onboarding.step1.firstNameLabel')}>
            <Input
              value={profile.firstName}
              onChange={set('firstName')}
              placeholder={tr('onboarding.step1.firstNamePlaceholder')}
              accessibilityLabel={tr('onboarding.step1.firstNameLabel')}
              autoComplete="given-name"
              testID="onboarding-vorname"
            />
          </Feld>
          <Feld label={tr('onboarding.step1.lastNameLabel')}>
            <Input
              value={profile.lastName}
              onChange={set('lastName')}
              placeholder={tr('onboarding.step1.lastNamePlaceholder')}
              accessibilityLabel={tr('onboarding.step1.lastNameLabel')}
              autoComplete="family-name"
              testID="onboarding-nachname"
            />
          </Feld>
        </>
      ) : null}

      {step === 1 ? (
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
              value={profile.steuerId}
              onChange={(value) => set('steuerId')(formatTaxId(value))}
              placeholder={tr('onboarding.step2.placeholder')}
              accessibilityLabel={tr('onboarding.step2.fieldLabel')}
              testID="onboarding-steuerid"
            />
          </Feld>
          <View style={styles.counterRow}>
            <Pill>{tr('onboarding.step2.counter', { count: idDigits })}</Pill>
            {taxIdOk ? <Sticker>{tr('onboarding.step2.confirmed')}</Sticker> : null}
          </View>
          <Chip style={{ marginTop: t.space.s3 }} onPress={() => { set('steuerId')(stored.steuerId); next(); }}>{tr('onboarding.step2.later')}</Chip>
        </>
      ) : null}

      {step === 2 ? (
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
              value={profile.taxNumber}
              onChange={(value) => set('taxNumber')(sanitizeTaxNumberInput(value))}
              placeholder={tr('onboarding.step3.placeholder')}
              accessibilityLabel={tr('onboarding.step3.fieldLabel')}
              testID="onboarding-steuernummer"
            />
          </Feld>
          <Chip onPress={() => { set('taxNumber')(stored.taxNumber); next(); }}>{tr('onboarding.step3.later')}</Chip>
        </>
      ) : null}

      <Button onPress={next} disabled={!stepOk[step]} style={styles.cta} testID="onboarding-weiter">
        {tr('onboarding.weiter')}
      </Button>
    </ScrollView>
  )
}
