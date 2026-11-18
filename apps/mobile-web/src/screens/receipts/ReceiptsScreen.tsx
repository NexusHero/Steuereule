import { useState } from 'react'
import { Pressable, ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, HerkunftsChip, Input, Pill, useTheme, useBreakpoint } from '@steuereule/ui'
import {
  CreateReceiptDtoKind,
  useReceiptControllerList,
  useReceiptControllerSetAssignment,
  useReceiptControllerDelete,
  getReceiptControllerListQueryKey,
  type ReceiptResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import { detectDocumentMimeType } from '../../lib/documentOcr'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { triggerSaveErrorHaptic, warnOnHttpError } from '../shared/saveFeedback'
import { ReceiptFileModal } from './ReceiptFileModal'
import { ReceiptHolderSection } from './ReceiptHolderSection'
import { DocumentAssignmentCard } from './DocumentAssignmentCard'
import { ReceiptOutcomeLines } from './ReceiptOutcomeLines'
import { useOptionalSetTaxYear, useOptionalShellTaxYear, useOptionalSwitchToTab } from '../../navigation/ShellState'
import { storedReceiptFile } from '../../lib/receipts/storedReceiptFile'
import { storeReceipt } from '../../lib/receipts/storeReceipt'
import { canReadAgain, filledFieldsByYear, outcomeOfReceipt } from '../../lib/receipts/receiptOutcome'
import { useReceiptReader, type ReceiptReader } from '../../lib/receipts/useReceiptReader'
import { toGermanDate } from '@steuereule/core'
import { DEFAULT_TAX_YEAR } from '../../config/taxYear'
import { makeStyles } from './ReceiptsScreen.styles'

const KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  Lohnausweis: 'belege.art.lohnausweis',
  Quellensteuer: 'belege.art.quellensteuer',
  Pensionskasse: 'belege.art.pensionskasse',
  Saeule3a: 'belege.art.saeule3a',
  Krankenkasse: 'belege.art.krankenkasse',
  Familienzulage: 'belege.art.familienzulage',
  Rentenbezugsmitteilung: 'belege.art.rentenbezugsmitteilung',
  Steuerbescheinigung: 'belege.art.steuerbescheinigung',
  Steuerbescheid: 'belege.art.steuerbescheid',
  Sonstiges: 'belege.art.sonstiges',
}

const YEAR_RE = /^\d{4}$/

export type ReceiptFolderCategory = 'alle' | 'einkuenfte' | 'vorsorge' | 'bescheide' | 'weitere'

export function folderForReceiptKind(kind: ReceiptResponseDto['kind']): Exclude<ReceiptFolderCategory, 'alle'> {
  if (kind === 'Lohnausweis' || kind === 'Quellensteuer' || kind === 'Rentenbezugsmitteilung' || kind === 'Familienzulage') {
    return 'einkuenfte'
  }
  if (kind === 'Pensionskasse' || kind === 'Saeule3a' || kind === 'Krankenkasse') {
    return 'vorsorge'
  }
  if (kind === 'Steuerbescheid' || kind === 'Steuerbescheinigung') {
    return 'bescheide'
  }
  return 'weitere'
}

const FOLDER_LABEL_KEYS = {
  alle: 'belege.ordner.alle',
  einkuenfte: 'belege.ordner.einkuenfte',
  vorsorge: 'belege.ordner.vorsorge',
  bescheide: 'belege.ordner.bescheide',
  weitere: 'belege.ordner.weitere',
} as const satisfies Readonly<Record<ReceiptFolderCategory, string>>

/** „Spenden 3.135 € · Steuerjahr 2025“ for every year a Beleg filled values in. */
function useFilledText(): (receipt: ReceiptResponseDto) => string | null {
  const { t: tr } = useTranslation(APP_NS)
  return (receipt) => {
    const groups = filledFieldsByYear(receipt.filledFields)
    if (groups.length === 0) return null
    return groups.map((g) => tr('belege.stand.gefuelltJahr', { felder: g.values.join(', '), jahr: g.taxYear })).join('; ')
  }
}

