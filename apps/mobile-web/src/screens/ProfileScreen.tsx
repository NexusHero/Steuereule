import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useBreakpoint } from '@steuereule/ui'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { toOnboardingProfile, toPutProfileDto, type OnboardingProfile } from './onboarding/profileMapping'
import { ProfileView } from './profile/ProfileView'
import { ProfileEdit } from './profile/ProfileEdit'
import { LoadingState, LoadFailedState } from './shared/ScreenState'
import { triggerSaveErrorHaptic } from './shared/saveFeedback'
import { useProfileSaveFailureMessage } from './onboarding/profileSaveFailure'

export interface ProfileScreenProps {
  readonly onOpenPrivacy: () => void
  readonly onOpenMasterData?: () => void
  readonly onOpenSecurity: () => void
  readonly onSignedOut: () => void
}

export function ProfileScreen({ onOpenPrivacy, onOpenSecurity, onOpenMasterData, onSignedOut }: ProfileScreenProps) {
  const { t: tr } = useTranslation(APP_NS)
  const bp = useBreakpoint()
  const queryClient = useQueryClient()
  const profileQuery = useProfileControllerGetProfile()
  const putProfile = useProfileControllerPutProfile()

  const [draft, setDraft] = useState<OnboardingProfile | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const saveFailureMessage = useProfileSaveFailureMessage('profil.saveError')

  // WEB-28 / NR-01: a failed load (5xx, 429, offline) is a failure state, never an empty profile whose
  // "Bearbeiten → Speichern" would write blanks over the stored data.
  const profile = profileQuery.isSuccess ? toOnboardingProfile(profileQuery.data.data) : null

  if (profileQuery.isPending) {
    return <LoadingState bp={bp} label={tr('profil.loading')} />
  }
  if (profile === null) {
    return <LoadFailedState bp={bp} error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
  }
  const loaded: OnboardingProfile = profile

  function startEdit() {
    setDraft(profile)
    setSaveError(null)
    setJustSaved(false)
  }
  function cancelEdit() {
    setDraft(null)
    setSaveError(null)
  }
  function setDraftField(key: keyof OnboardingProfile) {
    return (value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  function save() {
    if (draft === null) return
    setSaveError(null)
    putProfile.mutate(
      { data: toPutProfileDto(draft, loaded) },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(profileQuery.queryKey, response)
          setDraft(null)
          setJustSaved(true)
        },
        onError: (error) => {
          triggerSaveErrorHaptic()
          setSaveError(saveFailureMessage(error))
        },
      },
    )
  }

  if (draft !== null) {
    return (
      <ProfileEdit
        draft={draft}
        onChange={setDraftField}
        onSave={save}
        onCancel={cancelEdit}
        isSaving={putProfile.isPending}
        saveError={saveError}
        bp={bp}
      />
    )
  }

  return (
    <ProfileView
      profile={profile}
      onEdit={startEdit}
      justSaved={justSaved}
      bp={bp}
      onOpenPrivacy={onOpenPrivacy}
      onOpenSecurity={onOpenSecurity}
      {...(onOpenMasterData ? { onOpenMasterData } : {})}
      onSignedOut={onSignedOut}
    />
  )
}
