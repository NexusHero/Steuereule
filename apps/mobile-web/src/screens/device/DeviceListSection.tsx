// The device list (#238, "Revocation — a device list in Profil"): every session on the
// account — password-based and QR-authorized alike, not just the ones this slice's QR flow
// created — each with an honest "Abmelden" (revoke). Derived entirely from ProfilScreen.tsx:18's
// own Card + Feld + Pill composition, the same one GeraetefreigabeScreen's context block uses —
// no new packages/ui/src/components/ addition.
//
// No region column. Musti's ADR-0021 control test proved the only deployment-config candidate
// for a trustworthy client IP still returns a spoofable address for a single-value header — the
// fix removes the trust check rather than replacing it, so `Session.region` was never built.
// Fail-closed: this list shows Browser, Betriebssystem, and letzte Aktivität only — see the
// comment at the bottom of `deviceRow` below for exactly where a region row would have gone and
// why it doesn't exist, so nobody adds it back "for completeness" without re-reading why it's
// missing. The approval screen's own region is unaffected — see useDeviceSessions.ts's header.
import { useState } from 'react'
import { ActivityIndicator, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Feld, Pill, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { parseUserAgent, formatRequestedAt } from './deviceContext'
import { useDeviceSessions, type DeviceSessionRow } from './useDeviceSessions'
import { reasonOf } from '../../net/failure-reason'

export interface DeviceListSectionProps {
  /** Fires once the session the app is *currently* running under is the one just revoked —
   *  ProfilScreen must react like any other sign-out (ADR-0013's own Slice-1-retro lesson:
   *  never leave a screen rendered for a session that no longer exists). */
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
          {/* #306 — the copy follows what the failure actually established, never a default
              guess. `reasonOf` returns 'unknown' for anything that reached us without a reason,
              and the 'unknown' string deliberately names no cause at all. */}
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
              {/* No region row here — see this file's header comment. A region field, even one
                  rendering "Region unbekannt", would imply Session tracks a region column it
                  doesn't; the honest state is no field at all, not an always-unknown one. */}
              {session.isCurrent ? <Text style={styles.currentBadge}>{tr('profil.devices.currentDevice')}</Text> : null}
            </View>
            {isRevoking ? (
              <Button disabled style={styles.revokeButton}>
                {tr('profil.devices.revoking')}
              </Button>
            ) : (
              <Chip onPress={() => revoke(session)}>{tr('profil.devices.signOut')}</Chip>
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
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const loadingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m }
  const revokeErrorText: TextStyle = { color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s2 }
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
  const deviceValue: TextStyle = { fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte }
  const currentBadge: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.xs, color: t.color.funkeTinte, marginTop: t.space.s1 }
  const revokeButton: ViewStyle = { flexShrink: 0 }

  return { card, sectionTitle, loadingRow, help, revokeErrorText, deviceRow, deviceInfo, deviceValue, currentBadge, revokeButton }
}