export function ReceiptsScreen() {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useReceiptControllerList()
  const setAssignment = useReceiptControllerSetAssignment()
  const deleteReceipt = useReceiptControllerDelete()
  const openYear = useOptionalShellTaxYear() ?? DEFAULT_TAX_YEAR
  // Every Beleg is read after its upload (ADR-0097 §4): the reader keeps each one's progress and question.
  const reader = useReceiptReader({ taxYear: openYear })

  const [previewReceipt, setPreviewReceipt] = useState<{ readonly id: string; readonly fileName: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null)
  const [deleteResult, setDeleteResult] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<ReceiptFolderCategory>('alle')

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('belege.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('belege.loadError.heading')}
        message={tr('belege.loadError.message')}
        retryLabel={tr('belege.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const receipts = query.data.data
  // „Offen“ is what is not fully processed yet (ADR-0097 §1), no longer what has no year.
  const open = receipts.filter((b) => b.processing.open).length
  const visibleReceipts =
    activeFolder === 'alle'
      ? receipts
      : receipts.filter((r) => folderForReceiptKind(r.kind) === activeFolder)

  // Proposals that only wait for a yes: one tap takes them all (a conflict stays the user's own decision).
  const proposals = receipts.flatMap((r) =>
    r.assignment.kind === 'vorgeschlagen' && typeof r.assignment.taxYear === 'number' ? [{ id: r.id, taxYear: r.assignment.taxYear }] : [],
  )

  function assign(id: string, taxYear: number, proposalDismissed = false) {
    setAssignment.mutate(
      { id, data: { taxYear, proposalDismissed } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
          } else {
            warnOnHttpError(response.status)
          }
        },
        onError: triggerSaveErrorHaptic,
      },
    )
  }

  async function handleDelete(receipt: ReceiptResponseDto, takeBackValues: boolean) {
    const id = receipt.id
    setDeleteErrorId(null)
    setDeleteResult(null)
    try {
      const response = await deleteReceipt.mutateAsync({ id, params: { takeBackValues } })
      if (response.status === 200) {
        setConfirmDeleteId(null)
        if (previewReceipt?.id === id) {
          setPreviewReceipt(null)
        }
        setDeleteResult(deleteResultText(receipt, takeBackValues, response.data))
        await queryClient.invalidateQueries()
        return
      }
      triggerSaveErrorHaptic()
      setDeleteErrorId(id)
    } catch {
      triggerSaveErrorHaptic()
      setDeleteErrorId(id)
    }
  }

  /** What the delete did, honestly: how many values went, how many drafts were withdrawn, what stays. */
  function deleteResultText(receipt: ReceiptResponseDto, takeBackValues: boolean, data: { readonly takenBack?: number; readonly withdrawn?: number }): string {
    const hadValues = receipt.filledFields.length > 0 || receipt.processing.pending > 0
    if (!hadValues) return tr('belege.delete.ergebnis.geloescht', { datei: receipt.fileName })
    if (!takeBackValues) return tr('belege.delete.ergebnis.werteBleiben', { datei: receipt.fileName })
    const takenBack = data.takenBack ?? 0
    const withdrawn = data.withdrawn ?? 0
    const parts = [
      tr('belege.delete.ergebnis.geloescht', { datei: receipt.fileName }),
      ...(takenBack > 0 ? [tr('belege.delete.ergebnis.entfernt', { count: takenBack })] : []),
      ...(withdrawn > 0 ? [tr('belege.delete.ergebnis.zurueckgezogen', { count: withdrawn })] : []),
    ]
    const changedSince = takenBack < receipt.filledFields.length
    return [parts.join(' · '), ...(changedSince ? [tr('belege.delete.ergebnis.geaendert')] : [])].join(' ')
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar open={open} />
      <UploadCard reader={reader} />
      {deleteResult !== null ? (
        <Text style={styles.deleteResultText} accessibilityLiveRegion="polite" testID="belege-delete-ergebnis">
          {deleteResult}
        </Text>
      ) : null}
      {proposals.length > 1 ? (
        <View style={styles.bulkRow} testID="belege-sammel-zuordnung">
          <Text style={styles.bulkText}>{tr('belege.sammel.text', { count: proposals.length })}</Text>
          <Button
            onPress={() => {
              for (const proposal of proposals) assign(proposal.id, proposal.taxYear)
            }}
            disabled={setAssignment.isPending}
            style={styles.compactButton}
            testID="belege-alle-zuordnen"
          >
            {tr('belege.sammel.cta', { count: proposals.length })}
          </Button>
        </View>
      ) : null}
      {receipts.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.folderScroll}
          contentContainerStyle={styles.folderRow}
          testID="belege-ordner-filter"
        >
          {(['alle', 'einkuenfte', 'vorsorge', 'bescheide', 'weitere'] as const).map((folder) => {
            const count =
              folder === 'alle'
                ? receipts.length
                : receipts.filter((r) => folderForReceiptKind(r.kind) === folder).length
            return (
              <Chip
                key={folder}
                active={activeFolder === folder}
                onPress={() => setActiveFolder(folder)}
                testID={`belege-ordner-${folder}`}
              >
                {`${tr(FOLDER_LABEL_KEYS[folder])} (${count})`}
              </Chip>
            )
          })}
        </ScrollView>
      ) : null}
      <ReceiptFileModal
        receiptId={previewReceipt?.id ?? null}
        {...(previewReceipt?.fileName ? { fileName: previewReceipt.fileName } : {})}
        onClose={() => setPreviewReceipt(null)}
      />
      {receipts.length === 0 ? (
        <Empty />
      ) : (
        visibleReceipts.map((receipt) => (
          <ReceiptCard
            key={receipt.id}
            receipt={receipt}
            reader={reader}
            openYear={openYear}
            onAssign={assign}
            onPreview={(r) => setPreviewReceipt({ id: r.id, fileName: r.fileName })}
            confirmingDelete={confirmDeleteId === receipt.id}
            deleting={deleteReceipt.isPending && confirmDeleteId === receipt.id}
            deleteFailed={deleteErrorId === receipt.id}
            onRequestDelete={() => {
              setDeleteErrorId(null)
              setDeleteResult(null)
              setConfirmDeleteId(receipt.id)
            }}
            onCancelDelete={() => {
              setDeleteErrorId(null)
              setConfirmDeleteId(null)
            }}
            onConfirmDelete={(takeBackValues) => void handleDelete(receipt, takeBackValues)}
          />
        ))
      )}
    </ScrollView>
  )
}

