import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Feld, Input, useTheme, type UiTheme } from '@steuereule/ui'
import { ApiError, useAssistantsControllerGetClientInfo, getApiClientBaseUrl } from '@steuereule/api-client'
import { apiFailureMessage } from '../../net/apiFailure'
import { watchForSessionExpiry } from '../../net/sessionExpiry'
import { APP_NS } from '../../i18n/resources'
import { STEP_UP_REQUIRED_CODE } from '../../auth/useStepUp'
import { StepUpChoices } from '../../auth/StepUpOptions'
import { consentDestinations } from './consentDestination'

export interface OauthConsentScreenProps {
  readonly clientId?: string | undefined
  readonly scope?: string | undefined
  readonly oauthQuery?: string | undefined
  readonly onNavigate?: ((url: string) => void) | undefined
}

export function OauthConsentScreen({
  clientId: propClientId,
  scope: propScope,
  oauthQuery: propOauthQuery,
  onNavigate = (url) => window.location.assign(url),
}: OauthConsentScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  const [params, setParams] = useState({
    clientId: propClientId ?? '',
    scope: propScope ?? '',
    oauthQuery: propOauthQuery ?? '',
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location) {
      const search = new URLSearchParams(window.location.search)
      const qClientId = search.get('client_id') ?? ''
      const qScope = search.get('scope') ?? ''
      const fullQuery = window.location.search.startsWith('?')
        ? window.location.search.slice(1)
        : window.location.search

      setParams({
        clientId: propClientId || qClientId,
        scope: propScope || qScope,
        oauthQuery: propOauthQuery || fullQuery,
      })
    }
  }, [propClientId, propScope, propOauthQuery])

  const clientInfoQuery = useAssistantsControllerGetClientInfo(
    { clientId: params.clientId },
    { query: { enabled: Boolean(params.clientId) } },
  )

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Approving an assistant on an older session needs the password again (ADR-0106 D2).
  const [stepUp, setStepUp] = useState<{ readonly error: string } | null>(null)
  const [password, setPassword] = useState('')

  // Only a looked-up client is named; the client_id of the URL is no name to show in bold (MCP-17).
  const clientInfo = clientInfoQuery.data?.data ?? null
  const clientKnown = clientInfo !== null
  const clientName = clientInfo?.name ?? tr('oauthConsent.clientUnknown')
  // Without a client to look up (no client_id), there is nothing to check either: approving stays off.
  const noClientToCheck = !clientKnown && !clientInfoQuery.isLoading && !clientInfoQuery.isFetching && !clientInfoQuery.isError

  // The name is the assistant's own claim; where the approval leads is what it registered (see consentDestination).
  const destinations = clientInfoQuery.data
    ? consentDestinations(clientInfoQuery.data.data.redirectTargets ?? [], params.oauthQuery)
    : []
  // While the lookup runs the destination is not on the screen yet, so approving waits for it: a slow
  // lookup must not let the user approve before seeing where the access goes.
  const lookingUpClient = clientInfoQuery.isLoading
  // MCP-17 (here only the part in this file): a lookup that failed leaves "Erlauben" off — the user would
  // approve without seeing where the access goes.
  const lookupFailed = clientInfoQuery.isError
  const destinationLabel = (destination: string): string => {
    if (destination === 'localhost') return tr('oauthConsent.destinationDevice')
    if (destination.endsWith('://')) return tr('oauthConsent.destinationApp', { scheme: destination })
    return destination
  }

  const scopes = params.scope ? params.scope.split(' ').filter(Boolean) : []

  async function handleDecision(accept: boolean) {
    if (submitting) return
    setSubmitting(true)
    setErrorMessage(null)

    try {
      const baseUrl = getApiClientBaseUrl()
      const response = await fetch(`${baseUrl}/api/auth/oauth2/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
        },
        credentials: 'include',
        body: JSON.stringify({
          accept,
          oauth_query: params.oauthQuery,
        }),
      })

      if (response.status === 403 && accept) {
        const body = (await response.json().catch(() => ({}))) as { code?: string }
        if (body.code === STEP_UP_REQUIRED_CODE) {
          setStepUp({ error: '' })
          setSubmitting(false)
          return
        }
      }
      if (!response.ok) {
        // NR-13: the signed query lapses after 10 minutes (400), the session may have ended (401), or the
        // server throttles (429) — each says what to do instead of "Fehler bei der Autorisierung".
        const refusal = new ApiError(response.status, await response.json().catch(() => null), response.headers)
        watchForSessionExpiry(refusal)
        setErrorMessage(
          apiFailureMessage(refusal, tr, {
            validation: tr('oauthConsent.expired'),
            'not-found': tr('oauthConsent.expired'),
            'account-required': tr('apiFehler.sessionExpired'),
            forbidden: tr('oauthConsent.error'),
            server: tr('oauthConsent.error'),
            unknown: tr('oauthConsent.error'),
          }),
        )
        setSubmitting(false)
        return
      }

      const data = (await response.json()) as { redirect?: boolean; url?: string }
      if (data.url) {
        onNavigate(data.url)
      } else {
        throw new Error('Missing redirect URL in consent response')
      }
    } catch {
      setErrorMessage(tr('oauthConsent.error'))
      setSubmitting(false)
    }
  }

  async function confirmPassword() {
    if (submitting || !password) return
    setSubmitting(true)
    try {
      const response = await fetch(`${getApiClientBaseUrl()}/api/auth/verify-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
        },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      if (!response.ok) {
        setStepUp({ error: tr('oauthConsent.stepUpWrong') })
        setSubmitting(false)
        return
      }
    } catch {
      setStepUp({ error: tr('oauthConsent.error') })
      setSubmitting(false)
      return
    }
    setPassword('')
    setStepUp(null)
    setSubmitting(false)
    await handleDecision(true)
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>{tr('oauthConsent.title')}</Text>

        {clientInfoQuery.isPending && !clientInfoQuery.data ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={t.color.tinte} />
            <Text style={styles.help}>{tr('oauthConsent.loading')}</Text>
          </View>
        ) : null}

        <View style={styles.clientBox}>
          <Text style={styles.clientHeading}>
            <Text style={styles.boldText}>{clientName}</Text> {tr('oauthConsent.requestNotice')}
          </Text>
          {lookingUpClient ? null : (
            <Text style={styles.clientHeading} testID="oauth-destination">
              {tr('oauthConsent.destinationLabel')}{' '}
              <Text style={styles.boldText}>
                {destinations.length > 0 ? destinations.map(destinationLabel).join(', ') : tr('oauthConsent.destinationUnknown')}
              </Text>
            </Text>
          )}
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningHeading}>{tr('oauthConsent.unverifiedHeading')}</Text>
          <Text style={styles.warningBody}>{tr('oauthConsent.unverifiedNotice')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>{tr('oauthConsent.scopesHeading')}</Text>
          <View style={styles.scopeList}>
            {scopes.includes('steuerdaten:read') ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeSteuerdatenRead')}</Text>
            ) : null}
            {scopes.includes('steuerdaten:write') ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeSteuerdatenWrite')}</Text>
            ) : null}
            {scopes.includes('belege:write') ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeBelegeWrite')}</Text>
            ) : null}
            {scopes.includes('zahllink:read') ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeZahllinkRead')}</Text>
            ) : null}
            {scopes.includes('offline_access') ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeOfflineAccess')}</Text>
            ) : null}
            {scopes.includes('zahllink:write') ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeZahllinkWrite')}</Text>
            ) : null}
            {scopes.filter((scope) => scope !== 'openid').length === 0 ? (
              <Text style={styles.scopeItem} testID="oauth-keine-rechte">{tr('oauthConsent.scopeNone')}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningHeading}>{tr('oauthConsent.drittlandHeading')}</Text>
          <Text style={styles.warningBody}>{tr('oauthConsent.drittlandNotice')}</Text>
        </View>

        {lookupFailed ? (
          <View style={styles.section} testID="oauth-lookup-fehler">
            <Text style={styles.errorText} accessibilityRole="alert" testID="oauth-client-unbekannt">
              {tr('oauthConsent.lookupFailed')}
            </Text>
            <Button variant="ghost" onPress={() => void clientInfoQuery.refetch()} testID="oauth-lookup-erneut">
              {tr('apiFehler.retry')}
            </Button>
          </View>
        ) : null}
        {noClientToCheck ? (
          <Text style={styles.errorText} accessibilityRole="alert" testID="oauth-client-unbekannt">
            {tr('oauthConsent.clientLookupFailed')}
          </Text>
        ) : null}

        {errorMessage ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {errorMessage}
          </Text>
        ) : null}

        {stepUp ? (
          <View style={styles.section} testID="oauth-stepup">
            <Text style={styles.sectionHeading}>{tr('oauthConsent.stepUpTitle')}</Text>
            <Text style={styles.help}>{tr('oauthConsent.stepUpBody')}</Text>
            {/* MCP-11: an account without a password confirms with its passkey or provider, without signing out. */}
            <StepUpChoices
              testID="oauth-stepup-ohne-passwort"
              onConfirmed={() => {
                setStepUp(null)
                void handleDecision(true)
              }}
            >
              <Feld label={tr('oauthConsent.stepUpPassword')} error={stepUp.error}>
                <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" testID="oauth-stepup-passwort" onSubmit={() => void confirmPassword()} />
              </Feld>
              <Button variant="primaer" disabled={submitting || !password} onPress={() => void confirmPassword()} testID="oauth-stepup-bestaetigen">
                {submitting ? tr('oauthConsent.processing') : tr('oauthConsent.stepUpConfirm')}
              </Button>
            </StepUpChoices>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Button
            variant="primaer"
            disabled={submitting || lookingUpClient || lookupFailed || !clientKnown}
            onPress={() => void handleDecision(true)}
            style={styles.actionBtn}
            testID="oauth-erlauben"
          >
            {submitting ? tr('oauthConsent.processing') : tr('oauthConsent.allow')}
          </Button>

          <Button
            variant="ghost"
            disabled={submitting}
            onPress={() => void handleDecision(false)}
            style={styles.actionBtn}
            testID="oauth-ablehnen"
          >
            {tr('oauthConsent.deny')}
          </Button>
        </View>
      </Card>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const container: ViewStyle = {
    flexGrow: 1,
    padding: t.space.s4,
    justifyContent: 'center',
    alignItems: 'center',
  }
  const card: ViewStyle = {
    maxWidth: 540,
    width: '100%',
    padding: t.space.s5,
    gap: t.space.s4,
  }
  const title: TextStyle = {
    ...t.type.subhead,
    color: t.color.tinte,
  }
  const loadingRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
  }
  const help: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
  }
  const clientBox: ViewStyle = {
    backgroundColor: t.color.karte,
    padding: t.space.s3,
    borderWidth: 1,
    borderColor: t.color.linieWeich,
    borderRadius: 8,
  }
  const clientHeading: TextStyle = {
    ...t.type.body,
    color: t.color.tinte,
    lineHeight: 22,
  }
  const boldText: TextStyle = {
    fontWeight: t.weight.schwer,
    color: t.color.tinte,
  }
  const section: ViewStyle = {
    gap: t.space.s2,
  }
  const sectionHeading: TextStyle = {
    ...t.type.button,
    color: t.color.tinte,
  }
  const scopeList: ViewStyle = {
    gap: t.space.s1,
  }
  const scopeItem: TextStyle = {
    ...t.type.small,
    color: t.color.tinte,
    lineHeight: 20,
  }
  const warningBox: ViewStyle = {
    backgroundColor: t.color.funkeWeich,
    padding: t.space.s3,
    borderLeftWidth: 4,
    borderLeftColor: t.color.funke,
    gap: t.space.s1,
  }
  const warningHeading: TextStyle = {
    ...t.type.labelStrong,
    color: t.color.tinte,
  }
  const warningBody: TextStyle = {
    ...t.type.caption,
    color: t.color.tinte,
    lineHeight: 18,
  }
  const errorText: TextStyle = {
    ...t.type.small,
    color: t.color.fehler,
  }
  const actionRow: ViewStyle = {
    flexDirection: 'column',
    gap: t.space.s2,
    marginTop: t.space.s2,
  }
  const actionBtn: ViewStyle = {
    width: '100%',
  }

  return {
    container,
    card,
    title,
    loadingRow,
    help,
    clientBox,
    clientHeading,
    boldText,
    section,
    sectionHeading,
    scopeList,
    scopeItem,
    warningBox,
    warningHeading,
    warningBody,
    errorText,
    actionRow,
    actionBtn,
  }
}
