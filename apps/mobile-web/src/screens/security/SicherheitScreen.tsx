// Sicherheit (REQ-007) — opt-in TOTP 2FA, reached from Profil (never a top-level tab,
// same drill-down as Datenschutz). The server does the enforcing (better-auth's
// `two-factor` plugin: enable → one generated code confirms → the factor is live; disable
// requires the password again). This screen is only the affordance: it reads the current
// state from the shared session seam and drives `useTwoFactor`'s calls — it never decides
// "is 2FA on" from local state (that would let the UI promise a factor the server has
// already revoked).
//
// `twoFactorEnabled` is read from the session user with a narrow cast: better-auth's client
// plugin declares `$InferServerPlugin: {}`, so the client-side `useSession()` type does not
// carry the server's `user.twoFactorEnabled` field — the *value* is present at runtime
// (the plugin returns it), only the client type is blind to it. The cast is scoped to this
// one field and asserted as a boolean, never a structural assumption about the whole user.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Feld, Pill, useTheme, useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAccountSession } from '../../auth/useAccountSession'
import { useTwoFactor, type TotpSetup } from '../../auth/useTwoFactor'
import { QrMark } from '../../marks/QrMark'
import { makeSicherheitStyles } from './styles'

export interface SicherheitScreenProps {
  readonly onZurueck: () => void
}

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'enable-password'; readonly error: string; readonly busy: boolean }
  | { readonly kind: 'enable-setup'; readonly setup: TotpSetup; readonly error: string; readonly busy: boolean }
  | { readonly kind: 'disable-password'; readonly error: string; readonly busy: boolean }

export function SicherheitScreen({ onZurueck }: SicherheitScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const { state: sessionState } = useAccountSession()
  const twoFactor = useTwoFactor()

  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const twoFactorEnabled = sessionState.status === 'signed-in' ? readTwoFactorEnabled(sessionState.session) : false
  const styles = makeSicherheitStyles(t)

  async function submitEnablePassword() {
    if (!password) return
    setStage((s) => (s.kind === 'enable-password' ? { ...s, busy: true } : s))
    const result = await twoFactor.enable(password)
    if (typeof result === 'string') {
      setStage({ kind: 'enable-password', error: result, busy: false })
      return
    }
    setPassword('')
    setStage({ kind: 'enable-setup', setup: result, error: '', busy: false })
  }

  async function submitCode() {
    if (!code) return
    setStage((s) => (s.kind === 'enable-setup' ? { ...s, busy: true } : s))
    const error = await twoFactor.verifyTotp(code)
    if (error) {
      setStage((s) => (s.kind === 'enable-setup' ? { ...s, error, busy: false } : s))
      return
    }
    setCode('')
    setStage({ kind: 'idle' })
    setStatus(tr('sicherheit.enabled'))
  }

  async function submitDisablePassword() {
    if (!password) return
    setStage((s) => (s.kind === 'disable-password' ? { ...s, busy: true } : s))
    const error = await twoFactor.disable(password)
    if (error) {
      setStage({ kind: 'disable-password', error, busy: false })
      return
    }
    setPassword('')
    setStage({ kind: 'idle' })
    setStatus(tr('sicherheit.disabled'))
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('sicherheit.back')} onPress={onZurueck} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{tr('sicherheit.title')}</Text>
      </View>

      {sessionState.status === 'loading' ? (
        <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('sicherheit.loading')} />
      ) : sessionState.status === 'unknown' || sessionState.status === 'signed-out' ? (
        <Card>
          <Text style={styles.sectionBody}>{tr('sicherheit.requiresAccount')}</Text>
        </Card>
      ) : (
        <>
          <Card variant="nacht">
            <View style={styles.statusRow}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.twoFactor.title')}</Text>
              <Pill>{twoFactorEnabled ? tr('sicherheit.twoFactor.on') : tr('sicherheit.twoFactor.off')}</Pill>
            </View>
            <Text style={styles.sectionBody}>{tr('sicherheit.twoFactor.body')}</Text>
          </Card>

          {status ? (
            <Text style={styles.status} accessibilityLiveRegion="polite">
              {status}
            </Text>
          ) : null}

          {stage.kind === 'idle' && !twoFactorEnabled ? (
            <Card style={styles.card}>
              <Text style={styles.sectionBody}>{tr('sicherheit.enable.explainer')}</Text>
              <Button onPress={() => setStage({ kind: 'enable-password', error: '', busy: false })}>{tr('sicherheit.enable.start')}</Button>
            </Card>
          ) : null}

          {stage.kind === 'idle' && twoFactorEnabled ? (
            <Card style={styles.card}>
              <Text style={styles.sectionBody}>{tr('sicherheit.disable.explainer')}</Text>
              <Button variante="ghost" onPress={() => setStage({ kind: 'disable-password', error: '', busy: false })}>
                {tr('sicherheit.disable.start')}
              </Button>
            </Card>
          ) : null}

          {stage.kind === 'enable-password' ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.enable.passwordTitle')}</Text>
              <Feld label={tr('sicherheit.password')} fehler={stage.error}>
                <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" onSubmit={() => void submitEnablePassword()} />
              </Feld>
              <Button onPress={() => void submitEnablePassword()} disabled={stage.busy || !password}>
                {stage.busy ? tr('sicherheit.busy') : tr('sicherheit.enable.confirm')}
              </Button>
            </Card>
          ) : null}

          {stage.kind === 'enable-setup' ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.enable.setupTitle')}</Text>
              <QrMark value={stage.setup.totpURI} size={168} accessibilityLabel={tr('sicherheit.enable.qrLabel')} />
              <Text style={styles.secret}>{stage.setup.totpURI}</Text>
              <Text style={styles.sectionBody}>{tr('sicherheit.enable.backupCodes')}</Text>
              <Text style={styles.codes}>{stage.setup.backupCodes.join('  ')}</Text>
              <Feld label={tr('sicherheit.enable.codeLabel')} fehler={stage.error}>
                <Input type="text" value={code} onChange={setCode} placeholder="123456" onSubmit={() => void submitCode()} />
              </Feld>
              <Button onPress={() => void submitCode()} disabled={stage.busy || !code}>
                {stage.busy ? tr('sicherheit.busy') : tr('sicherheit.enable.verify')}
              </Button>
            </Card>
          ) : null}

          {stage.kind === 'disable-password' ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.disable.passwordTitle')}</Text>
              <Feld label={tr('sicherheit.password')} fehler={stage.error}>
                <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" onSubmit={() => void submitDisablePassword()} />
              </Feld>
              <Button onPress={() => void submitDisablePassword()} disabled={stage.busy || !password}>
                {stage.busy ? tr('sicherheit.busy') : tr('sicherheit.disable.confirm')}
              </Button>
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}

/** Reads the server's `user.twoFactorEnabled` flag off the session user — scoped to this one
 *  field (see the module header for why a cast is needed at all). */
function readTwoFactorEnabled(session: unknown): boolean {
  if (typeof session !== 'object' || session === null) return false
  const user = (session as { user?: unknown }).user
  if (typeof user !== 'object' || user === null) return false
  return (user as { twoFactorEnabled?: unknown }).twoFactorEnabled === true
}
