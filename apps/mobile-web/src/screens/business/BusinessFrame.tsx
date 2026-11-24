import { createContext, useContext, type ReactNode } from 'react'
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { classifyApiFailure } from '../../net/apiFailure'
import { BackButton } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { useProblemText, type ApiProblem } from './businessKit'

/** The way to an account when the API answers ACCOUNT_REQUIRED (a session lost to a guest one, WEB-44). */
export interface BusinessAccountActions {
  readonly onSignIn?: () => void
  readonly onCreateAccount?: () => void
}

export const BusinessAccountContext = createContext<BusinessAccountActions>({})

function needsAccount(problem: ApiProblem): boolean {
  return problem.error !== null && classifyApiFailure(problem.error).kind === 'account-required'
}

/** Sign in or create an account, when the failure says an account is needed and the route offers the way. */
function AccountButtons({ problem }: { readonly problem: ApiProblem }) {
  const { t: tr } = useTranslation(APP_NS)
  const t = useTheme()
  const { onSignIn, onCreateAccount } = useContext(BusinessAccountContext)
  if (!needsAccount(problem) || (onSignIn === undefined && onCreateAccount === undefined)) return null
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginVertical: t.space.s2 }}>
      {onSignIn !== undefined ? (
        <Button onPress={onSignIn} testID="business-anmelden">
          {tr('apiFehler.signIn')}
        </Button>
      ) : null}
      {onCreateAccount !== undefined ? (
        <Button variant="ghost" onPress={onCreateAccount} testID="business-konto-anlegen">
          {tr('apiFehler.createAccount')}
        </Button>
      ) : null}
    </View>
  )
}

/** A refused write or a failed secondary read, in the shared wording (never the raw server text, WEB-44). */
export function ProblemNote({ problem, testID }: { readonly problem: ApiProblem | null; readonly testID?: string }) {
  const text = useProblemText()
  if (problem === null) return null
  return (
    <>
      <Note tone="error" {...(testID !== undefined ? { testID } : {})}>
        {text(problem)}
      </Note>
      <AccountButtons problem={problem} />
    </>
  )
}

/** The frame every page of the self-employed area shares: back button, title, one calm column. */
export function BusinessFrame({ title, onBack, testID, children }: { readonly title: string; readonly onBack: () => void; readonly testID?: string; readonly children: ReactNode }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wide} testID="screen-container">
      <View style={styles.header}>
        <BackButton accessibilityLabel={tr('business.zurueck')} onPress={onBack} testID="business-zurueck" />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View testID={testID}>{children}</View>
    </ScrollView>
  )
}

/** Loading and failure of a page's first read: the 403 of the switch is named, not hidden; a lost account leads to the sign-in. */
export function BusinessQueryState({ pending, problem, onRetry }: { readonly pending: boolean; readonly problem: ApiProblem | null; readonly onRetry: () => void }) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const text = useProblemText()
  const account = useContext(BusinessAccountContext)
  if (pending) return <LoadingState bp={bp} label={tr('business.laden')} />
  if (problem === null) return null
  const forbidden = problem.status === 403
  return (
    <>
      <ErrorState
        bp={bp}
        heading={forbidden ? tr('business.gesperrt.titel') : tr('business.ladefehler.titel')}
        message={forbidden ? tr('business.gesperrt.text') : text(problem)}
        {...(forbidden || (needsAccount(problem) && account.onSignIn !== undefined) ? {} : { retryLabel: tr('business.ladefehler.nochmal'), onRetry })}
        testID="business-fehler"
      />
      <AccountButtons problem={problem} />
    </>
  )
}

export function Section({ title, children, testID }: { readonly title?: string; readonly children: ReactNode; readonly testID?: string }) {
  const t = useTheme()
  return (
    <Card style={{ marginBottom: t.space.s4 }} {...(testID ? { testID } : {})}>
      {title ? <Text style={{ ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s2 }}>{title}</Text> : null}
      {children}
    </Card>
  )
}

/** A label with a signed amount on the right: the plain way every figure of the area is shown. */
export function Figure({ label, value, strong = false, testID }: { readonly label: string; readonly value: string; readonly strong?: boolean; readonly testID?: string }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.s3, paddingVertical: t.space.s1 }}>
      <Text style={{ ...t.type.body, color: t.color.tinte, flexShrink: 1 }}>{label}</Text>
      <Text style={{ ...(strong ? t.type.figureStrong : t.type.figure), color: t.color.tinte, fontVariant: ['tabular-nums'] }} {...(testID ? { testID } : {})}>
        {value}
      </Text>
    </View>
  )
}

export function Note({ children, tone = 'plain', testID }: { readonly children: ReactNode; readonly tone?: 'plain' | 'warn' | 'error'; readonly testID?: string }) {
  const t = useTheme()
  const color = tone === 'error' ? t.color.fehler : tone === 'warn' ? t.color.warn : t.color.tinte2
  return (
    <Text style={{ ...t.type.small, color, marginVertical: t.space.s2 }} accessibilityRole={tone === 'error' ? 'alert' : 'text'} {...(testID ? { testID } : {})}>
      {children}
    </Text>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wide: ViewStyle = t.layout.flow.wide
  const header: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginBottom: t.space.s4 }
  const title: TextStyle = { ...t.type.title, color: t.color.tinte, flex: 1 }
  return { screen, wide, header, title }
}
