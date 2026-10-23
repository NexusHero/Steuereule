// Datenschutz (DSGVO) — REQ-011 (ADR-0013), reached from Profil (never a top-level tab). The
// two wired actions (JSON/PDF export, account deletion) are the user-facing half of REQ-011; the
// DS demo's tap-shows-a-toast placeholders are not reproduced. The delete copy is *corrected*,
// not ported: profile + account are genuinely erased server-side; the access-log record is
// anonymised and retained (Art. 30); export offers JSON + PDF only (no receipts model exists yet).
// Marketing claims with no evidence ("Server in Deutschland", "KI ohne Gedächtnis", "im
// Gast-Modus verlässt nichts dein Gerät") are omitted rather than overstated (ADR-0013 §8).
//
// #349 — the session read goes through the shared `useAccountSession()` seam, so a cold-start
// 429/5xx/network failure reads as the honest `unknown` (this screen genuinely cannot tell
// whether there is an account), never as `signed-out`/"GuestNotice" for a signed-in user.
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
import { makeDatenschutzStyles } from './datenschutz/styles'

export interface DatenschutzScreenProps {
  readonly onZurueck: () => void
  /** Fires once DELETE /v1/account genuinely succeeded (200) — the caller must return the app
   *  to a signed-out state (ADR-0013's frozen contract: the server already cleared the session
   *  cookie), never leave the user sitting on a screen for an account that no longer exists. */
  readonly onAccountDeleted: () => void
}

export function DatenschutzScreen({ onZurueck, onAccountDeleted }: DatenschutzScreenProps) {
  const bp = useBreakpoint()
  const { t } = useTranslation(APP_NS)
  // A plain `(key: string) => string` adapter, not `t` itself — the sections below only ever
  // pass a single string key, and threading i18next's full overload set through their props
  // would drag it along for no benefit.
  const tr = (key: string): string => t(key)
  const queryClient = useQueryClient()
  const deleteAccountMutation = useAccountDeletionControllerDeleteAccount()

  // The one honest source for "does this session have a real account, or just a guest cookie" —
  // better-auth's own session read via the shared seam (#349), never guessed client-side.
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
          // Clear every cached query before handing back — the next session must never see this
          // account's data flash from a stale cache (Slice-1-retro honesty bug).
          queryClient.clear()
          // ...and refetch better-auth's own session read: `queryClient.clear()` never touches
          // better-auth's nanostores atom, so without this a re-mount would read the stale,
          // still-signed-in atom and render actions for an account that no longer exists.
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
          // The generated union types `.status` as exactly the cases above, but `httpClient`
          // never throws on a non-2xx — a real 500 reached this switch with no case, leaving the
          // user on a spinner forever. Fall back to a usable state, and force any future status
          // addition to be handled explicitly (a new literal makes `result` no longer `never`).
          const exhaustiveCheck: never = result
          setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
          return exhaustiveCheck
        }
      }
    } catch {
      setDeleteFlow({ kind: withPassword !== undefined ? 'password' : 'confirm', error: 'generic' })
    }
  }

  const styles = makeDatenschutzStyles(useTheme())

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar tr={tr} onZurueck={onZurueck} />
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

function Appbar({ tr, onZurueck }: { readonly tr: (key: string) => string; readonly onZurueck: () => void }) {
  const t = useTheme()
  const styles = makeDatenschutzStyles(t)
  return (
    <View style={styles.appbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('datenschutz.back')} onPress={onZurueck} style={styles.backButton}>
        <Text style={styles.backGlyph}>←</Text>
      </Pressable>
      <Text style={styles.appbarTitle}>{tr('datenschutz.title')}</Text>
      <Pill>{tr('datenschutz.badge')}</Pill>
    </View>
  )
}

function Hero({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makeDatenschutzStyles(t)
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
  const styles = makeDatenschutzStyles(t)
  return (
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('datenschutz.sessionChecking')} />
      <Text style={styles.help}>{tr('datenschutz.sessionChecking')}</Text>
    </View>
  )
}

// #349 — the honest third outcome: `/get-session` didn't answer, so this screen genuinely does
// not know whether there's an account behind it. Never `GuestNotice` (asserts "no account") and
// never the export/delete section (asserts a real account) — see `useAccountSession.ts`.
function SessionUnknown({ tr, onRetry }: { readonly tr: (key: string) => string; readonly onRetry: () => void }) {
  const styles = makeDatenschutzStyles(useTheme())
  return (
    <Card>
      <Text style={styles.sectionTitle} accessibilityRole="alert">
        {tr('datenschutz.sessionUnknown.heading')}
      </Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.sessionUnknown.body')}</Text>
      <Button variante="ghost" onPress={onRetry}>
        {tr('datenschutz.sessionUnknown.retry')}
      </Button>
    </Card>
  )
}

// #238, ADR-0024 (task 0c): discloses that Session.ipAddress/userAgent are now user-visible via
// the QR-Code-Login's match-verification and the device list, and that QR-Login resolves the
// requesting device's IP to a country on our own EU infrastructure — never a third-party lookup.
function DeviceSessionsSection({ tr }: { readonly tr: (key: string) => string }) {
  const t = useTheme()
  const styles = makeDatenschutzStyles(t)
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
  const styles = makeDatenschutzStyles(t)
  return (
    <Card>
      <Text style={styles.sectionTitle}>{tr('datenschutz.guest.heading')}</Text>
      <Text style={styles.sectionBody}>{tr('datenschutz.guest.body')}</Text>
    </Card>
  )
}
