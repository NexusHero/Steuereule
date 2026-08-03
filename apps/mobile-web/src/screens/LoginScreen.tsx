// Login (F: auth.html / Auth.jsx in Funke dress) — email+password against the real better-auth
// client SDK, Google social sign-in (REQ-008), guest mode (#61). Copy via i18n (de base + en).
// One primary action.
//
// Deliberate deviations from the checked-in DS reference:
//   - Apple sign-in remains hidden (REQ-008b, #45 — backlog-gated until iOS build exists).
//   - "Passwort vergessen?" is dropped — no DS artifact for a reset flow exists and it isn't
//     in REQ-005's scope; a dead Pressable doesn't ship.
//   - A real, honest "please verify your email" banner is added after a successful sign-in to an
//     unverified account (REQ-005) — a case neither auth.html nor Auth.jsx shows at all.
//   - A QR device-login column (#238) — no DS artifact shows this either; NexusHero's own ruling
//     (not an invented pattern) puts it in its own column next to the form on `m`/`l`, derived
//     from existing building blocks only: `Card` for the frame, the same owl entrance already
//     running on Splash (`useOwlEntranceAnimation`, extracted from there rather than copied), and
//     `QrMark` (react-native-svg, the same rendering technology OwlMark already uses). Absent on
//     `s` — scanning a code with the same phone you're reading it on has no honest use, and there
//     is nowhere near enough width for a second column at 375px.
//
// Also used *embedded* (#238 AC-7): the device-approval flow renders this screen in place —
// never navigates to it — when the phone opening `/device?user_code=…` has no session, so the
// URL (and the pending code) survives the whole detour by construction. In that context
// `onGuest`/`onRegister` are omitted and `showDeviceQr` is `false`: NexusHero's ruling on the
// onRegister gap ("whoever has no account has nothing to release") applies identically to guest
// mode, and a second, unrelated QR column minting its own device code makes no sense next to
// "sign in to approve this one."
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Feld, Chip, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useSocialSignIn } from '../auth/useSocialSignIn'
import { useSocialSignInAvailable } from '../auth/useSocialSignInAvailable'
import { useEmailVerified } from '../auth/useEmailVerified'
import { useDeviceQrCode } from '../auth/useDeviceQrCode'
import { GoogleG } from '../icons/GoogleG'
import { OwlMark } from '../marks/OwlMark'
import { useOwlEntranceAnimation } from '../marks/useOwlEntranceAnimation'
import { QrMark } from '../marks/QrMark'

export interface LoginScreenProps {
  readonly onDone: () => void
  /** Omit to hide "weiter als Gast" — used when this screen is embedded inside the
   *  device-approval flow (#238 AC-7), where a guest has nothing to approve with. */
  readonly onGuest?: () => void
  /** Omit to hide "Neu hier? Konto anlegen" — same reasoning as `onGuest` above. */
  readonly onRegister?: () => void
  /** False when embedded (#238 AC-7) — a second, unrelated device-login column has no
   *  place next to "sign in to approve this code", and would silently mint its own
   *  DeviceCode row every time. Defaults to `true` (the top-level Login route). */
  readonly showDeviceQr?: boolean
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'unverified'; readonly email: string }

