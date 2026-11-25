import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Feld, Input, Pill, useTheme, useBreakpoint } from '@steuereule/ui'
import { apiErrorStatus, useAccountDeletionControllerDeleteAccount } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { useAccountSession } from '../auth/useAccountSession'
import { useStepUp } from '../auth/useStepUp'
import { downloadAccountExport, type ExportFormat } from './privacy/exportDownload'
import { ExportSection, type ExportButtonState } from './privacy/ExportSection'
import { DeleteSection, type DeleteFlow } from './privacy/DeleteSection'
import { OwlPersonalDataSection } from './privacy/OwlPersonalDataSection'
import { makePrivacyStyles } from './privacy/styles'

export interface PrivacyScreenProps {
  readonly onBack: () => void
  readonly onAccountDeleted: () => void
}

export function PrivacyScreen({ onBack, onAccountDeleted }: PrivacyScreenProps) {
  const bp = useBreakpoint()
  const { t } = useTranslation(APP_NS)
  const tr = (key: string, options?: Readonly<Record<string, string | number>>): string => (options ? t(key, options) : t(key))
  const queryClient = useQueryClient()
  const deleteAccountMutation = useAccountDeletionControllerDeleteAccount()

  const { state: sessionState, retry: retrySession } = useAccountSession()
  const stepUp = useStepUp()

  const [exportState, setExportState] = useState<Record<ExportFormat, ExportButtonState>>({ json: 'idle', pdf: 'idle' })
  const [deleteFlow, setDeleteFlow] = useState<DeleteFlow>({ kind: 'closed' })
  const [password, setPassword] = useState('')
  // The export needs fresh auth (ADR-0107 L1): a non-null value means we are prompting for the
  // password before retrying the export of that format, instead of showing a dead-end error.
  const [exportStepUp, setExportStepUp] = useState<{ format: ExportFormat; error: string; busy: boolean } | null>(null)

  async function runExport(format: ExportFormat) {
    setExportState((s) => ({ ...s, [format]: 'loading' }))
    try {
      const result = await downloadAccountExport(format)
      if (!result.ok && result.stepUp) {
        setExportState((s) => ({ ...s, [format]: 'idle' }))
        setPassword('')
        setExportStepUp({ format, error: '', busy: false })
        return false
      }
      setExportState((s) => ({ ...s, [format]: result.ok ? 'success' : 'error' }))
      return result.ok
    } catch {
      setExportState((s) => ({ ...s, [format]: 'error' }))
      return false
    }
  }

  async function confirmExportStepUp() {
    if (!exportStepUp || !password) return
    const format = exportStepUp.format
    setExportStepUp((s) => (s ? { ...s, busy: true, error: '' } : s))
    const error = await stepUp.verifyPassword(password)
    if (error) {
      setExportStepUp((s) => (s ? { ...s, busy: false, error } : s))
      return
    }
    setExportStepUp(null)
    setPassword('')
    await runExport(format)
  }

  async function submitDelete(withPassword: string | undefined) {
    setDeleteFlow({ kind: 'deleting' })
    try {
      await deleteAccountMutation.mutateAsync({
        data: withPassword ? { confirm: true, password: withPassword } : { confirm: true },
      })
    } catch (error) {
      // Every refusal rejects with an ApiError (WEB-28). Deletion answers 400 FRESH_AUTH_REQUIRED for a stale
      // session (ADR-0106 D2), 401 for a wrong password, 429 when throttled, 403 for a guest.
      switch (apiErrorStatus(error)) {
        case 400:
          setDeleteFlow({ kind: 'password' })
          return
        case 401:
          setDeleteFlow({ kind: 'password', error: 'wrong' })
          return
        case 429:
          setDeleteFlow({ kind: 'password', error: 'rateLimited' })
          return
        case 403:
          setDeleteFlow({ kind: 'guestBlocked' })
          return
        default:
          setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
          return
      }
    }
    queryClient.clear()
    await retrySession()
    setPassword('')
    onAccountDeleted()
  }

  const styles = makePrivacyStyles(useTheme())

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar tr={tr} onBack={onBack} />
      <Hero tr={tr} />
      <DeviceSessionsSection tr={tr} />
      {sessionState.status === 'signed-in' ? <OwlPersonalDataSection /> : null}

      {sessionState.status === 'loading' ? (
        <SessionChecking tr={tr} />
      ) : sessionState.status === 'unknown' ? (
        <SessionUnknown tr={tr} onRetry={retrySession} />
      ) : sessionState.status === 'signed-out' ? (
        <GuestNotice tr={tr} />
      ) : (
        <>
          <ExportSection tr={tr} state={exportState} onExport={runExport} />
          {exportStepUp ? (
            <Card>
              <Text style={styles.offerHeading}>{tr('datenschutz.export.stepUp.heading')}</Text>
              <Text style={styles.warningBody}>{tr('datenschutz.export.stepUp.body')}</Text>
              <Feld label={tr('datenschutz.export.stepUp.label')}>
                <Input
                  type="password"
                  value={password}
                  onChange={setPassword}
                  accessibilityLabel={tr('datenschutz.export.stepUp.label')}
                  autoComplete="current-password"
                  testID="export-stepup-passwort"
                />
              </Feld>
              {exportStepUp.error ? (
                <Text style={styles.errorNote} accessibilityRole="alert">{exportStepUp.error}</Text>
              ) : null}
              <Button
                variant="ghost"
                onPress={() => void confirmExportStepUp()}
                disabled={exportStepUp.busy || !password}
                testID="export-stepup-bestaetigen"
              >
                {tr('datenschutz.export.stepUp.confirm')}
              </Button>
              <Button
                variant="ghost"
                onPress={() => { setExportStepUp(null); setPassword('') }}
                testID="export-stepup-abbrechen"
              >
                {tr('datenschutz.export.stepUp.cancel')}
              </Button>
            </Card>
          ) : null}
          <DeleteSection
            tr={tr}
            flow={deleteFlow}
            password={password}
            onPasswordChange={setPassword}
            onOpen={() => setDeleteFlow({ kind: 'offer', exported: false })}
            onExportFirst={async () => {
              const ok = await runExport('json')
              if (ok) setDeleteFlow({ kind: 'offer', exported: true })
            }}
            onContinueWithoutExport={() => setDeleteFlow({ kind: 'confirm' })}
            onCancel={() => { setDeleteFlow({ kind: 'closed' }); setPassword('') }}
            onConfirmDelete={() => void submitDelete(undefined)}
            onSubmitPassword={() => void submitDelete(password)}
          />
        </>
      )}
    </ScrollView>
  )
}

