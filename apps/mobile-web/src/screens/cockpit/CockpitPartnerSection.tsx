import { useEffect, useRef } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, hapticSuccess, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useChSalaryCertificateControllerGet, useCommuteControllerGet, useLstbControllerGetLstb, usePensionControllerGet } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import type { PartnerAreaParam } from '../../navigation/routes'
import { hasGermanJobToo, tileById, type TileStatus } from './tiles'
import { tileStyles } from './tileStyles'

export interface CockpitPartnerSectionProps {
  readonly year: number
  readonly partnerName: string
  readonly enabled: boolean
  /** A Grenzgänger household: the partner gets a Swiss certificate of their own (escalation case). */
  readonly crossBorder?: boolean
  /** What the interview says Person B does (ADR-0088); unanswered shows the employee's fields as before. */
  readonly partnerJob?: string | undefined
  /** The basis says B also worked in Germany in the year: B's German certificate is asked too. */
  readonly partnerGermanJob?: boolean
  /** Areas that hold something the estimate still lacks: they do not read „Erledigt“. */
  readonly openAreas?: ReadonlySet<PartnerAreaParam>
  readonly onOpenPartner: (area: PartnerAreaParam, name: string) => void
}

export function CockpitPartnerSection({ year, partnerName, enabled, crossBorder = false, partnerJob, partnerGermanJob = false, openAreas, onOpenPartner }: CockpitPartnerSectionProps) {
  const employed = partnerJob === undefined || partnerJob === 'Angestellt'
  const retired = partnerJob === 'Rente'
  const onlySwiss = crossBorder && partnerJob !== undefined
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const lstb = useLstbControllerGetLstb(year, { person: 'B' }, { query: { enabled: enabled && employed } })
  const commute = useCommuteControllerGet(year, { person: 'B' }, { query: { enabled: enabled && employed } })
  const swiss = useChSalaryCertificateControllerGet(year, { person: 'B' }, { query: { enabled: enabled && employed && crossBorder } })
  const pension = usePensionControllerGet(year, { person: 'B' }, { query: { enabled: enabled && retired } })

  const lstbData = lstb.data?.status === 200 ? lstb.data.data : null
  const commuteData = commute.data?.status === 200 ? commute.data.data : null
  // A partner who works only in Switzerland has a Lohnausweis, no German LStB (UX review H7) — unless the
  // way to work records a change of job or a German certificate is entered (ADR-0079); while the interview
  // has not said so, both stay on offer as before.
  const germanCertificate = employed && (!onlySwiss || partnerGermanJob || hasGermanJobToo(commuteData, lstbData))

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
        {items.map((item) => {
          const isDone = item.status === 'erledigt' && !openAreas?.has(item.area)
          return (
            <Pressable
              key={item.area}
              accessibilityRole="button"
              onPress={() => onOpenPartner(item.area, partnerName)}
              style={bp === 's' ? styles.tileWrapNarrow : styles.tileWrapWide}
              testID={item.testId}
            >
              <Card variant="default" style={[styles.card, isDone ? styles.cardDone : styles.cardActive]}>
                <View style={styles.tileHeaderRow}>
                  <Text style={[styles.title, isDone ? styles.titleDone : null]}>{tr(item.titleKey)}</Text>
                  <View style={isDone ? styles.statusPillDone : styles.statusPillOpen}>
                    <Text style={isDone ? styles.statusDone : styles.statusOpen} accessible={false} importantForAccessibility="no">
                      {isDone ? '✓' : '!'}
                    </Text>
                    <Text style={isDone ? styles.statusDone : styles.statusOpen} testID={`${item.testId}-status`}>
                      {tr(isDone ? 'cockpit.kachel.status.erledigt' : 'cockpit.kachel.status.offen')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.formular} testID={`${item.testId}-formular`}>
                  {tr(item.titleKey.replace(/\.titel$/, '.formular'))}
                </Text>
              </Card>
            </Pressable>
          )
        })}
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
    ...t.type.subhead,
    color: t.color.tinte,
  }
  return { section, heading, ...tileStyles(t) }
}
