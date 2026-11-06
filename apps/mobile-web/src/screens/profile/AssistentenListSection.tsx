import { useState } from 'react'
import { ActivityIndicator, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Feld, Pill, useTheme, type UiTheme } from '@steuereule/ui'
import {
  useAssistantsControllerListConnected,
  useAssistantsControllerRevoke,
} from '@steuereule/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { APP_NS } from '../../i18n/resources'
import { formatRequestedAt } from '../device/deviceContext'

export function AssistantsListSection() {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const queryClient = useQueryClient()

  const listQuery = useAssistantsControllerListConnected()
  const revokeMutation = useAssistantsControllerRevoke()

  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

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
        onError: () => {
          setRevokingId(null)
          setRevokeError(tr('profil.assistenten.revokeError'))
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

  const assistants = listQuery.data?.status === 200 ? listQuery.data.data : []

  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{tr('profil.assistenten.heading')}</Text>
      <Text style={styles.help}>{tr('profil.assistenten.subheading')}</Text>

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
            </View>

            {isRevoking ? (
              <Button disabled style={styles.revokeButton}>
                {tr('profil.assistenten.revoking')}
              </Button>
            ) : (
              <Chip onPress={() => handleRevoke(assistant.clientId)}>{tr('profil.assistenten.revoke')}</Chip>
            )}
          </View>
        )
      })}

      {assistants.length === 0 ? (
        <Text style={styles.emptyText}>{tr('profil.assistenten.empty')}</Text>
      ) : null}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4 }
  const sectionTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const help: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
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
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const valueText: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.s,
    color: t.color.tinte,
  }
  const revokeButton: ViewStyle = { flexShrink: 0 }
  const revokeErrorText: TextStyle = {
    color: t.color.fehler,
    fontFamily: t.font.text,
    fontSize: t.size.s,
    marginBottom: t.space.s2,
  }
  const emptyText: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.m,
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
    revokeErrorText,
    emptyText,
  }
}