function Appbar({ tr, onBack }: { readonly tr: (key: string) => string; readonly onBack: () => void }) {
  const t = useTheme()
  const styles = makePrivacyStyles(t)
  return (
    <View style={styles.appbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('datenschutz.back')} onPress={onBack} style={styles.backButton}>
        <Text style={styles.backGlyph}>←</Text>
      </Pressable>
      <Text style={styles.appbarTitle}>{tr('datenschutz.title')}</Text>
      <Pill>{tr('datenschutz.badge')}</Pill>
    </View>
  )
}

function Hero({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makePrivacyStyles(t)
  return (
    <Card variant="nacht">
      <Text style={styles.heroKicker}>{tr('datenschutz.hero.kicker')}</Text>
      <Text style={styles.heroHeading}>{tr('datenschutz.hero.heading')}</Text>
      <Text style={styles.heroBody}>{tr('datenschutz.hero.body')}</Text>
    </Card>
  )
}

function SessionChecking({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makePrivacyStyles(t)
  return (
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('datenschutz.sessionChecking')} />
      <Text style={styles.help}>{tr('datenschutz.sessionChecking')}</Text>
    </View>
  )
}

function SessionUnknown({ tr, onRetry }: { readonly tr: (key: string) => string; readonly onRetry: () => void }) {
  const styles = makePrivacyStyles(useTheme())
  return (
    <Card>
      <Text style={styles.sectionTitle} accessibilityRole="alert">
        {tr('datenschutz.sessionUnknown.heading')}
      </Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.sessionUnknown.body')}</Text>
      <Button variant="ghost" onPress={onRetry}>
        {tr('datenschutz.sessionUnknown.retry')}
      </Button>
    </Card>
  )
}

function DeviceSessionsSection({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makePrivacyStyles(t)
  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.deviceSessions.heading')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.deviceSessions.sessionData')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.deviceSessions.geoIp')}</Text>
      <Text style={styles.hint}>{tr('datenschutz.deviceSessions.geoIpAttribution')}</Text>
    </Card>
  )
}

function GuestNotice({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makePrivacyStyles(t)
  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.guest.heading')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.guest.body')}</Text>
    </Card>
  )
}
