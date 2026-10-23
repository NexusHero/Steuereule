// Shared honest-state surfaces — the one loading layout and the one retryable error layout
// every screen's data-loading block renders (Phase 0.3 AC-3: loading/empty/error/offline
// unified over one pattern instead of per-screen copies).
//
// Before this file, Cockpit/Profil/Onboarding/Interview/Device/Geraetefreigabe each carried a
// private `XxxLoading`/`XxxLoadError` that differed only in its i18n keys and a line or two of
// spacing — the same centred spinner + label, and the same centred heading + message + retry
// button, re-typed six times. The defect that motivates unifying them is the one every honest-
// state review has already found twice (#306/#336): a screen naming a cause it has not
// established, or showing a state it never actually derived. One component means that whole
// shape is written once and a drift can no longer be introduced screen-by-screen.
//
// ADR-0014: `useBreakpoint` may only be called once per screen, at its root — so the breakpoint
// is a *prop* here, computed at each screen's root and handed down, never re-read in this
// component. ADR-0006: the words stay in i18n, per screen (each screen keeps its own
// `cockpit.loading`/`profil.loading`/… namespace — the honest words genuinely differ per
// screen). That is why these take already-translated strings rather than i18n keys: this file
// owns the *shape*, the caller owns the *claim*.
import { ActivityIndicator, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { Button, useTheme, WIDE_CONTENT_MAX_WIDTH, type UiTheme, type Breakpoint } from '@steuereule/ui'

interface ScreenStateProps {
  /** Computed once at the host screen's root (ADR-0014) — never re-read here. */
  readonly bp: Breakpoint
}

function useScreenStateStyles(t: UiTheme) {
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
  const wideCenterScreen: ViewStyle = { ...centerScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    textAlign: 'center',
  }
  const help: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    textAlign: 'center',
  }
  return { centerScreen, wideCenterScreen, heading, help }
}

/** A real loading state: a spinner and an honest "what we're doing" label, never a blank frame. */
export function LoadingState({ bp, label }: ScreenStateProps & { readonly label: string }) {
  const t = useTheme()
  const styles = useScreenStateStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={label} />
      <Text style={styles.help}>{label}</Text>
    </View>
  )
}

interface ErrorStateProps extends ScreenStateProps {
  readonly heading: string
  readonly message: string
  /** Translated label for the retry action; omitted to render the honest error without one
   *  (a dead end with no real retry affordance is the honesty rule's own worst case). */
  readonly retryLabel?: string
  readonly onRetry?: () => void
}

/** A real retryable error state: names what failed, offers the one honest way out, never fakes data. */
export function ErrorState({ bp, heading, message, retryLabel, onRetry }: ErrorStateProps) {
  const t = useTheme()
  const styles = useScreenStateStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <Text style={styles.heading} accessibilityRole="alert">
        {heading}
      </Text>
      <Text style={styles.help}>{message}</Text>
      {retryLabel !== undefined && onRetry !== undefined ? <Button onPress={onRetry}>{retryLabel}</Button> : null}
    </View>
  )
}

/** A positive confirmation — a real answer, not a load/error/empty state, so no `alert` role. */
export function SuccessState({ bp, heading, message }: ScreenStateProps & { readonly heading: string; readonly message: string }) {
  const t = useTheme()
  const styles = useScreenStateStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.help}>{message}</Text>
    </View>
  )
}
