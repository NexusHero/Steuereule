import { useEffect, useRef } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, hapticSuccess, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useChSalaryCertificateControllerGet, useCommuteControllerGet, useLstbControllerGetLstb, usePensionControllerGet } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import type { PartnerAreaParam } from '../../navigation/routes'
import { tileById, type TileStatus } from './tiles'

export interface CockpitPartnerSectionProps {
  readonly year: number
  readonly partnerName: string
  readonly enabled: boolean
  /** A Grenzgänger household: the partner gets a Swiss certificate of their own (escalation case). */
  readonly crossBorder?: boolean
  /** What the interview says Person B does (ADR-0088); unanswered shows the employee's fields as before. */
  readonly partnerJob?: string | undefined
  readonly onOpenPartner: (area: PartnerAreaParam, name: string) => void
}

export function CockpitPartnerSection({ year, partnerName, enabled, crossBorder = false, partnerJob, onOpenPartner }: CockpitPartnerSectionProps) {
  const employed = partnerJob === undefined || partnerJob === 'Angestellt'
  const retired = partnerJob === 'Rente'
  // A partner who works only in Switzerland has a Lohnausweis, no German LStB (UX review H7); while the
  // interview has not said so, both stay on offer as before.
  const germanCertificate = employed && !(crossBorder && partnerJob !== undefined)
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const lstb = useLstbControllerGetLstb(year, { person: 'B' }, { query: { enabled: enabled && germanCertificate } })
  const commute = useCommuteControllerGet(year, { person: 'B' }, { query: { enabled: enabled && employed } })
  const swiss = useChSalaryCertificateControllerGet(year, { person: 'B' }, { query: { enabled: enabled && employed && crossBorder } })
  const pension = usePensionControllerGet(year, { person: 'B' }, { query: { enabled: enabled && retired } })

  const lstbData = lstb.data?.status === 200 ? lstb.data.data : null
  const commuteData = commute.data?.status === 200 ? commute.data.data : null

  const lstbStatus = tileById('lstb').status({ path: 'angestellte', answers: {}, lstb: lstbData })
  const commuteStatus = tileById('arbeitsweg').status({ path: 'angestellte', answers: {}, commute: commuteData })
  const swissStatus = tileById('ch').status({ path: 'ch', answers: {}, ch: swiss.data?.status === 200 ? swiss.data.data : null })
  const pensionStatus = tileById('rente').status({ path: 'rente', answers: {}, pension: pension.data?.status === 200 ? pension.data.data : null })
  const lstbPending = enabled && germanCertificate && lstb.isPending
  const commutePending = enabled && commute.isPending
  const prevStatusesRef = useRef<{ year: number; lstb?: TileStatus; commute?: TileStatus }>({ year })

  useEffect(() => {
    if (prevStatusesRef.current.year !== year) {
      prevStatusesRef.current = { year }
    }
    const prev = prevStatusesRef.current
    let newlyCompleted = false
    if (!lstbPending) {
      if (prev.lstb !== undefined && prev.lstb !== 'erledigt' && lstbStatus === 'erledigt') {
        newlyCompleted = true
      }
      prev.lstb = lstbStatus
    }
    if (!commutePending) {
      if (prev.commute !== undefined && prev.commute !== 'erledigt' && commuteStatus === 'erledigt') {
        newlyCompleted = true
      }
      prev.commute = commuteStatus
    }
    if (newlyCompleted) {
      void hapticSuccess()
    }
  }, [year, lstbPending, commutePending, lstbStatus, commuteStatus])

  const items: readonly { readonly area: PartnerAreaParam; readonly testId: string; readonly titleKey: string; readonly status: TileStatus }[] = [
    ...(germanCertificate ? [{ area: 'lstb' as const, testId: 'partner-lstb', titleKey: 'cockpit.kachel.partner-lstb.titel', status: lstbStatus }] : []),
    ...(employed ? [{ area: 'arbeitsweg' as const, testId: 'partner-arbeitsweg', titleKey: 'cockpit.kachel.partner-arbeitsweg.titel', status: commuteStatus }] : []),
    ...(employed && crossBorder ? [{ area: 'schweiz' as const, testId: 'partner-schweiz', titleKey: 'cockpit.kachel.partner-schweiz.titel', status: swissStatus }] : []),
    ...(retired ? [{ area: 'rente' as const, testId: 'partner-rente', titleKey: 'cockpit.kachel.partner-rente.titel', status: pensionStatus }] : []),
  ]
  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={styles.heading} testID="cockpit-bereich-partner">
        {tr('cockpit.bereich.partner', { name: partnerName })}
      </Text>
      <View style={styles.grid}>
        {items.map((item) => (
          <Pressable
            key={item.area}
            accessibilityRole="button"
            onPress={() => onOpenPartner(item.area, partnerName)}
            style={bp === 's' ? styles.tileWrapNarrow : styles.tileWrapWide}
            testID={item.testId}
          >
            <Card variant="default" style={styles.card}>
              <Text style={styles.title}>{tr(item.titleKey)}</Text>
              <Text style={styles.formular} testID={`${item.testId}-formular`}>
                {tr(item.titleKey.replace(/\.titel$/, '.formular'))}
              </Text>
              <Text style={item.status === 'erledigt' ? styles.statusDone : styles.statusOpen} testID={`${item.testId}-status`}>
                {tr(item.status === 'erledigt' ? 'cockpit.kachel.status.erledigt' : 'cockpit.kachel.status.offen')}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const section: ViewStyle = {
    width: '100%',
    gap: t.space.s2,
  }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
  }
  const grid: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s3,
    width: '100%',
  }
  const tileWrapNarrow: ViewStyle = { width: '100%' }
  const tileWrapWide: ViewStyle = { flexBasis: 260, flexGrow: 1 }
  // Tiles sit flat on the ground — the screen's one hard shadow belongs to its primary action.
  const card: ViewStyle = {
    marginBottom: 0,
    borderWidth: t.space.kontur,
    // tinte-2 (6:1) keeps a tappable tile recognisable — linie-weich is only ~1.3:1 (WCAG 1.4.11).
    borderColor: t.color.tinte2,
  }
  const title: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const formular: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.tinte2,
    marginBottom: t.space.s2,
  }
  const statusBase: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const statusOpen: TextStyle = { ...statusBase, color: t.color.tinte2 }
  const statusDone: TextStyle = { ...statusBase, color: t.color.ok }

  return { section, heading, grid, tileWrapNarrow, tileWrapWide, card, title, formular, statusOpen, statusDone }
}
