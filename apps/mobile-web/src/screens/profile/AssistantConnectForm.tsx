import { useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Feld, Input, useTheme, type UiTheme } from '@steuereule/ui'
import { useApiBaseUrl, useAuthClient } from '../../auth/AuthClientProvider'
import { APP_NS } from '../../i18n/resources'

/** The assistants whose OAuth redirect address is known; any other one brings its own. */
const PRESETS = {
  claude: { name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'] },
  chatgpt: { name: 'ChatGPT', redirectUris: ['https://chatgpt.com/connector_platform_oauth_redirect'] },
  anderer: { name: '', redirectUris: [] },
} as const
type Kind = keyof typeof PRESETS
const KINDS = Object.keys(PRESETS) as Kind[]

/** The Streamable HTTP endpoint (ADR-0052 amendment 6); `/mcp/sse` stays for older clients but is not offered (MCP-11). */
export const MCP_PATH = '/mcp'
/** https anywhere, plain http only on this machine (RFC 8252 loopback redirect). */
const REDIRECT_PATTERN = /^(https:\/\/[^\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?)$/

interface RegisterSurface {
  $fetch: (path: string, opts: { method: 'POST'; body: unknown }) => Promise<{ data?: { client_id?: string } | null; error: unknown }>
}

export interface AssistantConnectFormProps {
  readonly onCreated?: () => void
}

/**
 * The signed-in user registers the OAuth client of an assistant (ADR-0052 amendment 4): a public client
 * (PKCE, no secret). What comes back, the client id and the MCP address, is what the user pastes into
 * the assistant; the connection itself is still made there, with the consent in this app.
 */
export function AssistantConnectForm({ onCreated }: AssistantConnectFormProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const client = useAuthClient() as unknown as RegisterSurface
  const apiBaseUrl = useApiBaseUrl()

  const [kind, setKind] = useState<Kind | null>(null)
  const [name, setName] = useState('')
  const [redirect, setRedirect] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)

  async function create(chosen: Kind) {
    const preset = PRESETS[chosen]
    const clientName = (chosen === 'anderer' ? name : preset.name).trim()
    const redirectUris = chosen === 'anderer' ? [redirect.trim()] : [...preset.redirectUris]
    if (clientName.length === 0) return setError(tr('profil.assistenten.verbinden.errName'))
    if (!redirectUris.every((uri) => REDIRECT_PATTERN.test(uri))) return setError(tr('profil.assistenten.verbinden.errRedirect'))
    setError(null)
    setBusy(true)
    try {
      const { data, error: failed } = await client.$fetch('/oauth2/register', {
        method: 'POST',
        body: { client_name: clientName, redirect_uris: redirectUris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
      })
      if (failed || !data?.client_id) setError(tr('profil.assistenten.verbinden.errGeneric'))
      else {
        setClientId(data.client_id)
        onCreated?.()
      }
    } catch {
      setError(tr('profil.assistenten.verbinden.errGeneric'))
    } finally {
      setBusy(false)
    }
  }

  if (clientId !== null) {
    return (
      <View style={styles.box} testID="assistent-angelegt">
        <Text style={styles.help}>{tr('profil.assistenten.verbinden.fertig')}</Text>
        <Feld label={tr('profil.assistenten.verbinden.serverAdresse')}>
          <Text style={styles.code} selectable testID="assistent-server-adresse">{`${apiBaseUrl}${MCP_PATH}`}</Text>
        </Feld>
        <Feld label={tr('profil.assistenten.verbinden.clientId')}>
          <Text style={styles.code} selectable testID="assistent-client-id">{clientId}</Text>
        </Feld>
        <Text style={styles.help}>{tr('profil.assistenten.verbinden.fertigHinweis')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.box}>
      <Text style={styles.help}>{tr('profil.assistenten.verbinden.welcher')}</Text>
      <View style={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} onPress={() => { setKind(k); setError(null) }} testID={`assistent-art-${k}`}>
            {tr(`profil.assistenten.verbinden.art.${k}`)}
          </Chip>
        ))}
      </View>
      {kind === 'anderer' ? (
        <>
          <Feld label={tr('profil.assistenten.verbinden.name')}>
            <Input value={name} onChange={setName} testID="assistent-name" />
          </Feld>
          <Feld label={tr('profil.assistenten.verbinden.redirect')}>
            <Input value={redirect} onChange={setRedirect} placeholder="https://…" testID="assistent-redirect" />
          </Feld>
        </>
      ) : null}
      {error !== null ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {kind !== null ? (
        <Button disabled={busy} onPress={() => void create(kind)} testID="assistent-anlegen">
          {busy ? tr('profil.assistenten.verbinden.busy') : tr('profil.assistenten.verbinden.anlegen')}
        </Button>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const box: ViewStyle = { gap: t.space.s3, paddingVertical: t.space.s3, borderTopWidth: 1, borderTopColor: t.color.linieWeich }
  const chips: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const help: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const code: TextStyle = { ...t.type.small, color: t.color.tinte, fontFamily: 'monospace' }
  const error: TextStyle = { ...t.type.small, color: t.color.fehler }
  return { box, chips, help, code, error }
}
