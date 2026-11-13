import { View, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { ReceiptFileModal } from '../../receipts/ReceiptFileModal'
import { ReceiptPickerButton } from '../../shared/ReceiptPickerButton'
import type { LstbScanState } from './useLstbScan'

export interface LstbScanPanelProps {
  readonly scan: LstbScanState
  readonly taxYear: number
  readonly onSwitchTaxYear?: ((year: number) => void) | undefined
}

/** Scan tile, year/overwrite conflicts and the staged-draft banner of the LStB mask (#444). */
export function LstbScanPanel({ scan, taxYear, onSwitchTaxYear }: LstbScanPanelProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const { stagedScan, evaluation } = scan

  return (
    <>
    <Card variant="nacht" style={styles.scanCard} testID="lstb-scan-card">
      <Text style={styles.scanHeading}>{tr('lstb.scan.heading')}</Text>
      <Text style={styles.scanBody}>{tr('lstb.scan.help')}</Text>
      <ReceiptPickerButton
        onFile={(file) => void scan.scanFile(file)}
        disabled={scan.busyPhase !== null}
        testID="lstb-scan-cta"
        inputTestID="lstb-scan-file-input"
        unsupportedHint={tr('lstb.scan.nativeUnsupported')}
        hintStyle={styles.scanBody}
      >
        {scan.busyPhase !== null ? tr(`lstb.scan.progress.${scan.busyPhase}`) : tr('lstb.scan.cta')}
      </ReceiptPickerButton>
      {scan.error !== null && (
        <Text style={styles.scanErrorText} accessibilityRole="alert" testID="lstb-scan-error">
          {scan.error}
        </Text>
      )}
    </Card>

    {scan.yearConflict !== null && (
      <Card style={styles.conflictCard} testID="lstb-year-conflict-modal">
        <Text style={styles.conflictHeading}>{tr('lstb.scan.yearConflict.title')}</Text>
        <Text style={styles.conflictBody}>
          {tr('lstb.scan.yearConflict.body', {
            documentYear: scan.yearConflict.documentYear,
            activeYear: scan.yearConflict.activeYear,
          })}
        </Text>
        <View style={styles.conflictActions}>
          {onSwitchTaxYear !== undefined && (
            <Button
              onPress={() => {
                const targetYear = scan.yearConflict!.documentYear
                scan.dismissYearConflict()
                onSwitchTaxYear(targetYear)
              }}
              style={styles.compactButton}
              testID="lstb-year-conflict-switch"
            >
              {tr('lstb.scan.yearConflict.switchYear', { jahr: scan.yearConflict.documentYear })}
            </Button>
          )}
          <Button
            variant="ghost"
            onPress={scan.dismissYearConflict}
            style={styles.compactButton}
            testID="lstb-year-conflict-cancel"
          >
            {tr('lstb.scan.yearConflict.cancel')}
          </Button>
        </View>
      </Card>
    )}

    {scan.overwriteConflict && (
      <Card style={styles.conflictCard} testID="lstb-overwrite-conflict-modal">
        <Text style={styles.conflictHeading}>{tr('lstb.scan.overwriteConflict.title')}</Text>
        <Text style={styles.conflictBody}>{tr('lstb.scan.overwriteConflict.body', { jahr: taxYear })}</Text>
        {scan.sameCertificate && (
          <Text style={styles.conflictBody} testID="lstb-same-certificate">
            {tr('lstb.scan.overwriteConflict.same')}
          </Text>
        )}
        <View style={styles.conflictActions}>
          <Button
            onPress={() => void scan.applyDraft(true)}
            disabled={scan.confirming}
            style={styles.compactButton}
            testID="lstb-overwrite-confirm"
          >
            {tr('lstb.scan.overwriteConflict.replace')}
          </Button>
          <Button
            variant="leise"
            onPress={() => void scan.applyDraft(false, true)}
            disabled={scan.confirming}
            style={styles.compactButton}
            testID="lstb-overwrite-add"
          >
            {tr('lstb.scan.overwriteConflict.add')}
          </Button>
          <Button
            variant="ghost"
            onPress={scan.dismissOverwriteConflict}
            disabled={scan.confirming}
            style={styles.compactButton}
            testID="lstb-overwrite-cancel"
          >
            {tr('lstb.scan.overwriteConflict.cancel')}
          </Button>
        </View>
      </Card>
    )}

    {stagedScan !== null && (
      <Card style={styles.draftBannerCard} testID="lstb-scan-draft-banner">
        <View style={styles.draftHeader}>
          <Text style={styles.draftTitle}>{tr('lstb.scan.draftBanner.title')}</Text>
          <Chip variant={stagedScan.stage === 'llm_text_fallback' ? 'pro' : 'src'}>
            {stagedScan.stage === 'llm_text_fallback'
              ? tr('lstb.scan.draftBanner.stageLlmFallback')
              : tr('lstb.scan.draftBanner.stageDeterministic')}
          </Chip>
        </View>
        <Text style={styles.draftSubtitle}>{tr('lstb.scan.draftBanner.subtitle')}</Text>

        {evaluation.hasUnconfirmedYellow && (
          <Text style={styles.yellowWarningText}>{tr('lstb.scan.draftBanner.yellowBlocked')}</Text>
        )}

        {evaluation.liveStatus?.kind === 'widerspruch' && (
          <View style={styles.widerspruchBlock} testID="lstb-scan-widerspruch">
            <Text style={styles.widerspruchHeading}>{tr('lstb.scan.draftBanner.widerspruchBlocked')}</Text>
            {evaluation.liveStatus.conflicts.map((w) => (
              <Text key={w.kind} style={styles.widerspruchItem}>
                {tr(`lstb.widerspruch.${w.kind}`)}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.draftActions}>
          <Button
            onPress={() => void scan.applyDraft(false)}
            disabled={!scan.canApply}
            style={styles.compactButton}
            testID="lstb-scan-apply"
          >
            {scan.confirming ? tr('lstb.scan.draftBanner.applying') : tr('lstb.scan.draftBanner.apply')}
          </Button>
          {stagedScan.receiptId !== null && (
            <Button
              variant="ghost"
              onPress={() => scan.setPreviewOpen(true)}
              style={styles.compactButton}
              testID="lstb-scan-view-receipt"
            >
              {tr('lstb.scan.draftBanner.viewReceipt')}
            </Button>
          )}
          <Button
            variant="leise"
            onPress={() => void scan.discardDraft()}
            style={styles.compactButton}
            testID="lstb-scan-discard"
          >
            {tr('lstb.scan.draftBanner.discard')}
          </Button>
        </View>
      </Card>
    )}

    {scan.previewOpen && stagedScan?.receiptId !== null && stagedScan?.receiptId !== undefined && (
      <ReceiptFileModal
        receiptId={stagedScan.receiptId}
        fileName={stagedScan.fileName}
        onClose={() => scan.setPreviewOpen(false)}
      />
    )}
    </>
  )
}

function makeStyles(t: UiTheme) {
  const scanCard: ViewStyle = {
    marginBottom: t.space.s4,
    gap: t.space.s2,
  }
  const scanHeading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
  }
  const scanBody: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.9,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const scanErrorText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const conflictCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: 2,
    borderColor: t.color.warn,
    backgroundColor: t.color.warnWeich,
    gap: t.space.s2,
  }
  const conflictHeading: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
  }
  const conflictBody: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const conflictActions: ViewStyle = {
    flexDirection: 'row',
    gap: t.space.s2,
    flexWrap: 'wrap',
    marginTop: t.space.s2,
  }
  const draftBannerCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: 2,
    borderColor: t.color.tinte,
    gap: t.space.s2,
  }
  const draftHeader: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s2,
    flexWrap: 'wrap',
  }
  const draftTitle: TextStyle = {
    flex: 1,
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const draftSubtitle: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const yellowWarningText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const draftActions: ViewStyle = {
    flexDirection: 'row',
    gap: t.space.s2,
    flexWrap: 'wrap',
    marginTop: t.space.s2,
  }
  const compactButton: ViewStyle = {
    width: 'auto',
    minHeight: 42,
    paddingHorizontal: t.space.s4,
  }
  const widerspruchBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s }
  const widerspruchHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const widerspruchItem: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  return {
    scanCard,
    scanHeading,
    scanBody,
    scanErrorText,
    conflictCard,
    conflictHeading,
    conflictBody,
    conflictActions,
    draftBannerCard,
    draftHeader,
    draftTitle,
    draftSubtitle,
    yellowWarningText,
    draftActions,
    compactButton,
    widerspruchBlock,
    widerspruchHeading,
    widerspruchItem,
  }
}
