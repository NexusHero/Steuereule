import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useBreakpoint } from '@steuereule/ui'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { toOnboardingProfil, toPutProfileDto, type OnboardingProfil } from './onboarding/profileMapping'
import { ProfilView } from './profil/ProfilView'
import { ProfilEdit } from './profil/ProfilEdit'
import { LoadingState, ErrorState } from './shared/ScreenState'

export interface ProfilScreenProps {
  readonly onOpenDatenschutz: () => void
  readonly onOpenStammdaten?: () => void
  readonly onOpenSicherheit: () => void
  readonly onSignedOut: () => void
}

export function ProfilScreen({ onOpenDatenschutz, onOpenSicherheit, onOpenStammdaten, onSignedOut }: ProfilScreenProps) {
  const { t: tr } = useTranslation(APP_NS)
  const bp = useBreakpoint()
  const queryClient = useQueryClient()
  const profileQuery = useProfileControllerGetProfile()
  const putProfile = useProfileControllerPutProfile()

  const [draft, setDraft] = useState<OnboardingProfil | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const profil = profileQuery.data ? toOnboardingProfil(profileQuery.data.data) : null

  if (profileQuery.isPending) {
    return <LoadingState bp={bp} label={tr('profil.loading')} />
  }
  if (profileQuery.isError || profil === null) {
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
    setDraft(profil)
    setSaveError(null)
    setJustSaved(false)
  }
  function cancelEdit() {
    setDraft(null)
    setSaveError(null)
  }
  function setDraftField(key: keyof OnboardingProfil) {
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
      <ProfilEdit
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
    <ProfilView
      profil={profil}
      onEdit={startEdit}
      justSaved={justSaved}
      bp={bp}
      onOpenDatenschutz={onOpenDatenschutz}
      onOpenSicherheit={onOpenSicherheit}
      {...(onOpenStammdaten ? { onOpenStammdaten } : {})}
      onSignedOut={onSignedOut}
    />
  )
}
