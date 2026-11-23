import { useState } from 'react'
import { Pressable, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import type { AnnexConfirmationDto, CockpitStatusDto } from '@steuereule/api-client'
import { useOptionalCopilotBridge } from '../advisor/CopilotBridgeProvider'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CockpitScreen.styles'
import type { Next } from './cockpitTypes'

export function MissingMasterDataNotice({ masterData }: { readonly masterData: Next }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [expanded, setExpanded] = useState(false)
  const missing = masterData.missingFields ?? []

  if (missing.length === 0) {
    return (
      <Button variant="ghost" onPress={masterData.onPress} style={styles.secondaryCta} testID="cockpit-stammdaten">
        {masterData.label}
      </Button>
    )
  }

  return (
    <View style={styles.missingBox} testID="cockpit-stammdaten-box">
      <Button variant="ghost" onPress={masterData.onPress} testID="cockpit-stammdaten">
        {masterData.label}
      </Button>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={styles.missingToggleRow}
        testID="cockpit-stammdaten-details-toggle"
      >
        <Text style={styles.missingToggleText}>
          {`⚠️ ${tr('cockpit.stammdatenFehlendToggle', { anzahl: missing.length })} ${expanded ? '▴' : '▾'}`}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.missingChipRow} testID="cockpit-stammdaten-missing-list">
          {missing.map((field) => (
            <Pressable
              key={field}
              accessibilityRole="button"
              onPress={masterData.onPress}
              style={styles.missingChip}
              testID={`cockpit-stammdaten-missing-${field}`}
            >
              <Text style={styles.missingChipText}>{tr(`stammdaten.${field}`, field)} →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function EuleBannerNotice() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const bridge = useOptionalCopilotBridge()
  const banner = bridge?.cockpitBanner
  if (!bridge || !banner) return null

  const provenance = bridge.bestTileProvenance(banner.screens)
  const provenanceLabel =
    provenance === 'beleg+eule'
      ? tr('cockpit.euleBanner.provenanceReceiptOwl', '📎 Beleg + Eule')
      : provenance === 'eule'
        ? tr('cockpit.euleBanner.provenanceOwl', '🦉 Von Eule')
        : provenance === 'nutzer'
          ? tr('cockpit.euleBanner.provenanceUser', '✓ Selbst eingetragen')
          : null

  return (
    <Card variant="ai" style={styles.euleBannerCard} testID="cockpit-eule-banner">
      <View style={styles.euleBannerRow}>
        <View style={styles.euleBannerCopy}>
          <Text style={styles.euleBannerTitle}>
            {tr('cockpit.euleBanner.applied', { count: banner.appliedCount })}
          </Text>
          {banner.lastDeltaEur > 0 ? (
            <Text style={styles.euleBannerEffect}>
              {tr('cockpit.euleBanner.effect', { betrag: formatEuro(banner.lastDeltaEur) })}
            </Text>
          ) : null}
          {provenanceLabel ? (
            <Text style={styles.euleBannerProvenance} testID="cockpit-provenance-chip">
              {provenanceLabel}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => bridge.dismissCockpitBanner()}
          style={styles.euleBannerDismissBtn}
          testID="cockpit-eule-banner-dismiss"
        >
          <Text style={styles.euleBannerDismissText}>{tr('cockpit.euleBanner.dismiss', '✕ Schließen')}</Text>
        </Pressable>
      </View>
    </Card>
  )
}

interface ConfirmationNoticeProps {
  readonly annexes: readonly AnnexConfirmationDto[] | null
  /** Open tasks the user's assistant left (#547); the confirmation screen lists them. */
  readonly taskCount: number
  readonly status: CockpitStatusDto
  readonly onOpenConfirmation?: () => void
}

export function ConfirmationNotice({ annexes, taskCount, status, onOpenConfirmation }: ConfirmationNoticeProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const open = (annexes ?? []).filter((a) => a.unconfirmed > 0)
  if (open.length === 0 && taskCount === 0) return null
  const sum = status.kind === 'spanne' ? (status.unconfirmedSum ?? 0) : 0

  return (
    <Card variant="default" testID="bestaetigung-hinweis">
      {open.length > 0 ? (
        <Text style={styles.help}>
          {sum > 0 ? tr('cockpit.bestaetigung.hinweis', { count: open.reduce((n, a) => n + a.unconfirmed, 0), summe: formatEuro(sum) }) : tr('cockpit.bestaetigung.hinweisOhneSumme')}
        </Text>
      ) : null}
      {open.map((a) => (
        <View key={a.annex} style={styles.uebernahmeZeile}>
          <Text style={styles.uebernahmeZeileText}>
            {tr('cockpit.bestaetigung.anlage', {
              anlage: tr(`bestaetigung.anlagen.${a.annex}`),
              anzahl: tr('bestaetigung.unbestaetigt', { count: a.unconfirmed }),
            })}
          </Text>
        </View>
      ))}
      {taskCount > 0 ? (
        <View style={styles.uebernahmeZeile} testID="bestaetigung-aufgaben">
          <Text style={styles.uebernahmeZeileText}>{tr('cockpit.bestaetigung.aufgaben', { count: taskCount })}</Text>
        </View>
      ) : null}
      {onOpenConfirmation ? (
        <Button variant="ghost" onPress={onOpenConfirmation} testID="bestaetigung-oeffnen">
          {open.length > 0 ? tr('cockpit.bestaetigung.pruefen') : tr('cockpit.bestaetigung.aufgabenAnsehen')}
        </Button>
      ) : null}
    </Card>
  )
}
