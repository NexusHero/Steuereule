import { useEffect, useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Feld, Pill, useTheme, useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAccountSession } from '../../auth/useAccountSession'
import { useTwoFactor, type TotpSetup } from '../../auth/useTwoFactor'
import { usePasskey, type PasskeyInfo } from '../../auth/usePasskey'
import { QrMark } from '../../marks/QrMark'
import { makeSecurityStyles } from './styles'

export interface SecurityScreenProps {
  readonly onBack: () => void
}

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'enable-password'; readonly error: string; readonly busy: boolean }
  | { readonly kind: 'enable-setup'; readonly setup: TotpSetup; readonly error: string; readonly busy: boolean }
  | { readonly kind: 'disable-password'; readonly error: string; readonly busy: boolean }

export function SecurityScreen({ onBack }: SecurityScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const { state: sessionState } = useAccountSession()
  const twoFactor = useTwoFactor()
  const passkey = usePasskey()

  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeyStatus, setPasskeyStatus] = useState<string | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  const twoFactorEnabled = sessionState.status === 'signed-in' ? readTwoFactorEnabled(sessionState.session) : false
  const styles = makeSecurityStyles(t)

  useEffect(() => {
    if (sessionState.status !== 'signed-in') return
    let cancelled = false
    void passkey.list().then((result) => {
      if (cancelled) return
      if (typeof result === 'string') setPasskeyError(result)
      else setPasskeys(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState.status])

  async function refreshPasskeys() {
    const result = await passkey.list()
    if (typeof result === 'string') setPasskeyError(result)
    else setPasskeys(result)
  }

  async function submitAddPasskey() {
    if (passkeyBusy) return
    setPasskeyBusy(true)
    setPasskeyError(null)
    const error = await passkey.add('')
    setPasskeyBusy(false)
    if (error) {
      setPasskeyError(error)
      return
    }
    setPasskeyStatus(tr('sicherheit.passkey.added'))
    await refreshPasskeys()
  }

  async function submitRemovePasskey(id: string) {
    if (passkeyBusy) return
    setPasskeyBusy(true)
    setPasskeyError(null)
    const error = await passkey.remove(id)
    setPasskeyBusy(false)
    if (error) {
      setPasskeyError(error)
      return
    }
    setPasskeyStatus(tr('sicherheit.passkey.removed'))
    await refreshPasskeys()
  }

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
        <Pressable accessibilityRole="button" accessibilityLabel={tr('sicherheit.back')} onPress={onBack} style={styles.backButton}>
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
              <Button onPress={() => setStage({ kind: 'enable-password', error: '', busy: false })} testID="zweifaktor-einrichten">{tr('sicherheit.enable.start')}</Button>
            </Card>
          ) : null}

          {stage.kind === 'idle' && twoFactorEnabled ? (
            <Card style={styles.card}>
              <Text style={styles.sectionBody}>{tr('sicherheit.disable.explainer')}</Text>
              <Button variant="ghost" onPress={() => setStage({ kind: 'disable-password', error: '', busy: false })} testID="zweifaktor-abschalten">
                {tr('sicherheit.disable.start')}
              </Button>
            </Card>
          ) : null}

          {stage.kind === 'enable-password' ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.enable.passwordTitle')}</Text>
              <Feld label={tr('sicherheit.password')} error={stage.error}>
                <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" testID="zweifaktor-passwort" onSubmit={() => void submitEnablePassword()} />
              </Feld>
              <Button onPress={() => void submitEnablePassword()} disabled={stage.busy || !password} testID="zweifaktor-passwort-weiter">
                {stage.busy ? tr('sicherheit.busy') : tr('sicherheit.enable.confirm')}
              </Button>
            </Card>
          ) : null}

          {stage.kind === 'enable-setup' ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.enable.setupTitle')}</Text>
              <QrMark value={stage.setup.totpURI} size={168} accessibilityLabel={tr('sicherheit.enable.qrLabel')} />
              <Text style={styles.secret} testID="zweifaktor-totp-uri">{stage.setup.totpURI}</Text>
              <Text style={styles.sectionBody}>{tr('sicherheit.enable.backupCodes')}</Text>
              <Text style={styles.codes} testID="zweifaktor-backup-codes">{stage.setup.backupCodes.join('  ')}</Text>
              <Feld label={tr('sicherheit.enable.codeLabel')} error={stage.error}>
                <Input type="numeric" value={code} onChange={setCode} placeholder="123456" autoComplete="one-time-code" testID="zweifaktor-code" onSubmit={() => void submitCode()} />
              </Feld>
              <Button onPress={() => void submitCode()} disabled={stage.busy || !code} testID="zweifaktor-code-bestaetigen">
                {stage.busy ? tr('sicherheit.busy') : tr('sicherheit.enable.verify')}
              </Button>
            </Card>
          ) : null}

          {stage.kind === 'disable-password' ? (
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.disable.passwordTitle')}</Text>
              <Feld label={tr('sicherheit.password')} error={stage.error}>
                <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" testID="zweifaktor-passwort" onSubmit={() => void submitDisablePassword()} />
              </Feld>
              <Button onPress={() => void submitDisablePassword()} disabled={stage.busy || !password} testID="zweifaktor-abschalten-bestaetigen">
                {stage.busy ? tr('sicherheit.busy') : tr('sicherheit.disable.confirm')}
              </Button>
            </Card>
          ) : null}

          <Card style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.sectionTitle}>{tr('sicherheit.passkey.title')}</Text>
              <Pill>{passkeys === null ? tr('sicherheit.passkey.loading') : tr('sicherheit.passkey.count', { count: passkeys.length })}</Pill>
            </View>
            <Text style={styles.sectionBody}>{tr('sicherheit.passkey.body')}</Text>
            <Text style={styles.sectionBody}>{tr('sicherheit.passkey.webOnly')}</Text>

            {passkeyError ? (
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {passkeyError}
              </Text>
            ) : null}
            {passkeyStatus ? (
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {passkeyStatus}
              </Text>
            ) : null}

            {passkeys !== null && passkeys.length === 0 ? (
              <Text style={styles.sectionBody}>{tr('sicherheit.passkey.empty')}</Text>
            ) : null}

            {passkeys !== null && passkeys.length > 0
              ? passkeys.map((p) => (
                  <View key={p.id} style={styles.statusRow}>
                    <Text style={styles.sectionBody}>{p.name ?? tr('sicherheit.passkey.unnamed')}</Text>
                    <Button variant="ghost" onPress={() => void submitRemovePasskey(p.id)} disabled={passkeyBusy}>
                      {tr('sicherheit.passkey.remove')}
                    </Button>
                  </View>
                ))
              : null}

            <Button onPress={() => void submitAddPasskey()} disabled={passkeyBusy}>
              {passkeyBusy ? tr('sicherheit.busy') : tr('sicherheit.passkey.add')}
            </Button>
          </Card>
        </>
      )}
    </ScrollView>
  )
}

function readTwoFactorEnabled(session: unknown): boolean {
  if (typeof session !== 'object' || session === null) return false
  const user = (session as { user?: unknown }).user
  if (typeof user !== 'object' || user === null) return false
  return (user as { twoFactorEnabled?: unknown }).twoFactorEnabled === true
}
