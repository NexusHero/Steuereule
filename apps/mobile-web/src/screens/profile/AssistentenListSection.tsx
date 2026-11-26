import { useState } from 'react'
import { ActivityIndicator, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Feld, Pill, useTheme, type UiTheme } from '@steuereule/ui'
import {
  useAssistantsControllerListConnected,
  useAssistantsControllerRevoke,
} from '@steuereule/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { useApiBaseUrl } from '../../auth/AuthClientProvider'
import { APP_NS } from '../../i18n/resources'
import { useConfirmAction } from '../../confirm/useConfirmAction'
import { formatRequestedAt } from '../device/deviceContext'
import { useApiFailureMessage } from '../../net/apiFailure'
import { AssistantConnectForm, MCP_PATH } from './AssistantConnectForm'

/** The consent screen's label of each scope; a scope it does not know is shown as is. */
const SCOPE_LABELS: Readonly<Record<string, string>> = {
  'steuerdaten:read': 'oauthConsent.scopeSteuerdatenRead',
  'steuerdaten:write': 'oauthConsent.scopeSteuerdatenWrite',
  'belege:write': 'oauthConsent.scopeBelegeWrite',
  'zahllink:write': 'oauthConsent.scopeZahllinkWrite',
  'zahllink:read': 'oauthConsent.scopeZahllinkRead',
  'offline_access': 'oauthConsent.scopeOfflineAccess',
}

