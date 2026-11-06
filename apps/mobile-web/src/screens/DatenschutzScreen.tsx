import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Pill, useTheme, useBreakpoint } from '@steuereule/ui'
import { useAccountDeletionControllerDeleteAccount } from '@steuereule/api-client'
import { APP_NS } from '../i18n/resources'
import { useAccountSession } from '../auth/useAccountSession'
import { downloadAccountExport, type ExportFormat } from './datenschutz/exportDownload'
import { ExportSection, type ExportButtonState } from './datenschutz/ExportSection'
import { DeleteSection, type DeleteFlow } from './datenschutz/DeleteSection'
import { makePrivacyStyles } from './datenschutz/styles'

export interface PrivacyScreenProps {
  readonly onBack: () => void
  readonly onAccountDeleted: () => void
}

export function PrivacyScreen({ onBack, onAccountDeleted }: PrivacyScreenProps) {
  const bp = useBreakpoint()
  const { t } = useTranslation(APP_NS)
  const tr = (key: string): string => t(key)
  const queryClient = useQueryClient()
  const deleteAccountMutation = useAccountDeletionControllerDeleteAccount()

  const { state: sessionState, retry: retrySession } = useAccountSession()

  const [exportState, setExportState] = useState<Record<ExportFormat, ExportButtonState>>({ json: 'idle', pdf: 'idle' })
  const [deleteFlow, setDeleteFlow] = useState<DeleteFlow>({ kind: 'closed' })
  const [password, setPassword] = useState('')

  async function runExport(format: ExportFormat) {
    setExportState((s) => ({ ...s, [format]: 'loading' }))
    try {
      const result = await downloadAccountExport(format)
      setExportState((s) => ({ ...s, [format]: result.ok ? 'success' : 'error' }))
      return result.ok
    } catch {
      setExportState((s) => ({ ...s, [format]: 'error' }))
      return false
    }
  }

  async function submitDelete(withPassword: string | undefined) {
    setDeleteFlow({ kind: 'deleting' })
    try {
      const result = await deleteAccountMutation.mutateAsync({
        data: withPassword ? { confirm: true, password: withPassword } : { confirm: true },
      })
      switch (result.status) {
        case 200:
          queryClient.clear()
          await retrySession()
          setPassword('')
          onAccountDeleted()
          return
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
        default: {
          const exhaustiveCheck: never = result
          setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
          return exhaustiveCheck
        }
      }
    } catch {
      setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
    }
  }

  const styles = makePrivacyStyles(useTheme())

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar tr={tr} onBack={onBack} />
      <Hero tr={tr} />
      <DeviceSessionsSection tr={tr} />

      {sessionState.status === 'loading' ? (
        <SessionChecking tr={tr} />
      ) : sessionState.status === 'unknown' ? (
        <SessionUnknown tr={tr} onRetry={retrySession} />
      ) : sessionState.status === 'signed-out' ? (
        <GuestNotice tr={tr} />
      ) : (
        <>
          <ExportSection tr={tr} state={exportState} onExport={runExport} />
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
