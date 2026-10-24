// Profil (REQ-013, steuereule#95) — view + edit the stored profile (name, Steuer-ID,
// Steuernummer), wired to the live GET/PUT /v1/profile (same contract, same hooks, same
// no-client-persistence discipline as OnboardingScreen/REQ-012). ADR-0008: the profile lives
// server-side, field-encrypted; this screen holds it in-memory only.
//
// The DS reference (Profil.jsx) is an account/settings screen whose "Bearbeiten" affordance is a
// dead end and whose settings rows have no live backend — this builds the part that's genuinely
// ready: the profile-data summary + edit round trip, plus (REQ-011) the one "Deine Daten" row
// that reaches the wired Datenschutz screen. The read view and edit form live in ./profil/.
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
  /** Navigates to the Datenschutz screen (REQ-011) — Profil never renders it itself; the DS
   *  reference and TAB_ORDNUNG both make Datenschutz a screen reached *from* Profil. */
  readonly onOpenDatenschutz: () => void
  /** Navigates to the Sicherheit screen (REQ-007) — same drill-down as Datenschutz. */
  readonly onOpenSicherheit: () => void
  /** Fires when the device list (#238) revokes the session this very screen is running under —
   *  the same "never a stale screen for a gone account" contract DatenschutzScreen honours. */
  readonly onSignedOut: () => void
}

export function ProfilScreen({ onOpenDatenschutz, onOpenSicherheit, onSignedOut }: ProfilScreenProps) {
  const { t: tr } = useTranslation(APP_NS)
  const bp = useBreakpoint()
  const queryClient = useQueryClient()
  const profileQuery = useProfileControllerGetProfile()
  const putProfile = useProfileControllerPutProfile()

  const [draft, setDraft] = useState<OnboardingProfil | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Derive the view profile directly from the query's data on every render — never seed a local
  // copy once and freeze it. Onboarding and Profil share one QueryClient/query key; if
  // Onboarding's earlier (empty) GET is already cached when Profil mounts, TanStack Query hands
  // back that stale value synchronously *and* kicks off a background refetch. A one-time "seed if
  // null" effect would latch onto the stale value and never look again; reading fresh each render
  // shows the real profile the moment the refetch resolves. The in-flight `draft` stays the sole
  // edit-time source of truth; save writes the server's response straight into the query cache so
  // this same derivation reflects it immediately.
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
      onSignedOut={onSignedOut}
    />
  )
}
