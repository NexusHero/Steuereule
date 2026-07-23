// Profil (REQ-013, steuereule#95) — view + edit the stored profile (name, Steuer-ID,
// Steuernummer), wired to the live GET/PUT /v1/profile (same contract, same hooks, same
// no-client-persistence discipline as OnboardingScreen/REQ-012). ADR-0008: the profile lives
// server-side, field-encrypted; this screen holds it in-memory only — nothing is written to
// localStorage/AsyncStorage. Honest states throughout: real loading/error on load, real
// saving/inline-error on save, no fake data.
//
// Scope note (see steuereule#95): the DS reference (Profil.jsx) is an account/settings screen
// whose "Bearbeiten" affordance is a dead end and whose settings/export/delete rows have no
// live backend today. This component builds only the part that's genuinely ready — the
// profile-data summary + edit round-trip — reusing OnboardingScreen's field patterns exactly.
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Feld, Input, Pill, Sticker, useTheme, type UiTheme } from '@steuereule/ui'
import { isValidSteuerId } from '@steuereule/core'
import { useProfileControllerGetProfile, useProfileControllerPutProfile } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { formatSteuerId, formatSteuerNr, countDigits } from './onboarding/format'
import { toOnboardingProfil, toPutProfileDto, type OnboardingProfil } from './onboarding/profileMapping'

export function ProfilScreen() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const profileQuery = useProfileControllerGetProfile()
  const putProfile = useProfileControllerPutProfile()

  const [profil, setProfil] = useState<OnboardingProfil | null>(null)
  const [draft, setDraft] = useState<OnboardingProfil | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Seed the local, in-memory profile exactly once from the loaded server value — mirrors
  // OnboardingScreen's seeding so a caller's own edits stay the source of truth until save.
  useEffect(() => {
    if (profil === null && profileQuery.data !== undefined) {
      setProfil(toOnboardingProfil(profileQuery.data.data))
    }
  }, [profileQuery.data, profil])

  if (profileQuery.isPending) {
    return <ProfilLoading />
  }
  if (profileQuery.isError || profil === null) {
    return <ProfilLoadError onRetry={() => void profileQuery.refetch()} />
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
            setProfil(toOnboardingProfil(response.data))
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
      />
    )
  }

  return <ProfilView profil={profil} onEdit={startEdit} justSaved={justSaved} />
}

function ProfilLoading() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.centerScreen}>
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('profil.loading')} />
      <Text style={styles.help}>{tr('profil.loading')}</Text>
    </View>
  )
}

interface ProfilLoadErrorProps {
  readonly onRetry: () => void
}

function ProfilLoadError({ onRetry }: ProfilLoadErrorProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.centerScreen}>
      <Text style={styles.heading} accessibilityRole="alert">
        {tr('profil.loadError.heading')}
      </Text>
      <Text style={styles.help}>{tr('profil.loadError.message')}</Text>
      <Button onPress={onRetry} style={styles.cta}>
        {tr('profil.loadError.retry')}
      </Button>
    </View>
  )
}

interface ProfilViewProps {
  readonly profil: OnboardingProfil
  readonly onEdit: () => void
  readonly justSaved: boolean
}

function ProfilView({ profil, onEdit, justSaved }: ProfilViewProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const fullName = `${profil.vorname} ${profil.nachname}`.trim()
  const initialSource = profil.vorname.trim() || profil.nachname.trim()
  const initial = initialSource ? initialSource[0]?.toUpperCase() : '?'

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.heading}>{tr('profil.cardLabel')}</Text>

      <Card variant="nacht" style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.summaryTextCol}>
            <Text style={styles.name}>{fullName || tr('profil.namePlaceholder')}</Text>
            <Text style={styles.idLine}>{profil.steuerId ? profil.steuerId : tr('profil.emptyNote')}</Text>
          </View>
          <Chip onPress={onEdit}>{tr('profil.edit')}</Chip>
        </View>
      </Card>

      {justSaved ? (
        <Text style={styles.savedNotice} accessibilityLiveRegion="polite">
          {tr('profil.savedNotice')}
        </Text>
      ) : null}
    </ScrollView>
  )
}

