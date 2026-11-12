// A mask of the return shown inside the owl workbench, so a draft can be checked where it lands.
import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card } from '@steuereule/ui'
import { locateQuestion, type Screen } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { LstbScreen } from '../lstb/LstbScreen'
import { WorkdaysScreen } from '../workdays/WorkdaysScreen'
import { CrossBorderScreen } from '../cross-border/CrossBorderScreen'
import { PensionerScreen } from '../pension/PensionerScreen'
import { CapitalScreen } from '../capital/CapitalScreen'
import { RentalScreen } from '../rental/RentalScreen'
import { ChildrenScreen } from '../children/ChildrenScreen'
import { AssessmentScreen } from '../assessment/AssessmentScreen'
import { CatalogScreen, type CatalogScreenEntry } from '../catalog/CatalogScreen'
import { MasterDataScreen } from '../master-data/MasterDataScreen'
import { AI_MANUAL_ONLY_SCREENS, makeStyles } from './OwlModeScreen'

export function InlineMaskView({
  screen,
  field,
  taxYear,
  onBack,
  styles,
}: {
  readonly screen: Screen
  readonly field?: string | undefined
  readonly taxYear: number
  readonly onBack: () => void
  readonly styles: ReturnType<typeof makeStyles>
}) {
  const { t: tr } = useTranslation(APP_NS)
  const isManualOnly = AI_MANUAL_ONLY_SCREENS.has(screen)
  // The interview is several pages; the field says which one the draft is about (#488).
  const located = screen === 'interview' && field ? locateQuestion(field) : null

  function renderMask(): ReactNode {
    if (isManualOnly) {
      return (
        <View>
          <Card variant="default" style={styles.manualNoticeCard} testID="eule-manual-only-notice">
            <Text style={styles.manualNoticeText}>
              {tr(
                'eule.workspace.manualNotice',
                'Diese Maske enthält Stammdaten und ist für automatische KI-Änderungen gesperrt (Manuelle Eingabe).',
              )}
            </Text>
          </Card>
          {screen === 'stammdaten' || screen === 'kopplung' ? (
            <MasterDataScreen taxYear={taxYear} onBack={onBack} />
          ) : null}
        </View>
      )
    }

    switch (screen) {
      case 'lstb':
        return <LstbScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'commute':
        return <WorkdaysScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'chLohnausweis':
        return <CrossBorderScreen taxYear={taxYear} onDone={onBack} />
      case 'rente':
        return <PensionerScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'kapital':
        return <CapitalScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'vermietung':
        return <RentalScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'kind':
        return <ChildrenScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'assessment':
        return <AssessmentScreen taxYear={taxYear} onDone={onBack} onBack={onBack} />
      case 'interview':
        return located ? (
          <CatalogScreen entry={located.entry as CatalogScreenEntry} focusStep={located.step} taxYear={taxYear} revisit onDone={onBack} onBack={onBack} />
        ) : (
          <Card variant="default" style={styles.manualNoticeCard} testID="eule-inline-mask-unplaced">
            <Text style={styles.manualNoticeText}>{tr('eule.workspace.maskUnplaced', 'Diese Angabe steht im Interview. Öffne dort die passende Frage.')}</Text>
          </Card>
        )
    }
  }

  return (
    <View style={styles.inlineMaskWrap} testID="eule-inline-mask-view">
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.backToStageBtn}
        testID="eule-back-to-stage-btn"
      >
        <Text style={styles.backToStageText}>
          {tr('eule.workspace.backToStage', '← Zurück zu den Eulen-Änderungen')}
        </Text>
      </Pressable>
      <View style={styles.inlineMaskFocusBanner} testID="eule-inline-mask-focus-banner">
        <Text style={styles.inlineMaskFocusText}>
          {tr('eule.workspace.maskFocus', '🦉 Eulen-Fokus · Prüfe deine Maske')}
          {field ? ` · ${field}` : ''}
        </Text>
      </View>
      {renderMask()}
    </View>
  )
}
