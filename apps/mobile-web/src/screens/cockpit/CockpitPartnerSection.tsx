import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useCommuteControllerGet, useLstbControllerGetLstb } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import type { PartnerAreaParam } from '../../navigation/routes'
import { tileById, type TileStatus } from './tiles'

export interface CockpitPartnerSectionProps {
  readonly year: number
  readonly partnerName: string
  readonly enabled: boolean
  readonly onOpenPartner: (area: PartnerAreaParam, name: string) => void
}

export function CockpitPartnerSection({ year, partnerName, enabled, onOpenPartner }: CockpitPartnerSectionProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  const lstb = useLstbControllerGetLstb(year, { person: 'B' }, { query: { enabled } })
  const commute = useCommuteControllerGet(year, { person: 'B' }, { query: { enabled } })

  const lstbData = lstb.data?.status === 200 ? lstb.data.data : null
  const commuteData = commute.data?.status === 200 ? commute.data.data : null

  const lstbStatus = tileById('lstb').status({ path: 'angestellte', answers: {}, lstb: lstbData })
  const commuteStatus = tileById('arbeitsweg').status({ path: 'angestellte', answers: {}, commute: commuteData })

  const items: readonly { readonly area: PartnerAreaParam; readonly testId: string; readonly titleKey: string; readonly status: TileStatus }[] = [
    { area: 'lstb', testId: 'partner-lstb', titleKey: 'cockpit.kachel.partner-lstb.titel', status: lstbStatus },
    { area: 'arbeitsweg', testId: 'partner-arbeitsweg', titleKey: 'cockpit.kachel.partner-arbeitsweg.titel', status: commuteStatus },
  ]

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
  const card: ViewStyle = {
    marginBottom: 0,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    ...t.shadow.hart,
  }
  const title: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const statusBase: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const statusOpen: TextStyle = { ...statusBase, color: t.color.tinte2 }
  const statusDone: TextStyle = { ...statusBase, color: t.color.ok }

  return { section, heading, grid, tileWrapNarrow, tileWrapWide, card, title, statusOpen, statusDone }
}