/** Stores a file in the Belege inbox; the caller reads it right after (ADR-0097 §4). Null when it could not be stored. */
/** The tax assessment has its own kind and folder: a quiet second way in, inside the upload bar. */
function BescheidPicker({ reader }: { readonly reader: ReceiptReader }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null)
  const isWeb = typeof document !== 'undefined'

  async function handleBescheidFile(file: File | undefined) {
    if (!file) return
    setCheckResult(null)
    const detectedMime = detectDocumentMimeType(new Uint8Array(0), file.type, file.name)
    if (detectedMime === null) {
      triggerSaveErrorHaptic()
      setCheckResult({ kind: 'error', text: tr('belege.upload.errorUnsupported') })
      return
    }
    setChecking(true)
    try {
      const stored = await storeReceipt(file, CreateReceiptDtoKind.Steuerbescheid)
      if (stored === null) {
        triggerSaveErrorHaptic()
        setCheckResult({ kind: 'error', text: tr('belege.upload.errorFailed') })
        return
      }
      void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
      // The same pipeline as every other upload: what the reading found shows on the Beleg's card.
      await reader.read(stored.id, file, stored.id)
      setCheckResult({ kind: 'ok', text: tr('belege.bescheid.gespeichert', { datei: file.name }) })
    } finally {
      setChecking(false)
    }
  }

  return (
    <View style={{ gap: t.space.s2, alignItems: 'flex-start' }} testID="belege-bescheid-check-card">
      {isWeb ? (
        <ReceiptPickerButton
          onFile={(file) => void handleBescheidFile(file)}
          disabled={checking}
          variant="leise"
          testID="belege-bescheid-upload-cta"
          inputTestID="belege-bescheid-file-input"
        >
          {checking ? tr('belege.upload.uploading') : tr('belege.bescheid.cta')}
        </ReceiptPickerButton>
      ) : null}
      {checkResult !== null ? (
        <Text
          style={{ ...t.type.small, color: checkResult.kind === 'ok' ? t.color.funkeHell : t.color.warn }}
          accessibilityLiveRegion="polite"
          testID="belege-bescheid-check-status"
        >
          {checkResult.text}
        </Text>
      ) : null}
    </View>
  )
}

