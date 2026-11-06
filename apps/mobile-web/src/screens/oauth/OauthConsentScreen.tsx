import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme, type UiTheme } from '@steuereule/ui'
import { useAssistantsControllerGetClientInfo, getApiClientBaseUrl } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'

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

  const clientName = clientInfoQuery.data?.status === 200
    ? clientInfoQuery.data.data.name
    : params.clientId || 'KI-Assistent'

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

      if (!response.ok) {
        throw new Error(`Consent endpoint returned ${response.status}`)
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
            {scopes.length === 0 ? (
              <Text style={styles.scopeItem}>✓ {tr('oauthConsent.scopeSteuerdatenRead')}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningHeading}>{tr('oauthConsent.drittlandHeading')}</Text>
          <Text style={styles.warningBody}>{tr('oauthConsent.drittlandNotice')}</Text>
        </View>

        {errorMessage ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {errorMessage}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <Button
            variant="primaer"
            disabled={submitting}
            onPress={() => void handleDecision(true)}
            style={styles.actionBtn}
          >
            {submitting ? tr('oauthConsent.processing') : tr('oauthConsent.allow')}
          </Button>

          <Button
            variant="ghost"
            disabled={submitting}
            onPress={() => void handleDecision(false)}
            style={styles.actionBtn}
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
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
  }
  const loadingRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
  }
  const help: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
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
    fontFamily: t.font.text,
    fontSize: t.size.m,
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
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const scopeList: ViewStyle = {
    gap: t.space.s1,
  }
  const scopeItem: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
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
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte,
    fontWeight: t.weight.schwer,
  }
  const warningBody: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.xs,
    color: t.color.tinte,
    lineHeight: 18,
  }
  const errorText: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
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
