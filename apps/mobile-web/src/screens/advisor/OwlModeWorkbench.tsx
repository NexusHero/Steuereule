import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, useTheme } from '@steuereule/ui'
import { withoutInternalNames } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { InlineMaskView } from './OwlInlineMask'
import { GlassFormPreview } from '../printout/GlassFormPreview'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { OwlModeScreenState } from './useOwlModeScreen'
import { OwlModeDrafts } from './OwlModeDrafts'
import { OwlModeHintCard } from './OwlModeHintCard'

interface OwlModeWorkbenchProps {
  readonly owl: OwlModeScreenState
  readonly taxYear: number
  readonly onDone: () => void
  readonly onAcceptPath: OwlModeScreenProps['onAcceptPath']
  readonly styles: ReturnType<typeof makeStyles>
}

/** The workbench: its header, and a mask, the glass return, or the drafts and hints. */
export function OwlModeWorkbench({ owl, taxYear, onDone, onAcceptPath, styles }: OwlModeWorkbenchProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { wide, closePanel } = owl
  return (
    <>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle} role="heading" aria-level={2}>
          {tr('eule.workspace.topbar.panelTitle')}
        </Text>
        {wide ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('eule.workspace.topbar.panelClose')}
            onPress={closePanel}
            style={styles.toolbarToggleBtn}
            testID="eule-workbench-close"
          >
            <Text style={styles.toolbarToggleText}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      <OwlModeWorkbenchBody owl={owl} taxYear={taxYear} onDone={onDone} onAcceptPath={onAcceptPath} styles={styles} />
    </>
  )
}

function OwlModeWorkbenchBody({ owl, taxYear, onDone, onAcceptPath, styles }: OwlModeWorkbenchProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { bridge, viewMode, setPanelChoice, handleReturnToStage, handleInspectMask, handleBatchApply, workbenchTab, setWorkbenchTab } = owl
  if (viewMode.kind === 'mask') {
    return (
      <InlineMaskView
        screen={viewMode.screen}
        field={viewMode.field}
        taxYear={taxYear}
        onBack={() => {
          // Back from a mask means back to the drafts, not out of the workbench.
          setPanelChoice('open')
          handleReturnToStage()
        }}
        styles={styles}
      />
    )
  }

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s3 }} testID="eule-workbench-tabs">
        <Chip
          active={workbenchTab === 'drafts'}
          onPress={() => setWorkbenchTab('drafts')}
          testID="eule-workbench-tab-drafts"
        >
          {tr('eule.workspace.tabDrafts', 'Entwürfe & Hinweise')}
        </Chip>
        <Chip
          active={workbenchTab === 'forms'}
          onPress={() => setWorkbenchTab('forms')}
          testID="eule-workbench-tab-forms"
        >
          {tr('eule.workspace.tabForms', 'Glas-Erklärung')}
        </Chip>
      </View>

      {workbenchTab === 'forms' ? (
        <GlassFormPreview
          year={taxYear}
          defaultOpen
          onInspectField={(screen, field) => handleInspectMask(screen, field)}
        />
      ) : (
        <>
          {bridge?.lastParsedReceipt ? (
            <Card variant="ai" style={styles.receiptResultCard} testID="eule-receipt-result">
              <Text style={styles.draftSectionTitle}>
                {tr('eule.workspace.receiptResultTitle', {
                  // A field id („krankenkasseChf“) is no file name the user knows: its label, as on the mask.
                  fileName: withoutInternalNames(bridge.lastParsedReceipt.parsed.suggestedField ?? bridge.lastParsedReceipt.parsed.vendorCategory),
                  defaultValue: `Beleg geprüft: ${withoutInternalNames(bridge.lastParsedReceipt.parsed.vendorCategory)}`,
                })}
              </Text>
              <Text style={styles.help}>{bridge.lastParsedReceipt.parsed.summary}</Text>
              {bridge.lastParsedReceipt.securityBlocked ? (
                <Text style={styles.conflictText}>
                  {tr('eule.workspace.receiptBlocked', 'Sensibler Inhalt geschwärzt (Mandantengeheimnis)')}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {bridge?.staleConflict ? (
            <Card variant="default" style={styles.conflictCard} testID="eule-stale-conflict-banner">
              <Text style={styles.conflictTitle}>{tr('eule.workspace.conflictTitle', 'Konflikt beim Übernehmen')}</Text>
              <Text style={styles.conflictText}>{bridge.staleConflict.message}</Text>
              <View style={styles.conflictActions}>
                <Button
                  variant="tinte"
                  onPress={() => void handleBatchApply(true)}
                  disabled={bridge.batchApplying}
                  style={{ flex: 1 }}
                  testID="eule-force-apply-btn"
                >
                  {tr('eule.workspace.forceApply', 'Mit neuem Stand trotzdem übernehmen')}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => bridge.clearStaleConflict()}
                  style={{ flex: 1 }}
                  testID="eule-conflict-dismiss-btn"
                >
                  {tr('eule.workspace.dismissConflict', 'Schließen')}
                </Button>
              </View>
            </Card>
          ) : null}

          <OwlModeDrafts owl={owl} styles={styles} />

          <OwlModeHintCard owl={owl} onAcceptPath={onAcceptPath} styles={styles} />

          <Button variant="ghost" onPress={onDone} style={styles.cta}>
            {tr('eule.fertig', 'Zurück zum Cockpit')}
          </Button>
        </>
      )}
    </>
  )
}
