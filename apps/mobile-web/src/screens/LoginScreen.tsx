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
//   - A QR device-login column (#238) — no DS artifact showed this at the time; NexusHero's own
//     ruling (not an invented pattern) put it in its own column next to the form on `m`/`l`,
//     derived from existing building blocks only. #282/#283 later brought a dedicated reference
//     (`AuthGeraete.jsx`) — see the #283 block below for what changed once it existed.
//
// #283 (Musti's refinement block + the stakeholder's own ruling on the three collisions between
// that reference and their stated wish, ADR-0018) — layout and honesty changes on top of #238:
//   C1 (arrangement, decided *against* the reference): stays two columns — form left, a shared
//     divider under the page title, QR right — because the *shipped* screen was already closer to
//     the stakeholder's wish than `Auth.jsx`'s own single-column "Anderer Weg" pill arrangement.
//   C2 (title): the wordmark is now the page's title, sitting above both columns; the former
//     greeting ("Schön, dass du da bist.") steps down to a subheading under it. A text-hierarchy
//     decision, not just a moved element.
//   C3 (QR surface): the QR card now uses `Card variant="nacht"` — the DS's own device for making
//     the second path unmistakable, not the default light card. The stakeholder weighed emphasis
//     over surface-matching for this one, explicitly.
//   The owl mark is dropped from above the QR card (no basis in the current reference — the DS
//   puts the brand mark inside the QR pattern's own centre instead, `AuthGeraete.jsx:25-27`); a
//   copy affordance and a "no camera" fallback line are added to the code, matching the reference.
//   AC-A/AC-B (the shared-outage banner and its hard boundary) live in `apiUnreachable` below.
import { useEffect, useRef, useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, Feld, Chip, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useSocialSignIn } from '../auth/useSocialSignIn'
import { useSocialSignInAvailable } from '../auth/useSocialSignInAvailable'
import { useEmailVerified } from '../auth/useEmailVerified'
import { useDeviceQrCode, type DeviceQrState, type AutoRetryStatus } from '../auth/useDeviceQrCode'
import { GoogleG } from '../icons/GoogleG'
import { QrMark } from '../marks/QrMark'

/** The real `t` function's type (with interpolation support) — used by every small subcomponent
 *  below that takes `tr` as a prop, so a component that needs `tr(key, { … })` (the QR
 *  countdown's `{{time}}`) doesn't need its own hand-rolled, narrower signature. */
type Tr = ReturnType<typeof useTranslation<typeof APP_NS>>['t']

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