function Appbar({ open }: { readonly open: number }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <View style={s.appbar}>
      <Text style={s.appbarTitle}>{tr('belege.appbarTitle')}</Text>
      <Pill>{tr('belege.offen', { count: open })}</Pill>
    </View>
  )
}

/**
 * One way in for every document: no kind to pick, the reading recognises it (ADR-0097 §4). Each file is
 * stored, then read with its drafts staged, like a chat upload; the card of the Beleg says what came of it.
 */
function UploadCard({ reader }: { readonly reader: ReceiptReader }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null)
  const isWeb = typeof document !== 'undefined'

  async function handleFileSelected(file: File | undefined) {
    if (!file) return
    setStatusMessage(null)

    const detectedMime = detectDocumentMimeType(new Uint8Array(0), file.type, file.name)
    if (detectedMime === null) {
      triggerSaveErrorHaptic()
      setStatusMessage({ kind: 'error', text: tr('belege.upload.errorUnsupported') })
      return
    }

    setUploading(true)
    const stored = await storeReceipt(file, CreateReceiptDtoKind.Sonstiges)
    setUploading(false)
    if (stored === null) {
      triggerSaveErrorHaptic()
      setStatusMessage({ kind: 'error', text: tr('belege.upload.errorFailed') })
      return
    }
    setStatusMessage({ kind: 'ok', text: tr('belege.upload.success') })
    void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
    await reader.read(stored.id, file, stored.id)
  }

  return (
    <Card variant="nacht" style={s.uploadCard} testID="belege-upload-card">
      <Text style={s.uploadHeading}>{tr('belege.upload.heading')}</Text>

      {isWeb && (
        <View style={s.uploadControls}>
          <ReceiptPickerButton
            onFile={(file) => void handleFileSelected(file)}
            disabled={uploading}
            testID="belege-upload-cta"
            inputTestID="belege-file-input"
          >
            {uploading ? tr('belege.upload.uploading') : tr('belege.upload.cta')}
          </ReceiptPickerButton>
        </View>
      )}

      {statusMessage !== null && (
        <Text style={statusMessage.kind === 'ok' ? s.uploadOkText : s.uploadErrText} accessibilityLiveRegion="polite">
          {statusMessage.text}
        </Text>
      )}
      <BescheidPicker reader={reader} />
    </Card>
  )
}

function Empty() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <View style={s.emptyBlock}>
      <Text style={s.emptyHeading}>{tr('belege.empty.heading')}</Text>
      <Text style={s.emptyBody}>{tr('belege.empty.message')}</Text>
    </View>
  )
}

interface ReceiptCardProps {
  readonly receipt: ReceiptResponseDto
  readonly reader: ReceiptReader
  readonly openYear: number
  readonly onAssign: (id: string, taxYear: number, proposalDismissed?: boolean) => void
  readonly onPreview: (receipt: ReceiptResponseDto) => void
  readonly confirmingDelete: boolean
  readonly deleting: boolean
  readonly deleteFailed: boolean
  readonly onRequestDelete: () => void
  readonly onCancelDelete: () => void
  readonly onConfirmDelete: (takeBackValues: boolean) => void
}