export function AssistantsListSection() {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const queryClient = useQueryClient()
  const apiBaseUrl = useApiBaseUrl()

  const listQuery = useAssistantsControllerListConnected()
  const revokeMutation = useAssistantsControllerRevoke()

  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const failureMessage = useApiFailureMessage()
  const confirmRevoke = useConfirmAction('assistantRevoke')

  function handleRevoke(clientId: string) {
    setRevokeError(null)
    setRevokingId(clientId)
    revokeMutation.mutate(
      { clientId },
      {
        onSuccess: async () => {
          setRevokingId(null)
          await queryClient.invalidateQueries({ queryKey: ['/v1/assistenten'] })
        },
        // WEB-49 / NR-04: a refused or failed "Trennen" says so (in the shared wording) and the list reloads, so
        // a still-connected assistant never looks disconnected.
        onError: async (error) => {
          setRevokingId(null)
          setRevokeError(failureMessage(error, { server: tr('profil.assistenten.revokeError'), unknown: tr('profil.assistenten.revokeError') }))
          await queryClient.invalidateQueries({ queryKey: ['/v1/assistenten'] })
        },
      },
    )
  }

  if (listQuery.isPending) {
    return (
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{tr('profil.assistenten.heading')}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={t.color.tinte} accessibilityLabel={tr('profil.assistenten.loading')} />
          <Text style={styles.help}>{tr('profil.assistenten.loading')}</Text>
        </View>
      </Card>
    )
  }

  // WEB-49 / NR-04: a failed load is never "Keine Assistenten verbunden" — an assistant may well have access.
  if (listQuery.isError) {
    return (
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{tr('profil.assistenten.heading')}</Text>
        <Text style={styles.revokeErrorText} accessibilityRole="alert" testID="assistenten-ladefehler">
          {failureMessage(listQuery.error)}
        </Text>
        <Button variant="ghost" onPress={() => void listQuery.refetch()} testID="assistenten-erneut-laden">
          {tr('apiFehler.retry')}
        </Button>
      </Card>
    )
  }

  const assistants = listQuery.data.data

  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{tr('profil.assistenten.heading')}</Text>
      <Text style={styles.help}>{tr('profil.assistenten.subheading')}</Text>

      {/* The address an assistant connects to, without first creating an access by hand (MCP-11). */}
      <Text style={styles.help}>{tr('profil.assistenten.serverAdresseHinweis')}</Text>
      <Text style={styles.code} selectable testID="assistenten-server-adresse">{`${apiBaseUrl}${MCP_PATH}`}</Text>

      {revokeError !== null ? (
        <Text style={styles.revokeErrorText} accessibilityRole="alert">
          {revokeError}
        </Text>
      ) : null}

      {assistants.map((assistant) => {
        const connectedSince = formatRequestedAt(assistant.linkedSince, i18n.language)
        const lastActive = assistant.lastUsed
          ? formatRequestedAt(assistant.lastUsed, i18n.language)
          : tr('profil.assistenten.neverActive')
        const isRevoking = revokingId === assistant.clientId && revokeMutation.isPending
        // Rights and destination tell two assistants of the same name apart (MCP-8).
        const granted = (assistant.scopes ?? []).filter((scope) => scope !== 'openid')
        const destinations = assistant.destinations ?? []

        return (
          <View key={assistant.clientId} style={styles.assistantRow}>
            <View style={styles.assistantInfo}>
              <Text style={styles.assistantName}>{assistant.name}</Text>
              <Feld label={tr('profil.assistenten.connectedSince')}>
                <Text style={styles.valueText}>{connectedSince ?? assistant.linkedSince}</Text>
              </Feld>
              <Feld label={tr('profil.assistenten.lastActive')}>
                <Pill>{lastActive ?? assistant.lastUsed ?? tr('profil.assistenten.neverActive')}</Pill>
              </Feld>
              <Feld label={tr('profil.assistenten.ziel')}>
                <Text style={styles.valueText} testID={`assistent-ziel-${assistant.clientId}`}>
                  {destinations.length > 0 ? destinations.join(', ') : tr('profil.assistenten.zielUnbekannt')}
                </Text>
              </Feld>
              <Feld label={tr('profil.assistenten.rechte')}>
                <Text style={styles.valueText} testID={`assistent-rechte-${assistant.clientId}`}>
                  {granted.length > 0 ? granted.map((scope) => (SCOPE_LABELS[scope] ? tr(SCOPE_LABELS[scope]) : scope)).join(' · ') : tr('profil.assistenten.keineRechte')}
                </Text>
              </Feld>
            </View>

            {isRevoking ? (
              <Button disabled style={styles.revokeButton}>
                {tr('profil.assistenten.revoking')}
              </Button>
            ) : (
              <Chip onPress={() => confirmRevoke.ask(() => handleRevoke(assistant.clientId), { name: assistant.name })} testID={`assistent-widerrufen-${assistant.clientId}`}>{tr('profil.assistenten.revoke')}</Chip>
            )}
          </View>
        )
      })}

      {assistants.length === 0 ? (
        <Text style={styles.emptyText}>{tr('profil.assistenten.empty')}</Text>
      ) : null}

      {connecting ? (
        <AssistantConnectForm />
      ) : (
        <Button variant="ghost" onPress={() => setConnecting(true)} testID="assistent-verbinden">
          {tr('profil.assistenten.verbinden.oeffnen')}
        </Button>
      )}
      {confirmRevoke.dialog}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4 }
  const sectionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const help: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginBottom: t.space.s4,
  }
  const loadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const assistantRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: t.space.s3,
    borderTopWidth: 1,
    borderTopColor: t.color.linieWeich,
    gap: t.space.s4,
  }
  const assistantInfo: ViewStyle = { flex: 1, gap: t.space.s2 }
  const assistantName: TextStyle = {
    ...t.type.button,
    color: t.color.tinte,
  }
  const valueText: TextStyle = {
    ...t.type.small,
    color: t.color.tinte,
  }
  const revokeButton: ViewStyle = { flexShrink: 0 }
  const code: TextStyle = { ...t.type.small, color: t.color.tinte, fontFamily: 'monospace', marginBottom: t.space.s4 }
  const revokeErrorText: TextStyle = {
    ...t.type.small,
    color: t.color.fehler,
    marginBottom: t.space.s2,
  }
  const emptyText: TextStyle = {
    ...t.type.body,
    color: t.color.tinte2,
    fontStyle: 'italic',
  }

  return {
    card,
    sectionTitle,
    help,
    loadingRow,
    assistantRow,
    assistantInfo,
    assistantName,
    valueText,
    revokeButton,
    code,
    revokeErrorText,
    emptyText,
  }
}
