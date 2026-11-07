import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { Card, Chip, type UiTheme } from '@steuereule/ui'
import { QrMark } from '../../marks/QrMark'
import type { DeviceQrState, AutoRetryStatus } from '../../auth/useDeviceQrCode'
import type { Tr } from '../shared/tr'

function formatCountdown(seconds: number): string {
  const clamped = Math.max(seconds, 0)
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface DeviceQrColumnProps {
  readonly t: UiTheme
  readonly tr: Tr
  readonly state: DeviceQrState
  readonly requestNewCode: () => void
  readonly screenBannerShown: boolean
  readonly autoRetryStatus: AutoRetryStatus | null
}

export function DeviceQrColumn({ t, tr, state, requestNewCode, screenBannerShown, autoRetryStatus }: DeviceQrColumnProps) {
  const styles = makeStyles(t)
  const tight = state.kind === 'ready' && state.secondsRemaining <= 20
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  function copyCode(code: string) {
    try {
      void navigator.clipboard?.writeText(code)
    } catch {
    }
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 1400)
  }

  return (
    <View style={styles.qrColumn}>
      <Card variant="nacht" style={styles.qrCard} testID="qr-card">
        <Text style={styles.qrHeading}>{tr('login.qr.heading')}</Text>
        <Text style={styles.qrBody}>{tr('login.qr.body')}</Text>

        {state.kind === 'loading' ? (
          <View style={styles.qrFrame}>
            <ActivityIndicator size="small" color={t.color.funke} />
            <Text style={styles.qrStatusLabel}>{tr('login.qr.loading')}</Text>
          </View>
        ) : null}

        {state.kind === 'ready' ? (
          <View style={styles.qrFrame}>
            <QrMark value={state.verificationUriComplete} size={144} accessibilityLabel={tr('login.qr.accessibilityLabel')} brandMark />
            <View style={styles.qrCodeRow}>
              <Text style={styles.qrCode}>{state.userCode}</Text>
              <Chip onPress={() => copyCode(state.userCode)} style={styles.qrCopyChip} testID="qr-copy-chip">
                <Text style={styles.qrCopyChipLabel}>{copied ? tr('login.qr.copied') : tr('login.qr.copy')}</Text>
              </Chip>
            </View>
            <View
              style={styles.qrLifetime}
              accessibilityRole="progressbar"
              accessibilityLabel={tight ? tr('login.qr.knapp', { time: formatCountdown(state.secondsRemaining) }) : tr('login.qr.remaining', { time: formatCountdown(state.secondsRemaining) })}
              accessibilityValue={{ min: 0, max: state.totalSeconds, now: state.secondsRemaining }}
            >
              <View style={[styles.qrLifetimeTrack]}>
                <View
                  style={[
                    styles.qrLifetimeFill,
                    { width: `${(state.secondsRemaining / state.totalSeconds) * 100}%` },
                    tight && styles.qrLifetimeFillKnapp,
                  ]}
                />
              </View>
              <Text style={[styles.qrLifetimeLabel, tight && styles.qrLifetimeLabelKnapp]}>
                {tight ? tr('login.qr.knapp', { time: formatCountdown(state.secondsRemaining) }) : tr('login.qr.remaining', { time: formatCountdown(state.secondsRemaining) })}
              </Text>
            </View>
          </View>
        ) : null}

        {state.kind === 'approved' ? (
          <View style={styles.qrFrame} accessibilityRole="alert">
            <View style={styles.qrApprovedBadge}>
              <Text style={styles.qrApprovedCheck}>✓</Text>
            </View>
            <Text style={styles.qrStatusHeading}>{tr('login.qr.approved.heading')}</Text>
            <Text style={styles.qrStatusLabel}>{tr('login.qr.approved.body')}</Text>
          </View>
        ) : null}

        {state.kind === 'denied' ? (
          <View style={styles.qrFrame} accessibilityRole="alert">
            <Text style={styles.qrStatusLabel}>{tr('login.qr.denied')}</Text>
            <Pressable accessibilityRole="button" onPress={requestNewCode}>
              <Text style={styles.qrRetryLink}>{tr('login.qr.requestNew')}</Text>
            </Pressable>
          </View>
        ) : null}

        {state.kind === 'expired' ? (
          <View style={styles.qrFrame} accessibilityRole="alert">
            <Text style={styles.qrStatusLabel}>{tr('login.qr.expired')}</Text>
            <Pressable accessibilityRole="button" onPress={requestNewCode}>
              <Text style={styles.qrRetryLink}>{tr('login.qr.requestNew')}</Text>
            </Pressable>
          </View>
        ) : null}

        {state.kind === 'error' ? (
          <View style={styles.qrFrame} accessibilityRole={screenBannerShown && state.reason !== 'rate-limited' ? 'none' : 'alert'}>
            {state.reason === 'rate-limited' ? (
              <>
                <Text style={styles.qrStatusLabel}>{tr('login.qr.rateLimited')}</Text>
                <Pressable accessibilityRole="button" onPress={requestNewCode}>
                  <Text style={styles.qrRetryLink}>{tr('login.qr.retry')}</Text>
                </Pressable>
              </>
            ) : screenBannerShown ? (
              <>
                <Text style={styles.qrStatusLabel}>
                  {autoRetryStatus === 'exhausted' ? tr('login.qr.retryExhausted') : tr('login.qr.retryingAuto')}
                </Text>
                <Pressable accessibilityRole="button" onPress={requestNewCode}>
                  <Text style={styles.qrRetryLink}>{tr('login.qr.retry')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.qrStatusLabel}>{tr('login.qr.error')}</Text>
                <Text style={styles.qrRetryNote}>
                  {autoRetryStatus === 'exhausted' ? tr('login.qr.retryExhausted') : tr('login.qr.retryingAuto')}
                </Text>
                <Pressable accessibilityRole="button" onPress={requestNewCode}>
                  <Text style={styles.qrRetryLink}>{tr('login.qr.retry')}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </Card>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const qrColumn: ViewStyle = { width: '100%', maxWidth: 320, flexShrink: 0 }
  const qrCard: ViewStyle = { alignItems: 'center', marginBottom: 0 }
  const qrHeading: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.nachtText,
    textAlign: 'center',
  }
  const qrBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.nachtText, opacity: 0.8, textAlign: 'center', marginTop: t.space.s1, marginBottom: t.space.s4 }
  const qrFrame: ViewStyle = { alignItems: 'center', justifyContent: 'center', minHeight: 144, gap: t.space.s2, width: '100%' }
  const qrStatusLabel: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.nachtText, opacity: 0.85, textAlign: 'center' }
  const qrStatusHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.nachtText, textAlign: 'center' }
  const qrRetryNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.nachtText, opacity: 0.6, textAlign: 'center' }
  const qrCodeRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginTop: t.space.s3 }
  const qrCode: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.l, fontWeight: t.weight.schwer, color: t.color.funke, letterSpacing: 2, fontVariant: ['tabular-nums'] }
  const qrCopyChip: ViewStyle = { minHeight: 44, borderColor: t.color.nachtLinie, backgroundColor: 'transparent' }
  const qrCopyChipLabel: TextStyle = { fontSize: t.size.xs, fontWeight: t.weight.fett, color: t.color.nachtText }
  const qrRetryLink: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: t.color.funke, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' }
  const qrApprovedBadge: ViewStyle = { width: 48, height: 48, borderRadius: 99, backgroundColor: t.color.funke, alignItems: 'center', justifyContent: 'center' }
  const qrApprovedCheck: TextStyle = { fontSize: t.size.l, fontWeight: t.weight.schwer, color: t.color.nacht }
  const qrLifetime: ViewStyle = { width: '100%', marginTop: t.space.s3, gap: t.space.s1 }
  const qrLifetimeTrack: ViewStyle = { height: 5, borderRadius: 99, backgroundColor: t.color.nachtLinie, overflow: 'hidden', width: '100%' }
  const qrLifetimeFill: ViewStyle = { height: '100%', backgroundColor: t.color.funke, borderRadius: 99 }
  const qrLifetimeFillTight: ViewStyle = { backgroundColor: t.color.warn }
  const qrLifetimeLabel: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.nachtText, opacity: 0.6, textAlign: 'center' }
  const qrLifetimeLabelTight: TextStyle = { color: t.color.warn, opacity: 1, fontWeight: t.weight.schwer }

  return {
    qrColumn,
    qrCard,
    qrHeading,
    qrBody,
    qrFrame,
    qrStatusLabel,
    qrStatusHeading,
    qrRetryNote,
    qrCodeRow,
    qrCode,
    qrCopyChip,
    qrCopyChipLabel,
    qrRetryLink,
    qrApprovedBadge,
    qrApprovedCheck,
    qrLifetime,
    qrLifetimeTrack,
    qrLifetimeFill,
    qrLifetimeFillKnapp: qrLifetimeFillTight,
    qrLifetimeLabel,
    qrLifetimeLabelKnapp: qrLifetimeLabelTight,
  }
}