function ReceiptCard({
  receipt,
  reader,
  openYear,
  onAssign,
  onPreview,
  confirmingDelete,
  deleting,
  deleteFailed,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: ReceiptCardProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const shellYear = useOptionalShellTaxYear()
  const holderYear = receipt.holderTaxYear ?? shellYear ?? (receipt.assignment.kind === 'zugeordnet' ? receipt.assignment.taxYear : null) ?? DEFAULT_TAX_YEAR
  const kindKey = receipt.kind === null ? undefined : KIND_LABEL_KEYS[receipt.kind]
  const kindLabel = kindKey !== undefined ? tr(kindKey) : receipt.kind === null ? tr('belege.art.generic') : receipt.kind
  const folderCategory = folderForReceiptKind(receipt.kind)
  // The folder shows the year the Beleg belongs to: the one it is assigned to, else the one its drafts went to.
  const folderYear = (receipt.assignment.kind === 'zugeordnet' ? receipt.assignment.taxYear : null) ?? receipt.processing.draftsTaxYear ?? holderYear
  // A Beleg with nothing for the return needs no year (ADR-0097): the assignment line would only add noise.
  const needsYear = receipt.processing.state !== 'nichts_verwertbar' && receipt.processing.state !== 'verworfen'
  const switchToTab = useOptionalSwitchToTab()
  const setTaxYear = useOptionalSetTaxYear()
  const filledText = useFilledText()
  const [fileMissing, setFileMissing] = useState(false)
  const entry = reader.entries[receipt.id]
  const reading = entry?.phase != null
  const outcome = outcomeOfReceipt(receipt)
  const filled = filledText(receipt)
  const hasValues = receipt.filledFields.length > 0 || receipt.processing.pending > 0

  // Reads the stored original again on the device, here in the tab; its drafts wait in the owl.
  async function readAgain() {
    setFileMissing(false)
    const file = await storedReceiptFile(receipt)
    if (file === null) {
      setFileMissing(true)
      return
    }
    await reader.read(receipt.id, file, receipt.id)
  }

  function openDrafts() {
    if (outcome.draftsTaxYear !== null && outcome.draftsTaxYear !== openYear) setTaxYear?.(outcome.draftsTaxYear)
    switchToTab?.('Owl')
  }

  return (
    <Card style={s.receiptCard}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} numberOfLines={2}>
          {receipt.fileName}
        </Text>
        <Chip variant="src">{kindLabel}</Chip>
      </View>
      {/* One wrapped line of facts instead of a block each: folder, stored original, the two dates. */}
      <View style={s.metaRow}>
        <Text style={s.metaText} testID={`receipt-folder-${receipt.id}`}>
          {`${folderYear} / ${tr(FOLDER_LABEL_KEYS[folderCategory])}`}
        </Text>
        {receipt.belegdatum !== null && (
          <Text style={s.metaText}>
            {tr('belege.datum.belegdatum')}: <Text style={s.metaMono}>{toGermanDate(receipt.belegdatum) ?? receipt.belegdatum}</Text>
          </Text>
        )}
        {receipt.zahlungsdatum !== null && (
          <Text style={s.metaText}>
            {tr('belege.datum.zahlungsdatum')}: <Text style={s.metaMono}>{toGermanDate(receipt.zahlungsdatum) ?? receipt.zahlungsdatum}</Text>
          </Text>
        )}
        {receipt.hasFile && <Text style={s.fileBadge}>{tr('belege.upload.fileAttached')}</Text>}
      </View>
      {/* What became of the Beleg (ADR-0097): from the server's state, never from a guess in the app. */}
      {reading ? (
        <Text style={s.processingText} accessibilityLiveRegion="polite" testID={`receipt-${receipt.id}-liest`}>
          {tr('belege.stand.liest')}
        </Text>
      ) : (
        <ReceiptOutcomeLines
          outcome={outcome}
          openYear={openYear}
          testIDPrefix={`receipt-${receipt.id}`}
          asking={entry?.question != null}
          onSwitchYear={setTaxYear ?? undefined}
          onOpenDrafts={switchToTab ? openDrafts : undefined}
        />
      )}
      {filled !== null ? (
        <Text style={s.filledText} testID={`receipt-${receipt.id}-gefuellt`}>
          {tr('belege.stand.gefuellt', { werte: filled })}
        </Text>
      ) : null}
      {entry?.question != null ? (
        <View testID={`receipt-${receipt.id}-zuordnung`}>
          <DocumentAssignmentCard
            question={entry.question.question}
            printed={entry.question.printed}
            busy={reading}
            error={entry.error}
            onChoose={(holder) => void reader.choose(receipt.id, holder)}
            onCreate={(role, details) => void reader.create(receipt.id, role, details)}
            onConfirmSelf={(takeName) => void reader.confirmSelf(receipt.id, takeName)}
          />
        </View>
      ) : null}
      {needsYear ? <AssignmentSection receipt={receipt} onAssign={onAssign} /> : null}
      <ReceiptHolderSection receipt={receipt} taxYear={holderYear} />

      <View style={s.cardFooter}>
        {receipt.hasFile && (
          <Button
            variant="ghost"
            onPress={() => onPreview(receipt)}
            style={s.compactButton}
            testID={`receipt-preview-${receipt.id}`}
          >
            {tr('belege.preview.open')}
          </Button>
        )}
        {receipt.hasFile && canReadAgain(outcome) && entry?.question == null ? (
          <Button
            variant="ghost"
            onPress={() => void readAgain()}
            disabled={reading}
            style={s.compactButton}
            testID={`receipt-eule-${receipt.id}`}
          >
            {tr(reading ? 'belege.eule.liest' : 'belege.eule.lesen')}
          </Button>
        ) : null}
        {!confirmingDelete ? (
          <Button
            variant="leise"
            onPress={onRequestDelete}
            style={s.compactButton}
            testID={`receipt-delete-${receipt.id}`}
          >
            {tr('belege.delete.button')}
          </Button>
        ) : null}
      </View>
      {confirmingDelete ? (
        <DeleteConfirm receipt={receipt} filled={filled} hasValues={hasValues} deleting={deleting} onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
      ) : null}
      {fileMissing && (
        <Text style={s.konfliktBody} accessibilityLiveRegion="polite" testID={`receipt-eule-fehler-${receipt.id}`}>
          {tr('belege.eule.ergebnis.unreadable')}
        </Text>
      )}
      {deleteFailed && <Text style={s.konfliktBody}>{tr('belege.delete.error')}</Text>}
    </Card>
  )
}