interface ProfilEditProps {
  readonly draft: OnboardingProfil
  readonly onChange: (key: keyof OnboardingProfil) => (value: string) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly isSaving: boolean
  readonly saveError: string | null
}

function ProfilEdit({ draft, onChange, onSave, onCancel, isSaving, saveError }: ProfilEditProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const idDigits = countDigits(draft.steuerId)
  const steuerIdOk = isValidSteuerId(draft.steuerId.replace(/\D/g, ''))
  const canSave = draft.vorname.trim() !== '' && draft.nachname.trim() !== '' && steuerIdOk

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{tr('profil.editHeading')}</Text>

      <Feld label={tr('profil.firstNameLabel')}>
        <Input
          value={draft.vorname}
          onChange={onChange('vorname')}
          placeholder={tr('profil.firstNamePlaceholder')}
          accessibilityLabel={tr('profil.firstNameLabel')}
        />
      </Feld>
      <Feld label={tr('profil.lastNameLabel')}>
        <Input
          value={draft.nachname}
          onChange={onChange('nachname')}
          placeholder={tr('profil.lastNamePlaceholder')}
          accessibilityLabel={tr('profil.lastNameLabel')}
        />
      </Feld>
      <Feld label={tr('profil.steuerIdLabel')}>
        <Input
          type="numeric"
          mono
          value={draft.steuerId}
          onChange={(value) => onChange('steuerId')(formatSteuerId(value))}
          placeholder={tr('profil.steuerIdPlaceholder')}
          accessibilityLabel={tr('profil.steuerIdLabel')}
        />
      </Feld>
      <View style={styles.counterRow}>
        <Pill>{tr('profil.steuerIdCounter', { count: idDigits })}</Pill>
        {steuerIdOk ? <Sticker>{tr('profil.steuerIdConfirmed')}</Sticker> : null}
      </View>
      <Feld label={tr('profil.steuerNrLabel')}>
        <Input
          type="numeric"
          mono
          value={draft.steuerNr}
          onChange={(value) => onChange('steuerNr')(formatSteuerNr(value))}
          placeholder={tr('profil.steuerNrPlaceholder')}
          accessibilityLabel={tr('profil.steuerNrLabel')}
        />
      </Feld>

      {saveError !== null ? (
        <Text style={styles.saveErrorText} accessibilityRole="alert">
          {saveError}
        </Text>
      ) : null}

      <Button onPress={onSave} disabled={!canSave || isSaving} style={styles.cta}>
        {isSaving ? tr('profil.saving') : tr('profil.save')}
      </Button>
      <Button variante="ghost" onPress={onCancel} disabled={isSaving} style={styles.cancelButton}>
        {tr('profil.cancel')}
      </Button>
    </ScrollView>
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
  const centerScreen: ViewStyle = {
    ...screen,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s3,
  }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginBottom: t.space.s4,
    textAlign: 'center',
  }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    textAlign: 'center',
  }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const cancelButton: ViewStyle = { marginTop: t.space.s3 }
  const summaryCard: ViewStyle = { padding: t.space.s4 }
  const summaryRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const summaryTextCol: ViewStyle = { flex: 1, minWidth: 0 }
  const avatar: ViewStyle = {
    width: 54,
    height: 54,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.funke,
    borderWidth: 2,
    borderColor: t.color.tinte,
    alignItems: 'center',
    justifyContent: 'center',
  }
  const avatarText: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
  }
  const name: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.funke }
  const idLine: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.s,
    color: t.color.nachtText,
    opacity: 0.8,
    fontVariant: ['tabular-nums'],
    marginTop: t.space.s1,
  }
  const savedNotice: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    textAlign: 'center',
    marginTop: t.space.s3,
  }
  const counterRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginTop: -t.space.s2, marginBottom: t.space.s3 }
  const saveErrorText: TextStyle = { color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }

  return {
    screen,
    centerScreen,
    heading,
    help,
    cta,
    cancelButton,
    summaryCard,
    summaryRow,
    summaryTextCol,
    avatar,
    avatarText,
    name,
    idLine,
    savedNotice,
    counterRow,
    saveErrorText,
  }
}
