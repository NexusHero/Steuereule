import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { Icon, type IconName } from '../../icons/Icon'
import { OwlAdvisorCard } from '../advisor/OwlAdvisorCard'
import { APP_NS } from '../../i18n/resources'
import { CockpitTiles } from './CockpitTiles'
import type { TileFacts } from './tiles'
import type { MissingItem } from './estimateMissing'
import { CockpitInbox } from './CockpitInbox'
import { makeStyles } from './CockpitScreen.styles'
import { MissingMasterDataNotice } from './CockpitNotices'
import type { CockpitEmptyProps } from './cockpitTypes'

/** The quieter actions below the tiles; shared by the empty and the loaded Cockpit. */
export function SecondaryActions({
  tileFacts,
  onOpenAssessment,
  onOpenOfficialForm,
  onOpenCapital,
  onOpenRental,
  onOpenKinder,
  onOpenPrintout,
  kinderTestID,
}: {
  readonly tileFacts: TileFacts | null
  readonly onOpenAssessment: () => void
  readonly onOpenOfficialForm?: (() => void) | undefined
  readonly onOpenCapital: () => void
  readonly onOpenRental: () => void
  readonly onOpenKinder?: (() => void) | undefined
  readonly onOpenPrintout?: (() => void) | undefined
  readonly kinderTestID: string
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const action = (label: string, onPress: () => void, testID: string, icon: IconName) => (
    <View key={testID} style={styles.secondaryGridItem}>
      <Button variant="ghost" onPress={onPress} testID={testID} icon={<Icon name={icon} />}>
        {label}
      </Button>
    </View>
  )
  // Once tiles show, Kapital, Vermietung and Kinder are tiles or under „Weitere Themen“: only without
  // tiles (no interview answers yet) do they need a way in here.
  const withoutTiles = tileFacts === null
  return (
    <View style={styles.secondaryGrid}>
      {action(tr('cockpit.checkBescheid'), onOpenAssessment, 'cockpit-bescheid', 'assessment')}
      {onOpenOfficialForm ? action(tr('cockpit.amtlichesFormular'), onOpenOfficialForm, 'cockpit-formular', 'form') : null}
      {withoutTiles ? action(tr('cockpit.checkKapital'), onOpenCapital, 'cockpit-kapital', 'coins') : null}
      {withoutTiles ? action(tr('cockpit.checkVermietung'), onOpenRental, 'cockpit-vermietung', 'house') : null}
      {withoutTiles && onOpenKinder ? action(tr('cockpit.checkKinder'), onOpenKinder, kinderTestID, 'child') : null}
      {onOpenPrintout ? action(tr('ausdruck.cockpitCta'), onOpenPrintout, 'cockpit-ausdruck', 'printer') : null}
    </View>
  )
}

interface CockpitWorkAreaProps
  extends Pick<
    CockpitEmptyProps,
    'year' | 'tileFacts' | 'isSignedIn' | 'isJointMarried' | 'partnerName' | 'findings' | 'onOpenTile' | 'onOpenPartner' | 'onOpenSubmission' | 'masterData' | 'onOpenOwlMode' | 'progress' | 'onOpenReceipts'
  > {
  readonly hasPositiveRefund?: boolean
  readonly owlTestID?: string
  /** What the estimate still lacks: the tile that holds it does not read „Erledigt“. */
  readonly estimateMissing?: readonly MissingItem[]
}

/** Inbox, tiles, the owl card and the master-data notice — the same on the empty and the loaded Cockpit. */
export function CockpitWorkArea({ year, tileFacts, isSignedIn, isJointMarried, partnerName, findings, onOpenTile, onOpenPartner, onOpenSubmission, masterData, onOpenOwlMode, progress, onOpenReceipts, hasPositiveRefund = false, owlTestID, estimateMissing }: CockpitWorkAreaProps) {
  const styles = makeStyles(useTheme())
  return (
    <>
      {isSignedIn && onOpenReceipts ? <CockpitInbox onOpenReceipts={onOpenReceipts} /> : null}
      {masterData && (masterData.missingFields?.length ?? 0) > 0 ? <MissingMasterDataNotice masterData={masterData} /> : null}
      {tileFacts !== null ? (
        <CockpitTiles
          facts={tileFacts}
          year={year}
          isSignedIn={isSignedIn}
          isJointMarried={isJointMarried}
          partnerName={partnerName}
          conflicts={findings.conflicts}
          notices={findings.notices}
          hasPositiveRefund={hasPositiveRefund}
          {...(estimateMissing ? { estimateMissing } : {})}
          openSteps={progress === null ? undefined : progress.total - progress.done}
          onOpenTile={onOpenTile}
          {...(onOpenPartner ? { onOpenPartner } : {})}
          {...(onOpenSubmission ? { onOpenSubmission } : {})}
        />
      ) : null}
      {onOpenOwlMode ? <View style={styles.berater}><OwlAdvisorCard onOpen={onOpenOwlMode} {...(owlTestID ? { testID: owlTestID } : {})} /></View> : null}
      {masterData && (masterData.missingFields?.length ?? 0) === 0 ? <MissingMasterDataNotice masterData={masterData} /> : null}
    </>
  )
}
