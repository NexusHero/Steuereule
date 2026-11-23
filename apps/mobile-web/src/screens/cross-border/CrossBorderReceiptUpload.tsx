import { useState } from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Card, useTheme } from '@steuereule/ui'
import { CreateReceiptDtoKind, getReceiptControllerListQueryKey, uploadReceiptFile } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import { detectDocumentMimeType } from '../../lib/documentOcr'
import { DocumentAssignmentCard } from '../receipts/DocumentAssignmentCard'
import { ReceiptOutcomeLines } from '../receipts/ReceiptOutcomeLines'
import { useReceiptReader } from '../../lib/receipts/useReceiptReader'
import { useOptionalSetTaxYear, useOptionalSwitchToTab } from '../../navigation/ShellState'
import { makeStyles } from './CrossBorderScreen.styles'

/** The mask reads one certificate at a time: its read result is kept under this key. */
const CERTIFICATE_READ_KEY = 'ch-lohnausweis'

/** The upload card at the top of the Lohnausweis mask: stores the certificate and reads it on the device. */
export function CrossBorderReceiptUpload({ taxYear, partnerName }: { readonly taxYear: number; readonly partnerName?: string }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const styles = makeStyles(t)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [receiptUploadStatus, setReceiptUploadStatus] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null)
  // The same pipeline as every upload (ADR-0097 §4): stored, read on the device, its values staged as
  // drafts in the owl. The mask only says what it expects and whose mask it is.
  const reader = useReceiptReader({
    taxYear,
    context: { expectedKind: 'chLohnausweis', mask: 'chLohnausweis', area: partnerName !== undefined ? 'B' : 'A' },
  })
  const readEntry = reader.entries[CERTIFICATE_READ_KEY]
  const switchToTab = useOptionalSwitchToTab()
  const setTaxYear = useOptionalSetTaxYear()

  async function handleReceiptFile(file: File) {
    setReceiptUploadStatus(null)
    const detectedMime = detectDocumentMimeType(new Uint8Array(0), file.type, file.name)
    if (detectedMime === null) {
      triggerSaveErrorHaptic()
      setReceiptUploadStatus({ kind: 'error', text: tr('belege.upload.errorUnsupported') })
      return
    }
    setUploadingReceipt(true)
    try {
      const result = await uploadReceiptFile({
        file,
        fileName: file.name,
        kind: CreateReceiptDtoKind.Lohnausweis,
      })
      if (!result.ok) {
        triggerSaveErrorHaptic()
        setReceiptUploadStatus({ kind: 'error', text: tr('belege.upload.errorFailed') })
        return
      }
      setReceiptUploadStatus({ kind: 'ok', text: tr('grenzgaenger.lohnausweis.upload.saved', { datei: file.name }) })
      void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
      await reader.read(CERTIFICATE_READ_KEY, file, result.data.id)
    } catch {
      triggerSaveErrorHaptic()
      setReceiptUploadStatus({ kind: 'error', text: tr('belege.upload.errorFailed') })
    } finally {
      setUploadingReceipt(false)
    }
  }

  return (
    <Card style={styles.uploadCard} testID="ch-lohnausweis-upload-card">
      <View style={styles.uploadHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.uploadTitle}>{tr('grenzgaenger.lohnausweis.upload.title')}</Text>
          <Text style={styles.uploadBody}>{tr('grenzgaenger.lohnausweis.upload.body')}</Text>
        </View>
        <ReceiptPickerButton
          onFile={(file) => void handleReceiptFile(file)}
          disabled={uploadingReceipt}
          variant="leise"
          testID="ch-lohnausweis-upload-btn"
        >
          {uploadingReceipt
            ? tr(readEntry?.phase != null ? 'grenzgaenger.lohnausweis.upload.reading' : 'belege.upload.uploading')
            : tr('grenzgaenger.lohnausweis.upload.cta')}
        </ReceiptPickerButton>
      </View>
      {receiptUploadStatus !== null ? (
        <Text
          style={receiptUploadStatus.kind === 'ok' ? styles.uploadStatusOk : styles.uploadStatusError}
          accessibilityLiveRegion="polite"
          testID="ch-lohnausweis-upload-status"
        >
          {receiptUploadStatus.text}
        </Text>
      ) : null}
      {readEntry?.outcome != null && readEntry.phase === null ? (
        <ReceiptOutcomeLines
          outcome={readEntry.outcome}
          openYear={taxYear}
          testIDPrefix="ch-lohnausweis-ergebnis"
          asking={readEntry.question !== null}
          onSwitchYear={setTaxYear ?? undefined}
          onOpenDrafts={switchToTab ? () => switchToTab('Owl') : undefined}
        />
      ) : null}
      {readEntry?.question != null ? (
        <DocumentAssignmentCard
          question={readEntry.question.question}
          printed={readEntry.question.printed}
          busy={readEntry.phase !== null}
          error={readEntry.error}
          onChoose={(holder) => void reader.choose(CERTIFICATE_READ_KEY, holder)}
          onCreate={(role, details) => void reader.create(CERTIFICATE_READ_KEY, role, details)}
          onConfirmSelf={(takeName) => void reader.confirmSelf(CERTIFICATE_READ_KEY, takeName)}
        />
      ) : null}
    </Card>
  )
}
