import { useState } from 'react'
import { ActivityIndicator, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Feld, Pill, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { parseUserAgent, formatRequestedAt } from './deviceContext'
import { useDeviceSessions, type DeviceSessionRow } from './useDeviceSessions'
import { reasonOf } from '../../net/failure-reason'

export interface DeviceListSectionProps {
  readonly onCurrentSessionRevoked: () => void
}

export function DeviceListSection({ onCurrentSessionRevoked }: DeviceListSectionProps) {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { sessionsQuery, revokeMutation } = useDeviceSessions()
  const [revokingToken, setRevokingToken] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  function revoke(session: DeviceSessionRow) {
    setRevokeError(null)
    setRevokingToken(session.token)
    revokeMutation.mutate(session.token, {
      onSuccess: () => {
        setRevokingToken(null)
        if (session.isCurrent) {
          onCurrentSessionRevoked()
        }
      },
      onError: () => {
        setRevokingToken(null)
        setRevokeError(tr('profil.devices.revokeError'))
      },
    })
  }

  if (sessionsQuery.isPending) {
    return (
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{tr('profil.devices.heading')}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={t.color.tinte} accessibilityLabel={tr('profil.devices.loading')} />
          <Text style={styles.help}>{tr('profil.devices.loading')}</Text>
        </View>
      </Card>
    )
  }

  if (sessionsQuery.isError || !sessionsQuery.data) {
    return (
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{tr('profil.devices.heading')}</Text>
        <Text style={styles.help} accessibilityRole="alert">
          {tr(`profil.devices.loadError.${reasonOf(sessionsQuery.error)}`)}
        </Text>
      </Card>
    )
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{tr('profil.devices.heading')}</Text>
      {revokeError !== null ? (
        <Text style={styles.revokeErrorText} accessibilityRole="alert">
          {revokeError}
        </Text>
      ) : null}
      {sessionsQuery.data.map((session) => {
        const { browser, os } = parseUserAgent(session.userAgent)
        const lastActive = formatRequestedAt(session.updatedAt, i18n.language)
        const isRevoking = revokingToken === session.token && revokeMutation.isPending
        return (
          <View key={session.token} style={styles.deviceRow}>
            <View style={styles.deviceInfo}>
              <Feld label={tr('profil.devices.browser')}>
                <Text style={styles.deviceValue}>{browser ?? tr('profil.devices.unknownBrowser')}</Text>
              </Feld>
              <Feld label={tr('profil.devices.os')}>
                <Text style={styles.deviceValue}>{os ?? tr('profil.devices.unknownOs')}</Text>
              </Feld>
              <Feld label={tr('profil.devices.lastActive')}>
                <Pill>{lastActive ?? tr('profil.devices.unknownTime')}</Pill>
              </Feld>
              {session.isCurrent ? <Text style={styles.currentBadge}>{tr('profil.devices.currentDevice')}</Text> : null}
            </View>
            {isRevoking ? (
              <Button disabled style={styles.revokeButton}>
                {tr('profil.devices.revoking')}
              </Button>
            ) : (
              <Chip onPress={() => revoke(session)} testID={session.isCurrent ? 'geraet-abmelden-aktuell' : 'geraet-abmelden'}>{tr('profil.devices.signOut')}</Chip>
            )}
          </View>
        )
      })}
      {sessionsQuery.data.length === 0 ? <Text style={styles.help}>{tr('profil.devices.empty')}</Text> : null}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { marginTop: t.space.s4 }
  const sectionTitle: TextStyle = {
    ...t.type.emphasis,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const loadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2 }
  const revokeErrorText: TextStyle = { ...t.type.small, color: t.color.fehler, marginBottom: t.space.s2 }
  const deviceRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space.s3,
    paddingVertical: t.space.s3,
    borderTopWidth: 1,
    borderTopColor: t.color.linieWeich,
  }
  const deviceInfo: ViewStyle = { flex: 1, minWidth: 0 }
  const deviceValue: TextStyle = { ...t.type.body, color: t.color.tinte }
  const currentBadge: TextStyle = { ...t.type.captionStrong, color: t.color.funkeTinte, marginTop: t.space.s1 }
  const revokeButton: ViewStyle = { flexShrink: 0 }

  return { card, sectionTitle, loadingRow, help, revokeErrorText, deviceRow, deviceInfo, deviceValue, currentBadge, revokeButton }
}
