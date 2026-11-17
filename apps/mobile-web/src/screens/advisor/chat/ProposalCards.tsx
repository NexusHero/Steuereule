// The cards a draft of the owl is shown as: one field, a scanned certificate, two paths to choose from.
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@steuereule/ui'
import { ADVISOR_LEGAL_SOURCES, PERSON_B_SCREENS, formatEuro, type AdvisorActionProposal, type AdvisorLegalSource, type AdvisorTwoPathsProposal, type Screen } from '@steuereule/core'
import { APP_NS } from '../../../i18n/resources'
import { formLineForField } from '../../shared/formLineMapping'
import { makeStyles } from '../AdvisorChatPanel'

export function ActionProposalCardView({
  action,
  onApply,
  onUndo,
  onDismiss,
  onInspectMask,
  receiptLinked,
  onSelectSource,
  styles,
  testIDPrefix = 'advisor-action',
  partnerName,
  ownName,
  jointReturn = false,
}: {
  readonly action: AdvisorActionProposal
  /** The spouse's first name, for a draft that writes Person B's fields (ADR-0073). */
  readonly partnerName?: string | undefined
  /** The user's first name: in a joint return a card on a mask of one spouse names whose value it writes. */
  readonly ownName?: string | undefined
  readonly jointReturn?: boolean | undefined
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  /** Refuses a pending draft (ADR-0073 Nachtrag): a draft the owl itself called wrong must not stay one tap from the return. */
  readonly onDismiss?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly receiptLinked?: boolean | undefined
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly styles: ReturnType<typeof makeStyles>
  readonly testIDPrefix?: string
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [busyStatus, setBusyStatus] = useState<AdvisorActionProposal['status'] | null>(null)
  const isBusy = busyStatus === action.status
  const legalSource = ADVISOR_LEGAL_SOURCES[action.sourceId]
  const showPauschbetrag =
    action.deltaEur === 0 && (action.sourceId.startsWith('estg-9') || action.sourceId === 'estg-4-5-6c')

  async function handleApply() {
    if (!onApply || isBusy) return
    const startingStatus = action.status
    setBusyStatus(startingStatus)
    try {
      await onApply(action.actionId)
    } finally {
      setBusyStatus((current) => (current === startingStatus ? null : current))
    }
  }

  async function handleDismiss() {
    if (!onDismiss || isBusy) return
    const startingStatus = action.status
    setBusyStatus(startingStatus)
    try {
      await onDismiss(action.actionId)
    } finally {
      setBusyStatus((current) => (current === startingStatus ? null : current))
    }
  }

  async function handleUndo() {
    if (!onUndo || isBusy) return
    const startingStatus = action.status
    setBusyStatus(startingStatus)
    try {
      await onUndo(action.actionId)
    } finally {
      setBusyStatus((current) => (current === startingStatus ? null : current))
    }
  }

  return (
    <View style={styles.actionCard} testID={`${testIDPrefix}-card`}>
      <View style={styles.actionHeader}>
        <Text style={styles.actionLabel}>{action.label}</Text>
        {action.effect === 'not-computable' ? (
          <Text style={styles.pauschbetragBadge} testID={`${testIDPrefix}-effect-open`}>
            {tr('advisor.chat.effectOpen', 'Wirkung noch offen')}
          </Text>
        ) : action.effect === 'computed' && action.deltaEur < 0 ? (
          <Text style={styles.pauschbetragBadge} testID={`${testIDPrefix}-delta-negative`}>
            {tr('advisor.chat.taxEffectNegative', { amount: formatEuro(Math.abs(action.deltaEur)), defaultValue: `−${formatEuro(Math.abs(action.deltaEur))} Erstattung` })}
          </Text>
        ) : action.effect === 'computed' && action.deltaEur === 0 ? (
          <Text style={styles.pauschbetragBadge} testID={`${testIDPrefix}-effect-none`}>
            {tr('advisor.chat.effectNone', 'Ändert die Schätzung nicht')}
          </Text>
        ) : action.deltaEur > 0 ? (
          <Text style={styles.actionDeltaBadge} testID={`${testIDPrefix}-delta`}>
            {tr('advisor.chat.taxEffect', {
              amount: formatEuro(action.deltaEur),
              defaultValue: `+${formatEuro(action.deltaEur)} Steuer-Effekt`,
            })}
          </Text>
        ) : showPauschbetrag ? (
          <Text style={styles.pauschbetragBadge} testID={`${testIDPrefix}-pauschbetrag-badge`}>
            {tr('advisor.chat.pauschbetragBadge', 'Im Pauschbetrag (1.230 €)')}
          </Text>
        ) : null}
      </View>

      {action.effect === 'not-computable' && action.effectHint ? (
        <Text style={styles.actionReason} testID={`${testIDPrefix}-effect-hint`}>
          {action.effectHint}
        </Text>
      ) : null}

      {action.person === 'B' ? (
        <Text style={styles.receiptLinkedBadge} testID={`${testIDPrefix}-person`}>
          {tr('advisor.chat.forPerson', { name: partnerName?.trim() || tr('advisor.chat.personBFallback', 'Person B'), defaultValue: `für ${partnerName?.trim() || 'Person B'}` })}
        </Text>
      ) : jointReturn && PERSON_B_SCREENS.has(action.screen) ? (
        <Text style={styles.receiptLinkedBadge} testID={`${testIDPrefix}-person`}>
          {ownName?.trim()
            ? tr('advisor.chat.forPerson', { name: ownName.trim(), defaultValue: `für ${ownName.trim()}` })
            : tr('advisor.chat.forYou', 'für dich')}
        </Text>
      ) : null}

      {receiptLinked ? (
        <Text style={styles.receiptLinkedBadge} testID={`${testIDPrefix}-receipt-badge`}>
          {tr('eule.workspace.provenanceReceiptOwl', '📎 Beleg + Eule')}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole={onInspectMask ? 'button' : 'text'}
        disabled={!onInspectMask}
        onPress={onInspectMask ? () => onInspectMask(action.screen, action.field) : undefined}
        style={styles.sourcePill}
        testID={`${testIDPrefix}-form-line`}
      >
        <Text style={styles.sourcePillText}>
          {`📄 ${formLineForField(action.screen, action.field).label}`}
        </Text>
      </Pressable>

      <View style={styles.diffBox}>
        <View style={styles.diffRow}>
          <Text style={styles.diffCaption}>{tr('advisor.chat.entryLabel', 'Eintrag:')}</Text>
          <Text style={styles.diffValues}>
            {`${action.previousValue ?? tr('advisor.chat.notRecorded', 'Nicht erfasst')} → `}
            <Text style={styles.diffNewValue}>{action.newValue}</Text>
          </Text>
        </View>
        <View style={styles.diffRow}>
          <Text style={styles.diffCaption}>{tr('advisor.chat.refundSimulation', 'Erstattung (Simulation):')}</Text>
          <Text style={styles.diffValues}>
            {`${formatEuro(action.beforeRefundEur)} → `}
            <Text style={styles.diffNewValue}>{formatEuro(action.afterRefundEur)}</Text>
          </Text>
        </View>
      </View>

      <Text style={styles.actionReason}>{action.reason}</Text>

      {legalSource ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelectSource(legalSource)}
          style={styles.sourcePill}
        >
          <Text style={styles.sourcePillText}>
            {tr('advisor.chat.legalStatusDate', {
              paragraph: legalSource.paragraph,
              date: legalSource.legalStatusDate,
              defaultValue: `${legalSource.paragraph} · Rechtsstand ${legalSource.legalStatusDate}`,
            })}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.actionFooter}>
        {action.status === 'superseded' ? (
          <Text style={styles.mutedStatusBadge} testID={`${testIDPrefix}-superseded-badge`}>
            {tr('advisor.chat.supersededBadge', 'Ersetzt durch neueren Entwurf')}
          </Text>
        ) : action.status === 'dismissed' ? (
          <Text style={styles.mutedStatusBadge} testID={`${testIDPrefix}-dismissed-badge`}>
            {tr('advisor.chat.dismissedBadge', 'Verworfen')}
          </Text>
        ) : action.status === 'applied' ? (
          <View style={styles.appliedRow}>
            <Text style={styles.appliedBadge} testID={`${testIDPrefix}-applied-badge`}>
              {tr('advisor.chat.appliedBadge', '✓ Übernommen & bestätigt (SteuerEule)')}
            </Text>
            {onUndo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('advisor.chat.undoAria', 'Rückgängig machen')}
                disabled={isBusy}
                onPress={() => void handleUndo()}
                style={styles.undoButton}
                testID={`${testIDPrefix}-undo-btn`}
              >
                <Text style={styles.undoButtonText}>{tr('advisor.chat.undoButton', '↩ Rückgängig machen')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Button
            onPress={() => void handleApply()}
            disabled={isBusy}
            testID={`${testIDPrefix}-apply-btn`}
          >
            {action.status === 'undone'
              ? tr('advisor.chat.applyAgain', '✓ Erneut übernehmen')
              : tr('advisor.chat.applyNow', '✓ Jetzt übernehmen')}
          </Button>
        )}

        {onDismiss && action.status === 'pending' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('advisor.chat.dismissAria', 'Entwurf verwerfen')}
            disabled={isBusy}
            onPress={() => void handleDismiss()}
            style={styles.inspectMaskBtn}
            testID={`${testIDPrefix}-dismiss-btn`}
          >
            <Text style={styles.inspectMaskText}>{tr('advisor.chat.dismissButton', 'Verwerfen')}</Text>
          </Pressable>
        ) : null}

        {onInspectMask ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onInspectMask(action.screen, action.field)}
            style={styles.inspectMaskBtn}
            testID={`${testIDPrefix}-inspect-mask-btn`}
          >
            <Text style={styles.inspectMaskText}>{tr('advisor.chat.inspectMask', 'Maske ansehen →')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/**
 * A scanned Lohnsteuerbescheinigung stages several fields at once (meta.actions). The chat
 * shows what was read and how sure it is; taking the values over happens in the LStB mask,
 * where yellow fields need a single confirmation and conflicts are shown (ADR-0008).
 */
export function ScannedCertificateCardView({
  actions,
  onInspectMask,
  styles,
}: {
  readonly actions: readonly AdvisorActionProposal[]
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly styles: ReturnType<typeof makeStyles>
}) {
  const { t: tr } = useTranslation(APP_NS)
  const pending = actions.filter((a) => a.status === 'pending')
  const allApplied = pending.length === 0
  // A value is recorded already (ADR-0092): the mask asks „zusätzlich oder ersetzen?“; the card shows what was read.
  const combined = actions.some((a) => a.combination !== undefined)
  return (
    <View style={styles.actionCard} testID="advisor-lstb-scan-card">
      <Text style={styles.actionLabel}>{tr('advisor.chat.lstbScan.title', 'Lohnsteuerbescheinigung erkannt')}</Text>
      {combined && !allApplied ? (
        <Text style={styles.actionReason} testID="advisor-lstb-scan-kombination">
          {tr('belegZuordnung.kombination')}
        </Text>
      ) : null}
      {actions.filter((a) => a.combination !== 'add').map((a) => (
        <View key={a.actionId} style={styles.actionHeader} testID={`advisor-lstb-scan-row-${a.field}`}>
          <Text style={styles.actionReason}>
            {a.label}: {a.newValue === '' ? tr('advisor.chat.lstbScan.notRead', 'nicht gelesen') : formatEuro(Number(a.newValue))}
          </Text>
          <Text
            style={a.confidenceStatus === 'pruefen' ? styles.pauschbetragBadge : styles.actionDeltaBadge}
            testID={`advisor-lstb-scan-status-${a.field}`}
          >
            {a.confidenceStatus === 'pruefen'
              ? tr('advisor.chat.lstbScan.check', 'bitte prüfen')
              : tr('advisor.chat.lstbScan.ok', 'sicher gelesen')}
          </Text>
        </View>
      ))}
      {allApplied ? (
        <Text style={styles.actionReason} testID="advisor-lstb-scan-applied">
          {tr('advisor.chat.lstbScan.applied', 'Übernommen.')}
        </Text>
      ) : onInspectMask ? (
        <Button onPress={() => onInspectMask('lstb')} testID="advisor-lstb-scan-review">
          {tr('advisor.chat.lstbScan.review', 'Prüfen & übernehmen')}
        </Button>
      ) : null}
    </View>
  )
}

export function TwoPathsCardView({
  twoPaths,
  onApply,
  onUndo,
  onInspectMask,
  receiptLinkedActionIds,
  onSelectSource,
  styles,
  partnerName,
  ownName,
  jointReturn,
}: {
  readonly twoPaths: AdvisorTwoPathsProposal
  readonly partnerName?: string | undefined
  readonly ownName?: string | undefined
  readonly jointReturn?: boolean | undefined
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly receiptLinkedActionIds?: ReadonlySet<string> | undefined
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.twoPathsContainer} testID="advisor-two-paths-card">
      <Text style={styles.twoPathsTitle}>{twoPaths.title}</Text>
      <ActionProposalCardView
        action={twoPaths.safePath}
        onApply={onApply}
        onUndo={onUndo}
        onInspectMask={onInspectMask}
        receiptLinked={receiptLinkedActionIds?.has(twoPaths.safePath.actionId)}
        onSelectSource={onSelectSource}
        styles={styles}
        partnerName={partnerName}
        ownName={ownName}
        jointReturn={jointReturn}
        testIDPrefix="advisor-path-safe"
      />
      <View style={styles.maxPathWrapper}>
        <Text style={styles.evidenceHintText}>{twoPaths.maxPath.evidenceHint}</Text>
        <ActionProposalCardView
          action={twoPaths.maxPath}
          onApply={onApply}
          onUndo={onUndo}
          onInspectMask={onInspectMask}
          receiptLinked={receiptLinkedActionIds?.has(twoPaths.maxPath.actionId)}
          onSelectSource={onSelectSource}
          styles={styles}
          partnerName={partnerName}
          ownName={ownName}
          jointReturn={jointReturn}
          testIDPrefix="advisor-path-max"
        />
      </View>
    </View>
  )
}