function formatCountdown(seconds: number): string {
  const clamped = Math.max(seconds, 0)
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

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

  // #283 §3(c)/§4(2) — the QR device machine is owned here, at the screen's own top level, not
  // inside `DeviceQrColumn`: `LoginScreen` is the one thing among the three surfaces (this form,
  // the capability probe, the QR mint) that never unmounts on a resize, which is exactly why
  // Musti's block names it as the seam rather than a provider. `enabled` is false whenever there
  // is structurally no honest use for a code yet (`s`, or embedded usage) — `useDeviceQrCode`'s
  // own `hasStarted` latch is what then keeps a later `s -> m` resize from burning a code that
  // already exists, or minting twice.
  const deviceQrEnabled = showDeviceQr && bp !== 's'
  const { state: qrState, requestNewCode: requestNewQrCode, autoRetryStatus } = useDeviceQrCode(onDone, deviceQrEnabled)

  // AC-A — one cause, one message. Driven off the QR mint's own transport read (`useDeviceQrCode`
  // fires it the instant the screen mounts wide enough, before any user action), plus the login
  // form's own transport catch below. Deliberately narrow: AC-B is exactly as load-bearing as
  // AC-A, so this must never go true on a real *answer* (wrong password, an expired/denied code,
  // a 429) — only on a genuine "nothing answered" failure.
  const [formTransportError, setFormTransportError] = useState(false)
  // #336 review, F1 — established by OUR OWN submit failing to reach the server, and by nothing
  // else. `qrUnreachable || formTransportError` made one surface speak for the whole app: with
  // only `/v1/device/code` down, this screen rendered "Unsere Server antworten nicht" directly
  // above "E-Mail oder Passwort stimmen nicht." — a claim refuted three lines below it by a
  // message that is only knowable because a server answered.
  //
  // The banner's wording cannot be reused for a QR-only outage (resources.ts records it as
  // "generalised beyond 'no QR code' since this banner now also covers the login form"), and it
  // does not need to be: the QR column already owns honest copy for its own failure
  // (`login.qr.error` + the retry-status line), which is what it now falls through to. Suhay's
  // ruling on this was "no new string" — the existing one claims exactly what the mint
  // established and nothing more.
  const apiUnreachable = formTransportError
  // Musti's #298 review, F2 — the banner's "we're automatically retrying" sentence is only true
  // while something is actually scheduled to retry. At `bp === 's'` (or embedded usage) the QR
  // column never even starts (`deviceQrEnabled` is false), so `autoRetryStatus` stays `null`
  // there forever — the banner must not claim an in-flight retry that structurally cannot exist.
  // Same logic covers 'exhausted' (§4(1)'s attempt cap): once auto-retry has genuinely given up,
  // the banner stops claiming it's still happening too.
  const apiUnreachableAutoRetrying = autoRetryStatus === 'scheduled'

  const ok = mail.includes('@') && pass.length >= 6

  async function login() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('login.errPass') : tr('login.errEmail'))
      return
    }
    setFehler('')
    setFormTransportError(false)
    setStage({ kind: 'submitting' })
    // better-auth's client only resolves to `{ data, error }` for a request that reached the
    // server; a genuine network failure (offline, DNS, CORS) rejects the promise instead — both
    // must land on an honest state rather than an unhandled rejection. Which honest state depends
    // on whether the shared banner is already up (AC-A: one alert, not two) — see the render below.
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
      setFormTransportError(true)
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
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} styles={styles} showDivider={false} />
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

  // AC-A — the password field's own inline error is suppressed while the shared banner is up:
  // "exactly one alert naming the cause", not the same generic text twice.
  //
  // #308 — suppress only when the banner's cause actually SUBSUMES the field's message. It does
  // when the form's own submit never reached the server (`formTransportError`): there is one
  // cause, and the banner names it. It does not when only the QR column is down — the auth
  // endpoint answered, and what it answered was "wrong password". Keying this off `apiUnreachable`
  // let one surface's failure veto another surface's real answer, so a user at `m`/`l` was told
  // the app could not reach the server while the server was busy telling them their password was
  // wrong. Two independent causes are two messages; that is not the jabber #298 consolidated,
  // which was three messages about one cause.
  const passwordFehler = formTransportError ? '' : fehler

  const formColumn = (
    <View style={bp === 's' ? undefined : styles.formColumn}>
      {/* Only offered where the server says Google is actually configured (REQ-008) — a
          deployment without credentials must not show a button whose every press fails.
          `not-configured` gets the DS's own honest fallback (`auth.html`) rather than silently
          vanishing; `unknown` alone (still probing) stays silent to avoid a flicker, but once
          the shared banner is up (AC-A) it too gets an honest "can't tell right now" line rather
          than disappearing without trace. */}
      {googleAvailable === 'available' ? (
        <>
          <View style={styles.socialButtons}>
            <Button variante="ghost" onPress={() => void googleSignIn()} disabled={socialSubmitting || stage.kind === 'submitting'}>
              <GoogleG /> {tr('login.google')}
            </Button>
          </View>
          <SocialDivider tr={tr} styles={styles} />
        </>
      ) : googleAvailable === 'not-configured' ? (
        <>
          <View style={styles.socialFallback} accessibilityRole="text">
            <View style={styles.socialFallbackIcon}>
              <GoogleG />
            </View>
            <Text style={styles.socialFallbackText}>{tr('login.googleNotConfigured')}</Text>
          </View>
          <SocialDivider tr={tr} styles={styles} />
        </>
      ) : apiUnreachable ? (
        <>
          <View style={styles.socialFallback} accessibilityRole="text">
            <View style={styles.socialFallbackIcon}>
              <GoogleG />
            </View>
            <Text style={styles.socialFallbackText}>{tr('login.googleUnknown')}</Text>
          </View>
          <SocialDivider tr={tr} styles={styles} />
        </>
      ) : null}

      {apiUnreachable ? (
        <View style={styles.outageBanner} accessibilityRole="alert">
          <Text style={styles.outageHeading}>{tr('login.apiUnreachable.heading')}</Text>
          <Text style={styles.outageBody}>
            {apiUnreachableAutoRetrying ? tr('login.apiUnreachable.bodyRetrying') : tr('login.apiUnreachable.body')}
          </Text>
        </View>
      ) : null}

      <Feld label={tr('login.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('login.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('login.passwordLabel')} fehler={passwordFehler}>
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
  // regardless of width. The QR *state machine* itself (`qrState` above) is unaffected by any of
  // this — only its visual column is conditionally rendered here.
  if (bp === 's' || !showDeviceQr) {
    return (
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} styles={styles} showDivider={false} />
        {formColumn}
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <PageHeader tr={tr} t={t} styles={styles} showDivider />
      <View style={styles.wideRow}>
        {formColumn}
        <DeviceQrColumn
          t={t}
          tr={tr}
          styles={styles}
          state={qrState}
          requestNewCode={requestNewQrCode}
          screenBannerShown={apiUnreachable}
          autoRetryStatus={autoRetryStatus}
        />
      </View>
    </ScrollView>
  )
}

interface SocialDividerProps {
  readonly tr: Tr
  readonly styles: ReturnType<typeof makeStyles>
}

function SocialDivider({ tr, styles }: SocialDividerProps) {
  return (
    <View style={styles.dividerRow} accessibilityRole="none">
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{tr('login.orEmail')}</Text>
      <View style={styles.dividerLine} />
    </View>
  )
}

interface DeviceQrColumnProps {
  readonly t: UiTheme
  readonly tr: Tr
  readonly styles: ReturnType<typeof makeStyles>
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

/**
 * The Login screen's QR device-login column (#238, restyled to `AuthGeraete.jsx`'s `nacht`
 * surface per #283/C3). The state machine itself lives in `LoginScreen` (`useDeviceQrCode`,
 * §4(2)) — this component is presentational, driven entirely by the `state`/`requestNewCode`
 * it's handed, so it can unmount/remount freely across the `s` boundary without losing anything.
 */
function DeviceQrColumn({ t, tr, styles, state, requestNewCode, screenBannerShown, autoRetryStatus }: DeviceQrColumnProps) {
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
              <Chip
                onPress={() => copyCode(state.userCode)}
                style={styles.qrCopyChip}
                testID="qr-copy-chip"
              >
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
          // be down at the same time) — checked by reason, not by the blanket `apiUnreachable`.
          <View style={styles.qrFrame} accessibilityRole={screenBannerShown && state.reason !== 'rate-limited' ? 'none' : 'alert'}>
            {/* AC-A: while the shared banner above is up, this defers to it — no repeated
                "we can't reach the server" prose, just that a retry is under way. AC-B/ADR-0024:
                'rate-limited' never says that, and never auto-retries — its own specific copy,
                manual retry only. */}
            {state.reason === 'rate-limited' ? (
              <>
                <Text style={styles.qrStatusLabel}>{tr('login.qr.rateLimited')}</Text>
                <Pressable accessibilityRole="button" onPress={requestNewCode}>
                  <Text style={styles.qrRetryLink}>{tr('login.qr.retry')}</Text>
                </Pressable>
              </>
            ) : screenBannerShown ? (
              <>
                {/* #298 F2/F1(b) — this must say exactly what's actually happening: 'scheduled'
                    while a retry is really pending, 'exhausted' once §4(1)'s attempt cap has
                    given up on its own (never claim an ongoing retry that stopped). */}
                <Text style={styles.qrStatusLabel}>
                  {autoRetryStatus === 'exhausted' ? tr('login.qr.retryExhausted') : tr('login.qr.retryingAuto')}
                </Text>
                {/* The auto-retry backing off (or having given up) is not a reason to take the
                    manual way out away — a user who has just fixed their WiFi shouldn't have to
                    wait out the backoff, and once it's exhausted this is the only way left. */}
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

interface PageHeaderProps {
  readonly tr: Tr
  readonly t: UiTheme
  readonly styles: ReturnType<typeof makeStyles>
  /** C1/C2 (#283, stakeholder ruling) — the wordmark is the page's title, sitting above both
   *  columns, with a shared divider underneath when there actually are two columns to share it.
   *  At `s` (one column) or on the unverified stage there is nothing to divide. */
  readonly showDivider: boolean
}

function PageHeader({ tr, t, styles, showDivider }: PageHeaderProps) {
  return (
    <View style={styles.header}>
      {/* C2 — the wordmark is the page's real title now (level 1); the former greeting is
          visually a subheading and, per Musti's #298 review (F8), must be one semantically
          too — `role="heading"`/`aria-level` (react-native-web forwards both straight through,
          RN's own `accessibilityRole="header"` alone maps to `role="heading"` but carries no
          level, which the DOM/ARIA default to 2 regardless — explicit here so it's not an
          accident of a spec default). */}
      <Text style={styles.wordmark} role="heading" aria-level={1}>
        {tr('brand.steuer')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('brand.eule')}</Text>
      </Text>
      <Text style={styles.subheading} role="heading" aria-level={2}>
        {tr('login.greetingBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('login.greetingMark')}</Text>
        {tr('login.greetingAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('login.subtitle')}</Text>
      {showDivider ? <View style={styles.headerDivider} /> : null}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.s6,
    justifyContent: 'center',
    width: '100%',
  }
  const header: ViewStyle = { width: '100%' }
  // C2 — the wordmark is now the page's title: the same weight/size the old inline greeting
  // heading used to carry, promoted here instead of staying a small brand lockup.
  const wordmark: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  // The former page title, demoted to a subheading under the wordmark (C2's stated side effect).
  const subheading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.l, color: t.color.tinte, marginBottom: t.space.s1 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m }
  const headerDivider: ViewStyle = { height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1, marginTop: t.space.s5, marginBottom: t.space.s5, width: '100%' }
  const formColumn: ViewStyle = { width: '100%', maxWidth: 460, flexShrink: 1 }
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
  // targets stay ≥44px (this file's own accessibility rule) even where the DS demo is smaller.
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
  const socialButtons: ViewStyle = { flexDirection: 'column', gap: t.space.s2, marginBottom: t.space.s4 }
  // The DS's own honest fallback for a genuinely unconfigured/unknown provider (auth.html) — a
  // dashed outline in the button's own place, not silence (#283 §3(a)).
  const socialFallback: ViewStyle = {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.color.linieWeich,
    borderRadius: t.radius.pille,
    paddingHorizontal: t.space.s4,
    marginBottom: t.space.s4,
  }
  const socialFallbackIcon: ViewStyle = { opacity: 0.45 }
  const socialFallbackText: TextStyle = { flexShrink: 1, fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 }
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
  const verifiedBanner: ViewStyle = {
    backgroundColor: t.color.okWeich,
    borderWidth: 2,
    borderColor: t.color.ok,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const verifiedHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  // AC-A's single shared alert — same box primitive as `verifyBanner`, recoloured `fehler`/
  // `fehlerWeich`: an outage is a failure, not a caution or a positive confirmation.
  const outageBanner: ViewStyle = {
    backgroundColor: t.color.fehlerWeich,
    borderWidth: 2,
    borderColor: t.color.fehler,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const outageHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s1 }
  const outageBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 }

  return {
    screen,
    wideScreen,
    wideRow,
    header,
    wordmark,
    subheading,
    subtitle,
    headerDivider,
    formColumn,
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
    socialButtons,
    socialFallback,
    socialFallbackIcon,
    socialFallbackText,
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
    outageBanner,
    outageHeading,
    outageBody,
  }
}
