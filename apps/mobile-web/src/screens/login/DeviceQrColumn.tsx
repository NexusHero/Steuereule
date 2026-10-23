// The Login screen's QR device-login column (#238, restyled to `AuthGeraete.jsx`'s `nacht`
// surface per #283/C3). Extracted from LoginScreen.tsx so that file stays a screen, not a
// collection of a form, a header, a social slot and a whole QR state-machine surface.
//
// The state machine itself still lives in `LoginScreen` (`useDeviceQrCode`, §4(2) of its header:
// LoginScreen is the one surface that never unmounts on a resize, which is exactly why Musti's
// block names it as the seam rather than a provider). This component is presentational, driven
// entirely by the `state`/`requestNewCode` it is handed, so it can unmount/remount freely across
// the `s` boundary without losing anything.
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
  /** AC-A — while the shared banner above already names the cause, this column defers to it
   *  instead of repeating an unreachable-flavoured message of its own; it still shows that a
   *  retry is happening, just not why, a second time. */
  readonly screenBannerShown: boolean
  /** The hook's own live answer to "is a retry actually scheduled right now" (#298 F2) — read
   *  here rather than re-derived from `apiUnreachable`, so the copy can never claim more than
   *  the state machine is actually doing. */
  readonly autoRetryStatus: AutoRetryStatus | null
}

export function DeviceQrColumn({ t, tr, state, requestNewCode, screenBannerShown, autoRetryStatus }: DeviceQrColumnProps) {
  const styles = makeStyles(t)
  const knapp = state.kind === 'ready' && state.secondsRemaining <= 20
  const [kopiert, setKopiert] = useState(false)
  const kopiertTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(kopiertTimer.current), [])

  function copyCode(code: string) {
    try {
      void navigator.clipboard?.writeText(code)
    } catch {
      // Best-effort — a missing/blocked Clipboard API must not break the affordance itself; the
      // code is already right there, mono and selectable, as a fallback.
    }
    setKopiert(true)
    clearTimeout(kopiertTimer.current)
    kopiertTimer.current = setTimeout(() => setKopiert(false), 1400)
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
                <Text style={styles.qrCopyChipLabel}>{kopiert ? tr('login.qr.copied') : tr('login.qr.copy')}</Text>
              </Chip>
            </View>
            {/* The lifetime bar (§5, state 3 `knapp`) — visible, honest, with an amber
                pre-warning under 20s, not just a silent expiry event. */}
            <View style={styles.qrLifetime} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: state.totalSeconds, now: state.secondsRemaining }}>
              <View style={[styles.qrLifetimeTrack]}>
                <View
                  style={[
                    styles.qrLifetimeFill,
                    { width: `${(state.secondsRemaining / state.totalSeconds) * 100}%` },
                    knapp && styles.qrLifetimeFillKnapp,
                  ]}
                />
              </View>
              <Text style={[styles.qrLifetimeLabel, knapp && styles.qrLifetimeLabelKnapp]}>
                {knapp ? tr('login.qr.knapp', { time: formatCountdown(state.secondsRemaining) }) : tr('login.qr.remaining', { time: formatCountdown(state.secondsRemaining) })}
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
          // AC-A: "exactly one alert" is an accessibility contract, not just a visual one — while
          // the shared banner above already owns the `alert` announcement, this frame doesn't
          // duplicate it (no role at all beyond the manual retry's own `button`) *only* when it's
          // actually deferring to that banner. 'rate-limited' never defers (AC-B: it must keep
          // its own specific copy and its own announcement even if some other surface happens to
          // be down at the same time) — checked by reason, not by whether a banner is up.
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
  // Fixed footprint regardless of state (loading spinner / QR / expired or error message) so the
  // column doesn't jump around as the request resolves.
  const qrFrame: ViewStyle = { alignItems: 'center', justifyContent: 'center', minHeight: 144, gap: t.space.s2, width: '100%' }
  const qrStatusLabel: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.nachtText, opacity: 0.85, textAlign: 'center' }
  const qrStatusHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.nachtText, textAlign: 'center' }
  const qrRetryNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.nachtText, opacity: 0.6, textAlign: 'center' }
  const qrCodeRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginTop: t.space.s3 }
  const qrCode: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.l, fontWeight: t.weight.schwer, color: t.color.funke, letterSpacing: 2, fontVariant: ['tabular-nums'] }
  // The reference's own copy chip is 30px tall (`AuthGeraete.jsx:130`) — not ported: touch
  // targets stay ≥44px even where the DS demo is smaller.
  const qrCopyChip: ViewStyle = { minHeight: 44, borderColor: t.color.nachtLinie, backgroundColor: 'transparent' }
  const qrCopyChipLabel: TextStyle = { fontSize: t.size.xs, fontWeight: t.weight.fett, color: t.color.nachtText }
  const qrRetryLink: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: t.color.funke, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' }
  const qrApprovedBadge: ViewStyle = { width: 48, height: 48, borderRadius: 99, backgroundColor: t.color.funke, alignItems: 'center', justifyContent: 'center' }
  const qrApprovedCheck: TextStyle = { fontSize: t.size.l, fontWeight: t.weight.schwer, color: t.color.nacht }
  const qrLifetime: ViewStyle = { width: '100%', marginTop: t.space.s3, gap: t.space.s1 }
  const qrLifetimeTrack: ViewStyle = { height: 5, borderRadius: 99, backgroundColor: t.color.nachtLinie, overflow: 'hidden', width: '100%' }
  const qrLifetimeFill: ViewStyle = { height: '100%', backgroundColor: t.color.funke, borderRadius: 99 }
  const qrLifetimeFillKnapp: ViewStyle = { backgroundColor: t.color.warn }
  const qrLifetimeLabel: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.nachtText, opacity: 0.6, textAlign: 'center' }
  const qrLifetimeLabelKnapp: TextStyle = { color: t.color.warn, opacity: 1, fontWeight: t.weight.schwer }

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
    qrLifetimeFillKnapp,
    qrLifetimeLabel,
    qrLifetimeLabelKnapp,
  }
}
