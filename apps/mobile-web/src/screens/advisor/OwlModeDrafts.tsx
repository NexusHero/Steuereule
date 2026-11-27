import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme } from '@steuereule/ui'
import { formatEuro, isWithinEmployeeAllowance } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { formLineForField } from '../shared/formLineMapping'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenState } from './useOwlModeScreen'
import { draftDiffText } from './OwlModeHelpers'

interface OwlModeDraftsProps {
  readonly owl: OwlModeScreenState
  readonly styles: ReturnType<typeof makeStyles>
}

/** The workbench's drafts: the prepared changes to apply, and the log of those applied. */
export function OwlModeDrafts({ owl, styles }: OwlModeDraftsProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { bridge, pendingDrafts, appliedDrafts, alternativeGroups, alternativeIds, handleApplyAction, handleUndoAction, handleInspectMask, handleBatchApply } = owl
  return (
    <>
      {pendingDrafts.length > 0 ? (
        <Card style={styles.draftStageCard} testID="eule-draft-stage">
          <Text style={styles.draftSectionTitle}>
            {tr('eule.workspace.draftStageTitle', {
              count: pendingDrafts.length,
              defaultValue: `Vorbereitete Änderungen (${pendingDrafts.length})`,
            })}
          </Text>
          <View style={styles.draftList}>
            {pendingDrafts.map((draft) => {
              const isReceipt = bridge?.receiptLinkedActionIds.has(draft.actionId) ?? false
              const isZeroPauschbetrag = isWithinEmployeeAllowance(draft)
              return (
                <View key={draft.actionId} style={styles.draftRowCard} testID={`draft-card-${draft.actionId}`}>
                  <View style={styles.draftTopRow}>
                    <Text style={styles.draftTitle}>{draft.label}</Text>
                    {draft.deltaEur > 0 ? (
                      <Text style={styles.draftDelta}>{`+${formatEuro(draft.deltaEur)}`}</Text>
                    ) : draft.effect === 'not-computable' ? (
                      <Text style={styles.draftMutedBadge} testID={`draft-effect-open-${draft.actionId}`}>
                        {tr('advisor.chat.effectOpen', 'Wirkung noch offen')}
                      </Text>
                    ) : isZeroPauschbetrag ? (
                      <Text style={styles.draftMutedBadge}>
                        {tr('eule.workspace.pauschbetragBadge', 'Im Pauschbetrag (1.230 €)')}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.draftProvenance}>
                    {isReceipt
                      ? tr('eule.workspace.provenanceReceiptOwl', 'Beleg + Eule')
                      : tr('eule.workspace.provenanceOwlDraft', 'Eulen-Entwurf')}
                  </Text>
                  <Text style={styles.draftProvenance} testID={`draft-form-line-${draft.actionId}`}>
                    {`📄 ${formLineForField(draft.screen, draft.field).label}`}
                  </Text>
                  <Text style={styles.draftDiff}>
                    {draftDiffText(draft, tr('advisor.chat.notRecorded', 'Nicht erfasst'))}
                  </Text>
                  {alternativeIds.has(draft.actionId) ? (
                    <Button
                      variant="leise"
                      onPress={() => void handleApplyAction(draft.actionId)}
                      disabled={bridge?.batchApplying ?? false}
                      testID={`draft-choose-${draft.actionId}`}
                    >
                      {tr('eule.workspace.chooseAlternative', 'Diesen Weg übernehmen')}
                    </Button>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleInspectMask(draft.screen, draft.field)}
                    style={styles.inspectMaskLink}
                    testID={`draft-inspect-${draft.actionId}`}
                  >
                    <Text style={styles.inspectMaskLinkText}>
                      {tr('eule.workspace.inspectMask', 'Maske ansehen →')}
                    </Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
          {pendingDrafts.some((d) => d.combination !== undefined) ? (
            <Text style={styles.help} testID="eule-kombination-hinweis">
              {tr('belegZuordnung.kombination')}
            </Text>
          ) : null}
          {alternativeGroups.length > 0 ? (
            <Text style={styles.help} testID="eule-batch-alternatives-hint">
              {tr('eule.workspace.alternativesHint', 'Wähle einen der Wege — beide zusammen geht nicht.')}
            </Text>
          ) : null}
          <Button
            // Quiet on purpose: the conversation is the stage, the same drafts have their own button there.
            variant="leise"
            onPress={() => void handleBatchApply(false)}
            disabled={(bridge?.batchApplying ?? false) || alternativeGroups.length > 0}
            testID="eule-batch-apply-btn"
          >
            {bridge?.batchApplying
              ? tr('eule.workspace.applying', 'Wird übernommen …')
              : pendingDrafts.length === 1
                ? tr('eule.workspace.applyOne', '✓ Änderung übernehmen')
                : tr('eule.workspace.applyAll', {
                    count: pendingDrafts.length,
                    defaultValue: `✓ ${pendingDrafts.length} Änderungen übernehmen`,
                  })}
          </Button>
        </Card>
      ) : null}

      {appliedDrafts.length > 0 ? (
        <Card style={styles.draftStageCard} testID="eule-applied-stage">
          <Text style={styles.draftSectionTitle}>
            {`✓ Änderungsprotokoll (${appliedDrafts.length} übernommen)`}
          </Text>
          <View style={styles.draftList}>
            {appliedDrafts.map((draft) => (
              <View key={draft.actionId} style={styles.draftRowCard} testID={`applied-card-${draft.actionId}`}>
                <View style={styles.draftTopRow}>
                  <Text style={styles.draftTitle}>{draft.label}</Text>
                  <Text style={styles.draftDelta} testID={`applied-status-${draft.actionId}`}>
                    ✓ Übernommen
                  </Text>
                </View>
                <Text style={styles.draftProvenance} testID={`applied-form-line-${draft.actionId}`}>
                  {`📄 ${formLineForField(draft.screen, draft.field).label}`}
                </Text>
                <Text style={styles.draftDiff}>
                  {draftDiffText(draft, tr('advisor.chat.notRecorded', 'Nicht erfasst'))}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: t.space.s1 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleInspectMask(draft.screen, draft.field)}
                    style={styles.inspectMaskLink}
                    testID={`applied-inspect-${draft.actionId}`}
                  >
                    <Text style={styles.inspectMaskLinkText}>
                      {tr('eule.workspace.inspectMask', 'Maske ansehen →')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void handleUndoAction(draft.actionId)}
                    testID={`applied-undo-${draft.actionId}`}
                  >
                    <Text style={styles.draftMutedBadge}>↩ Rückgängig</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </>
  )
}
