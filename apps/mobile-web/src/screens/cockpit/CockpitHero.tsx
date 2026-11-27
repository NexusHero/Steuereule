import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { HerkunftsChip, useTheme } from '@steuereule/ui'
import { formatEuro, UNCERTAINTY_PER_ITEM } from '@steuereule/core'
import type { CockpitStatusDto, CockpitSummaryDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { isLongHeroFigure, makeStyles } from './CockpitScreen.styles'
import { heroDisplay } from './cockpitFormat'

export function NumericHero({
  status,
  compact = false,
  byPerson,
  partnerName,
}: {
  readonly status: CockpitStatusDto
  readonly compact?: boolean
  /** A joint return: the recorded wages of each person (Echtdatentest 18.11.2026). */
  readonly byPerson?: CockpitSummaryDto['byPerson']
  readonly partnerName: string
}) {
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(useTheme())
  const calculationPath =
    status.kind === 'spanne'
      ? tr('cockpit.hero.herkunftRechenweg', { count: status.openItems ?? 0, perItem: formatEuro(UNCERTAINTY_PER_ITEM) })
      : undefined
  const source = calculationPath === undefined ? { rule: tr('cockpit.hero.herkunftRegel') } : { rule: tr('cockpit.hero.herkunftRegel'), calculationPath }
  const display = heroDisplay(status, tr('cockpit.hero.nochOffen'))
  return (
    <>
      <Text style={compact ? styles.heroValueSmall : isLongHeroFigure(display) ? styles.heroValueLong : styles.heroValue} testID="cockpit-einkommen">
        {display}
      </Text>
      {status.kind === 'spanne' && (status.openItems ?? 0) > 0 ? (
        <Text style={styles.offenePosten}>{tr('cockpit.hero.offenePosten', { count: status.openItems ?? 0 })}</Text>
      ) : null}
      {byPerson ? (
        <Text style={styles.offenePosten} testID="cockpit-einkommen-personen">
          {tr('cockpit.hero.proPerson', { du: formatEuro(byPerson.a), name: partnerName, partner: formatEuro(byPerson.b) })}
        </Text>
      ) : null}
      <HerkunftsChip source={source} />
    </>
  )
}

export function GatedHero({ status }: { readonly status: CockpitStatusDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      <Text style={styles.gatedHeading}>{tr('cockpit.hero.gatedHeading')}</Text>
      {(status.gated ?? []).map((name) => (
        <Text key={name} style={styles.gatedBody}>
          {tr('cockpit.hero.gatedBody', { name })}
        </Text>
      ))}
    </>
  )
}
