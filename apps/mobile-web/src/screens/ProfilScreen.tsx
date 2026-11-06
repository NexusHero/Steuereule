import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useBreakpoint } from '@steuereule/ui'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { toOnboardingProfile, toPutProfileDto, type OnboardingProfile } from './onboarding/profileMapping'
import { ProfileView } from './profil/ProfilView'
import { ProfileEdit } from './profil/ProfilEdit'
import { LoadingState, ErrorState } from './shared/ScreenState'

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

  const profile = profileQuery.data ? toOnboardingProfile(profileQuery.data.data) : null

  if (profileQuery.isPending) {
    return <LoadingState bp={bp} label={tr('profil.loading')} />
  }
  if (profileQuery.isError || profile === null) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('profil.loadError.heading')}
        message={tr('profil.loadError.message')}
        retryLabel={tr('profil.loadError.retry')}
        onRetry={() => void profileQuery.refetch()}
      />
    )
  }

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
      { data: toPutProfileDto(draft) },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            queryClient.setQueryData(profileQuery.queryKey, response)
            setDraft(null)
            setJustSaved(true)
          } else {
            setSaveError(tr('profil.saveError.validation'))
          }
        },
        onError: () => setSaveError(tr('profil.saveError.network')),
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