/**
 * Deleting a Beleg that filled values (ADR-0097 §6): the app names them and asks whether they go too,
 * „ja“ first. A Beleg without values keeps the plain two-step confirmation.
 */
function DeleteConfirm({
  receipt,
  filled,
  hasValues,
  deleting,
  onConfirm,
  onCancel,
}: {
  readonly receipt: ReceiptResponseDto
  readonly filled: string | null
  readonly hasValues: boolean
  readonly deleting: boolean
  readonly onConfirm: (takeBackValues: boolean) => void
  readonly onCancel: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const pending = receipt.processing.pending
  if (!hasValues) {
    return (
      <View style={s.deleteConfirmRow}>
        <Text style={s.deleteConfirmText}>{tr('belege.delete.confirmQuestion')}</Text>
        <Button onPress={() => onConfirm(false)} disabled={deleting} style={s.compactButton} testID={`receipt-delete-confirm-${receipt.id}`}>
          {deleting ? tr('belege.delete.deleting') : tr('belege.delete.confirmYes')}
        </Button>
        <Button variant="ghost" onPress={onCancel} disabled={deleting} style={s.compactButton}>
          {tr('belege.delete.confirmCancel')}
        </Button>
      </View>
    )
  }
  const question =
    filled !== null
      ? [tr('belege.delete.mitWerten', { werte: filled }), ...(pending > 0 ? [tr('belege.delete.auchVorschlaege', { count: pending })] : [])].join(' ')
      : tr('belege.delete.mitVorschlaegen', { count: pending })
  return (
    <View style={s.deleteConfirmBlock} testID={`receipt-delete-frage-${receipt.id}`}>
      <Text style={s.deleteConfirmText}>{question}</Text>
      <View style={s.deleteConfirmRow}>
        <Button onPress={() => onConfirm(true)} disabled={deleting} style={s.compactButton} testID={`receipt-delete-werte-${receipt.id}`}>
          {deleting ? tr('belege.delete.deleting') : tr('belege.delete.werteEntfernen')}
        </Button>
        <Button variant="leise" onPress={() => onConfirm(false)} disabled={deleting} style={s.compactButton} testID={`receipt-delete-nur-beleg-${receipt.id}`}>
          {tr('belege.delete.nurBeleg')}
        </Button>
        <Button variant="ghost" onPress={onCancel} disabled={deleting} style={s.compactButton}>
          {tr('belege.delete.confirmCancel')}
        </Button>
      </View>
    </View>
  )
}

function AssignmentSection({
  receipt,
  onAssign,
}: {
  readonly receipt: ReceiptResponseDto
  readonly onAssign: (id: string, taxYear: number, proposalDismissed?: boolean) => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const z = receipt.assignment

  if (z.kind === 'ungebunden') {
    return <Text style={s.zuordnungMuted}>{tr('belege.zuordnung.ungebunden')}</Text>
  }
  if (z.kind === 'zugeordnet') {
    return <Text style={s.zuordnungSettled}>{tr('belege.zuordnung.zugeordnet', { jahr: z.taxYear })}</Text>
  }
  if (z.kind === 'vorgeschlagen') {
    return (
      <Proposed
        proposalYear={z.taxYear ?? 0}
        provenance={z.provenance ?? 'zahlungsdatum'}
        onAssign={(year) => onAssign(receipt.id, year)}
      />
    )
  }
  return (
    <View style={s.konfliktBox}>
      <Text style={s.konfliktHeading}>{tr('belege.zuordnung.konflikt.heading')}</Text>
      <Text style={s.konfliktBody}>
        {tr('belege.zuordnung.konflikt.body', { zugeordnet: z.taxYear, vorschlag: z.proposalYear })}
      </Text>
      <View style={s.actionRow}>
        <Button style={s.compactButton} onPress={() => onAssign(receipt.id, z.proposalYear ?? 0)}>
          {tr('belege.zuordnung.konflikt.resolve', { jahr: z.proposalYear })}
        </Button>
        <Button variant="leise" style={s.compactButton} onPress={() => onAssign(receipt.id, z.taxYear ?? 0, true)}>
          {tr('belege.zuordnung.konflikt.keep', { jahr: z.taxYear })}
        </Button>
      </View>
    </View>
  )
}

interface ProposedProps {
  readonly proposalYear: number
  readonly provenance: 'zahlungsdatum' | 'belegdatum'
  readonly onAssign: (year: number) => void
}

function Proposed({ proposalYear, provenance, onAssign }: ProposedProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [override, setOverride] = useState(false)
  const [yearText, setYearText] = useState(String(proposalYear))
  const year = Number.parseInt(yearText, 10)
  const yearValid = YEAR_RE.test(yearText) && Number.isInteger(year)

  return (
    <View>
      <View style={s.vorschlagRow}>
        <Text style={s.zuordnungMuted}>{tr('belege.zuordnung.vorgeschlagen', { jahr: proposalYear })}</Text>
        <HerkunftsChip
          source={{ rule: provenance === 'zahlungsdatum' ? tr('belege.zuordnung.regelZahlungsdatum') : tr('belege.zuordnung.regelBelegdatum') }}
        />
        {/* The rare way out is a quiet link beside the proposal, so the one-tap yes keeps its own line. */}
        {!override ? (
          <Pressable accessibilityRole="button" onPress={() => setOverride(true)} hitSlop={12} style={s.inlineLink}>
            <Text style={s.inlineLinkText}>{tr('belege.zuordnung.otherYear')}</Text>
          </Pressable>
        ) : null}
      </View>
      {!override ? (
        <View style={s.actionRow}>
          <Button style={s.compactButton} onPress={() => onAssign(proposalYear)}>{tr('belege.zuordnung.confirm', { jahr: proposalYear })}</Button>
        </View>
      ) : (
        <View>
          <Input
            type="numeric"
            mono
            accessibilityLabel={tr('belege.zuordnung.otherYearLabel')}
            value={yearText}
            onChange={setYearText}
          />
          {!yearValid && <Text style={s.konfliktBody}>{tr('belege.zuordnung.yearInvalid')}</Text>}
          <View style={s.actionRow}>
            <Button
              disabled={!yearValid}
              onPress={() => {
                if (yearValid) onAssign(year)
              }}
            >
              {tr('belege.zuordnung.otherYearConfirm')}
            </Button>
            <Button variant="ghost" onPress={() => setOverride(false)}>
              {tr('belege.zuordnung.otherYearCancel')}
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