export function LoginScreen({ onDone, onGuest, onRegister, showDeviceQr = true }: LoginScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')
  const { signIn: socialSignIn, isSubmitting: socialSubmitting } = useSocialSignIn()
  const googleAvailable = useSocialSignInAvailable('google')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  // Live, account-scoped, fail-closed — shared with RegistrierungScreen (#194/#217, ADR-0012
  // amendment). Scoping matters more here: this is the screen a second person on a shared
  // device signs in on, so a stale verified session belonging to a *different* account is a
  // routine path, not a race.
  const emailVerified = useEmailVerified(stage.kind === 'unverified' ? stage.email : undefined)

  const ok = mail.includes('@') && pass.length >= 6

  async function login() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('login.errPass') : tr('login.errEmail'))
      return
    }
    setFehler('')
    setStage({ kind: 'submitting' })
    // better-auth's client only resolves to `{ data, error }` for a request that reached the
    // server; a genuine network failure (offline, DNS, CORS) rejects the promise instead — both
    // must land on the same honest, generic error rather than an unhandled rejection.
    try {
      const { data, error } = await authClient.signIn.email({ email: mail, password: pass })
      if (error || !data) {
        setStage({ kind: 'form' })
        setFehler(tr(`auth.${authErrorKey(error)}`))
        return
      }
      if (data.user.emailVerified) {
        // Reset before navigating away: in-app this screen unmounts on `onDone`, but a real
        // loading state must never be left dangling if the caller doesn't immediately navigate.
        setStage({ kind: 'form' })
        onDone()
      } else {
        setStage({ kind: 'unverified', email: data.user.email })
      }
    } catch {
      setStage({ kind: 'form' })
      setFehler(tr('auth.errGeneric'))
    }
  }

  async function resendVerification(email: string) {
    setResend('sending')
    try {
      const { error } = await authClient.sendVerificationEmail({ email })
      setResend(error ? 'error' : 'sent')
    } catch {
      setResend('error')
    }
  }

  async function googleSignIn() {
    const sozialFehler = await socialSignIn('google')
    if (sozialFehler) {
      setFehler(sozialFehler)
      return
    }
    onDone()
  }

  if (stage.kind === 'unverified') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
        <Brand tr={tr} t={t} />
        {!emailVerified ? (
          <View style={styles.verifyBanner} accessibilityRole="alert">
            <Text style={styles.verifyHeading}>{tr('auth.verifyBanner.heading')}</Text>
            <Text style={styles.verifyBody}>{tr('auth.verifyBanner.body', { email: stage.email })}</Text>
            <Pressable onPress={() => void resendVerification(stage.email)} disabled={resend === 'sending'}>
              <Text style={styles.verifyResendLink}>
                {resend === 'sending' ? tr('auth.verifyBanner.resendSending') : tr('auth.verifyBanner.resend')}
              </Text>
            </Pressable>
            {resend === 'sent' ? <Text style={styles.verifyResendNote}>{tr('auth.verifyBanner.resendSent')}</Text> : null}
            {resend === 'error' ? <Text style={styles.verifyResendError}>{tr('auth.verifyBanner.resendError')}</Text> : null}
          </View>
        ) : (
          // Stakeholder's (b) ruling on #217 (mirrors #194 on RegistrierungScreen): a positive
          // confirmation the user taps through, never an auto-navigate off a background event.
          // The resend affordance goes with the banner it lived in — nothing left to resend.
          <View style={styles.verifiedBanner} accessibilityRole="alert">
            <Text style={styles.verifiedHeading}>{tr('auth.verifiedBanner.heading')}</Text>
          </View>
        )}
        <Button onPress={onDone} style={styles.cta}>
          {tr('login.continue')}
        </Button>
      </ScrollView>
    )
  }

  const formColumn = (
    <View style={bp === 's' ? undefined : styles.formColumn}>
      <Brand tr={tr} t={t} />

      <Text style={styles.heading}>
        {tr('login.greetingBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('login.greetingMark')}</Text>
        {tr('login.greetingAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('login.subtitle')}</Text>

      {/* Only offered where the server says Google is actually configured (REQ-008) — a
          deployment without credentials must not show a button whose every press fails.
          The divider goes with it: with no social option above, there is nothing to
          divide the email form from. */}
      {googleAvailable ? (
        <>
          <View style={styles.socialButtons}>
            <Button variante="ghost" onPress={() => void googleSignIn()} disabled={socialSubmitting || stage.kind === 'submitting'}>
              <GoogleG /> {tr('login.google')}
            </Button>
          </View>

          <View style={styles.dividerRow} accessibilityRole="none">
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>{tr('login.orEmail')}</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      ) : null}

      <Feld label={tr('login.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('login.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('login.passwordLabel')} fehler={fehler}>
        <Input type="password" value={pass} onChange={setPass} placeholder="••••••••" onSubmit={() => void login()} />
      </Feld>
      <Button onPress={() => void login()} disabled={stage.kind === 'submitting'}>
        {stage.kind === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={t.color.tinte} />
            <Text style={styles.submittingLabel}>{tr('login.submitting')}</Text>
          </View>
        ) : (
          tr('login.submit')
        )}
      </Button>

      {onRegister ? (
        <View style={styles.linksRow}>
          <Pressable accessibilityRole="link" onPress={onRegister}>
            <Text style={styles.link}>{tr('login.register')}</Text>
          </Pressable>
        </View>
      ) : null}

      {onGuest ? (
        <View style={{ alignItems: 'center', marginTop: t.space.s5 }}>
          <Chip onPress={onGuest}>{tr('login.guest')}</Chip>
          <Text style={styles.guestNote}>{tr('login.guestNote')}</Text>
        </View>
      ) : null}
    </View>
  )

  // The QR column has no honest use on `s` (375px, and it's the same phone whose camera would
  // have to scan its own screen) — `useBreakpoint` is called once, at this screen's root
  // (ADR-0014), and this is the one structural switch it drives. `showDeviceQr` folds into the
  // same switch rather than a second one: embedded usage (#238 AC-7) never wants the column,
  // regardless of width.
  if (bp === 's' || !showDeviceQr) {
    return (
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
        {formColumn}
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.wideRow} keyboardShouldPersistTaps="handled" data-testid="screen-container">
      {formColumn}
      <DeviceQrColumn t={t} tr={tr} styles={styles} onApproved={onDone} />
    </ScrollView>
  )
}

interface DeviceQrColumnProps {
  readonly t: UiTheme
  readonly tr: (key: string) => string
  readonly styles: ReturnType<typeof makeStyles>
  /** Fires once the phone has approved this exact code and the desktop's own session cookie is
   *  already set (`useDeviceQrCode`'s polling loop, task 6) — the same `onDone` a real
   *  email/social sign-in calls, so a QR sign-in lands in the same place a typed-password one
   *  does (REQ-009 is still pending a dedicated "already signed in" landing; this reuses
   *  whatever Login's own `onDone` already does today, deliberately, rather than inventing a
   *  second destination). */
  readonly onApproved: () => void
}

/**
 * The Login screen's QR device-login column (#238) — derived entirely from existing building
 * blocks (Card for the frame, the owl's existing entrance, QrMark's react-native-svg rendering),
 * per NexusHero's ruling that no new DS pattern gets invented here. Requests a real code the
 * moment it mounts (ADR-0003/0005) via `useDeviceQrCode`; every state below is honest — a
 * loading code never shows a blank frame, an expired, denied, or failed one never keeps showing
 * a code that no longer works.
 */
function DeviceQrColumn({ t, tr, styles, onApproved }: DeviceQrColumnProps) {
  const { state, requestNewCode } = useDeviceQrCode(onApproved)
  const owl = useOwlEntranceAnimation()

  return (
    <View style={styles.qrColumn}>
      <Card style={styles.qrCard}>
        <OwlMark size={56} headStyle={owl.headStyle} glassesStyle={owl.glassesStyle} lidStyle={owl.lidStyle} />
        <Text style={styles.qrHeading}>{tr('login.qr.heading')}</Text>
        <Text style={styles.qrBody}>{tr('login.qr.body')}</Text>

        {state.kind === 'loading' ? (
          <View style={styles.qrFrame}>
            <ActivityIndicator size="small" color={t.color.tinte} />
            <Text style={styles.qrStatusLabel}>{tr('login.qr.loading')}</Text>
          </View>
        ) : null}

        {state.kind === 'ready' ? (
          <View style={styles.qrFrame}>
            <QrMark value={state.verificationUriComplete} size={144} accessibilityLabel={tr('login.qr.accessibilityLabel')} />
            <Text style={styles.qrCode}>{state.userCode}</Text>
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
          <View style={styles.qrFrame} accessibilityRole="alert">
            <Text style={styles.qrStatusLabel}>{tr('login.qr.error')}</Text>
            <Pressable accessibilityRole="button" onPress={requestNewCode}>
              <Text style={styles.qrRetryLink}>{tr('login.qr.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    </View>
  )
}

interface BrandProps {
  readonly tr: (key: string) => string
  readonly t: UiTheme
}

function Brand({ tr, t }: BrandProps) {
  const wordmark: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.xl, color: t.color.tinte }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginBottom: t.space.s5 }}>
      <Text style={wordmark}>
        {tr('brand.steuer')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('brand.eule')}</Text>
      </Text>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = {
    ...screen,
    maxWidth: WIDE_CONTENT_MAX_WIDTH,
  }
  // Two columns, `m`/`l` only (LoginScreen's single `useBreakpoint` call above already gates
  // this) — the form keeps its own established width via `formColumn`, the QR column takes the
  // rest up to the same `WIDE_CONTENT_MAX_WIDTH` every other wide layout in this app uses.
  const wideRow: ViewStyle = {
    ...wideScreen,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.s6,
    justifyContent: 'center',
  }
  const formColumn: ViewStyle = { width: '100%', maxWidth: 460, flexShrink: 1 }
  const qrColumn: ViewStyle = { width: '100%', maxWidth: 280, flexShrink: 0 }
  const qrCard: ViewStyle = { alignItems: 'center', marginBottom: 0 }
  const qrHeading: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
    textAlign: 'center',
    marginTop: t.space.s2,
  }
  const qrBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s1, marginBottom: t.space.s4 }
  // Fixed footprint regardless of state (loading spinner / QR / expired or error message) so the
  // column doesn't jump around as the request resolves.
  const qrFrame: ViewStyle = { alignItems: 'center', justifyContent: 'center', minHeight: 144, gap: t.space.s2 }
  const qrStatusLabel: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, textAlign: 'center' }
  const qrCode: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.l, fontWeight: t.weight.schwer, color: t.color.tinte, letterSpacing: 2 }
  const qrRetryLink: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: t.color.tinte, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' }
  const heading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s5 }
  const socialButtons: ViewStyle = { flexDirection: 'column', gap: t.space.s2, marginBottom: t.space.s4 }
  const dividerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginVertical: t.space.s4 }
  const dividerLine: ViewStyle = { flex: 1, height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1 }
  const dividerLabel: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.tinte2 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const guestNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const verifyBanner: ViewStyle = {
    backgroundColor: t.color.warnWeich,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const verifyHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s1 }
  const verifyBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s2 }
  const verifyResendLink: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: t.color.tinte, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' }
  const verifyResendNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s1 }
  const verifyResendError: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.fehler, marginTop: t.space.s1 }
  // Same box primitive as `verifyBanner`, recolored with the DS's positive semantic pair
  // (`--ok`/`--ok-weich`, `farben-semantik.html`) — duplicated from RegistrierungScreen rather
  // than extracted (Musti's #217 ruling: style drift is a DS-review concern, not this one).
  // Not byte-identical: RegistrierungScreen's copy carries `width: '100%'`, this one doesn't —
  // deliberately. RegistrierungScreen's container is `successScreen = { ...screen, alignItems:
  // 'center' }` (RegistrierungScreen.tsx:202), which shrinks children to content width, so its
  // banner needs the explicit `width: '100%'`; LoginScreen's container is plain `screen`, which
  // stretches children, so it doesn't need it. Consistent within each file too — this file's
  // sibling `verifyBanner` above also omits it, RegistrierungScreen's also has it. Don't
  // "restore parity" between the two; that would break one of them.
  const verifiedBanner: ViewStyle = {
    backgroundColor: t.color.okWeich,
    borderWidth: 2,
    borderColor: t.color.ok,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const verifiedHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }

  return {
    screen,
    wideScreen,
    wideRow,
    formColumn,
    qrColumn,
    qrCard,
    qrHeading,
    qrBody,
    qrFrame,
    qrStatusLabel,
    qrCode,
    qrRetryLink,
    heading,
    subtitle,
    socialButtons,
    dividerRow,
    dividerLine,
    dividerLabel,
    linksRow,
    link,
    guestNote,
    submittingRow,
    submittingLabel,
    cta,
    verifyBanner,
    verifyHeading,
    verifyBody,
    verifyResendLink,
    verifyResendNote,
    verifyResendError,
    verifiedBanner,
    verifiedHeading,
  }
}
