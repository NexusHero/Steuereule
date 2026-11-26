import { ActivityIndicator, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme, type Breakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'

interface ScreenStateProps {
  readonly bp: Breakpoint
}

function useScreenStateStyles(t: UiTheme) {
  const center: ViewStyle = { alignItems: 'center', justifyContent: 'center', gap: t.space.s3 }
  const centerScreen: ViewStyle = { ...t.layout.flow.narrow, ...center }
  const wideCenterScreen: ViewStyle = { ...t.layout.flow.wide, ...center }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    textAlign: 'center',
  }
  const help: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
    textAlign: 'center',
  }
  return { centerScreen, wideCenterScreen, heading, help }
}

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
  readonly retryLabel?: string
  readonly onRetry?: () => void
  /** testID of the heading; defaults to `fehler-zustand`. */
  readonly testID?: string
}

export function ErrorState({ bp, heading, message, retryLabel, onRetry, testID = 'fehler-zustand' }: ErrorStateProps) {
  const t = useTheme()
  const styles = useScreenStateStyles(t)
  return (
    <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
      <Text style={styles.heading} accessibilityRole="alert" testID={testID}>
        {heading}
      </Text>
      <Text style={styles.help}>{message}</Text>
      {retryLabel !== undefined && onRetry !== undefined ? <Button onPress={onRetry} testID="fehler-erneut-versuchen">{retryLabel}</Button> : null}
    </View>
  )
}

/**
 * A query failed (WEB-28): the shared wording for why, and a retry. Never an empty or default form in its
 * place — that is what let a save overwrite stored data with blanks.
 */
export function LoadFailedState({
  bp,
  error,
  onRetry,
  testID,
}: ScreenStateProps & { readonly error: unknown; readonly onRetry: () => void; readonly testID?: string }) {
  const { t: tr } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
  return (
    <ErrorState
      bp={bp}
      heading={tr('apiFehler.loadHeading')}
      message={failureMessage(error)}
      retryLabel={tr('apiFehler.retry')}
      onRetry={onRetry}
      {...(testID !== undefined ? { testID } : {})}
    />
  )
}

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
