import { useRef, useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, HerkunftsChip, Input, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  CreateReceiptDtoKind,
  useReceiptControllerList,
  useReceiptControllerSetAssignment,
  useReceiptControllerDelete,
  getReceiptControllerListQueryKey,
  uploadReceiptFile,
  type ReceiptResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { detectDocumentMimeType } from '../../lib/documentOcr'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { ReceiptFileModal } from './ReceiptFileModal'

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

const UPLOADABLE_KINDS: readonly CreateReceiptDtoKind[] = [
  CreateReceiptDtoKind.Sonstiges,
  CreateReceiptDtoKind.Lohnausweis,
  CreateReceiptDtoKind.Rentenbezugsmitteilung,
  CreateReceiptDtoKind.Steuerbescheinigung,
  CreateReceiptDtoKind.Steuerbescheid,
  CreateReceiptDtoKind.Quellensteuer,
  CreateReceiptDtoKind.Pensionskasse,
  CreateReceiptDtoKind.Saeule3a,
  CreateReceiptDtoKind.Krankenkasse,
  CreateReceiptDtoKind.Familienzulage,
]

const YEAR_RE = /^\d{4}$/

export function ReceiptsScreen() {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useReceiptControllerList()
  const setAssignment = useReceiptControllerSetAssignment()
  const deleteReceipt = useReceiptControllerDelete()

  const [previewReceipt, setPreviewReceipt] = useState<{ readonly id: string; readonly fileName: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null)

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
  const open = receipts.filter((b) => b.assignment.kind !== 'zugeordnet').length

  function assign(id: string, taxYear: number, proposalDismissed = false) {
    setAssignment.mutate(
      { id, data: { taxYear, proposalDismissed } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
          }
        },
      },
    )
  }

  async function handleDelete(id: string) {
    setDeleteErrorId(null)
    try {
      const response = await deleteReceipt.mutateAsync({ id })
      if (response.status === 200) {
        setConfirmDeleteId(null)
        if (previewReceipt?.id === id) {
          setPreviewReceipt(null)
        }
        await queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
        return
      }
      setDeleteErrorId(id)
    } catch {
      setDeleteErrorId(id)
    }
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar open={open} />
      <UploadCard
        onUploaded={() => {
          void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
        }}
      />
      <ReceiptFileModal
        receiptId={previewReceipt?.id ?? null}
        {...(previewReceipt?.fileName ? { fileName: previewReceipt.fileName } : {})}
        onClose={() => setPreviewReceipt(null)}
      />
      {receipts.length === 0 ? (
        <Empty />
      ) : (
        receipts.map((receipt) => (
          <ReceiptCard
            key={receipt.id}
            receipt={receipt}
            onAssign={assign}
            onPreview={(r) => setPreviewReceipt({ id: r.id, fileName: r.fileName })}
            confirmingDelete={confirmDeleteId === receipt.id}
            deleting={deleteReceipt.isPending && confirmDeleteId === receipt.id}
            deleteFailed={deleteErrorId === receipt.id}
            onRequestDelete={() => {
              setDeleteErrorId(null)
              setConfirmDeleteId(receipt.id)
            }}
            onCancelDelete={() => {
              setDeleteErrorId(null)
              setConfirmDeleteId(null)
            }}
            onConfirmDelete={() => void handleDelete(receipt.id)}
          />
        ))
      )}
    </ScrollView>
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

function UploadCard({ onUploaded }: { readonly onUploaded: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedKind, setSelectedKind] = useState<CreateReceiptDtoKind>(CreateReceiptDtoKind.Sonstiges)
  const [uploading, setUploading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null)
  const isWeb = typeof document !== 'undefined'

  async function handleFileSelected(file: File | undefined) {
    if (!file) return
    setStatusMessage(null)

    const detectedMime = detectDocumentMimeType(new Uint8Array(0), file.type, file.name)
    if (detectedMime === null) {
      setStatusMessage({ kind: 'error', text: tr('belege.upload.errorUnsupported') })
      return
    }

    setUploading(true)
    try {
      const result = await uploadReceiptFile({
        file,
        fileName: file.name,
        kind: selectedKind,
      })
      if (!result.ok) {
        setStatusMessage({ kind: 'error', text: tr('belege.upload.errorFailed') })
        return
      }
      setStatusMessage({ kind: 'ok', text: tr('belege.upload.success') })
      onUploaded()
    } catch {
      setStatusMessage({ kind: 'error', text: tr('belege.upload.errorFailed') })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Card variant="nacht" style={s.uploadCard} testID="belege-upload-card">
      <Text style={s.uploadHeading}>{tr('belege.upload.heading')}</Text>
      <Text style={s.uploadBody}>{tr('belege.upload.body')}</Text>

      {isWeb && (
        <View style={s.uploadControls}>
          <Text style={s.uploadKindLabel}>{tr('belege.upload.kindLabel')}</Text>
          <select
            aria-label={tr('belege.upload.kindLabel')}
            value={selectedKind}
            onChange={(event) => setSelectedKind(event.target.value as CreateReceiptDtoKind)}
            style={{
              padding: '8px 12px',
              borderRadius: t.radius.s,
              border: `2px solid ${t.color.funkeHell}`,
              backgroundColor: t.color.nachtKarte,
              color: t.color.nachtText,
              fontFamily: t.font.text,
              fontSize: t.size.s,
            }}
          >
            {UPLOADABLE_KINDS.map((kind) => {
              const labelKey = KIND_LABEL_KEYS[kind] ?? 'belege.art.sonstiges'
              return (
                <option key={kind} value={kind}>
                  {tr(labelKey)}
                </option>
              )
            })}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            data-testid="belege-file-input"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              void handleFileSelected(file)
            }}
          />

          <Button
            onPress={() => fileInputRef.current?.click()}
            disabled={uploading}
            testID="belege-upload-cta"
          >
            {uploading ? tr('belege.upload.uploading') : tr('belege.upload.cta')}
          </Button>
        </View>
      )}

      {statusMessage !== null && (
        <Text style={statusMessage.kind === 'ok' ? s.uploadOkText : s.uploadErrText}>{statusMessage.text}</Text>
      )}
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
  readonly onAssign: (id: string, taxYear: number, proposalDismissed?: boolean) => void
  readonly onPreview: (receipt: ReceiptResponseDto) => void
  readonly confirmingDelete: boolean
  readonly deleting: boolean
  readonly deleteFailed: boolean
  readonly onRequestDelete: () => void
  readonly onCancelDelete: () => void
  readonly onConfirmDelete: () => void
}

function ReceiptCard({
  receipt,
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
  const kindKey = receipt.kind === null ? undefined : KIND_LABEL_KEYS[receipt.kind]
  const kindLabel = kindKey !== undefined ? tr(kindKey) : receipt.kind === null ? tr('belege.art.generic') : receipt.kind

  return (
    <Card>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} numberOfLines={2}>
          {receipt.fileName}
        </Text>
        <Chip variant="src">{kindLabel}</Chip>
      </View>
      {receipt.hasFile && <Text style={s.fileBadge}>{tr('belege.upload.fileAttached')}</Text>}
      {(receipt.belegdatum !== null || receipt.zahlungsdatum !== null) && (
        <View style={s.dates}>
          {receipt.belegdatum !== null && (
            <Text style={s.dateLine}>
              {tr('belege.datum.belegdatum')}: <Text style={s.mono}>{receipt.belegdatum}</Text>
            </Text>
          )}
          {receipt.zahlungsdatum !== null && (
            <Text style={s.dateLine}>
              {tr('belege.datum.zahlungsdatum')}: <Text style={s.mono}>{receipt.zahlungsdatum}</Text>
            </Text>
          )}
        </View>
      )}
      <AssignmentSection receipt={receipt} onAssign={onAssign} />

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
        {!confirmingDelete ? (
          <Button
            variant="leise"
            onPress={onRequestDelete}
            style={s.compactButton}
            testID={`receipt-delete-${receipt.id}`}
          >
            {tr('belege.delete.button')}
          </Button>
        ) : (
          <View style={s.deleteConfirmRow}>
            <Text style={s.deleteConfirmText}>{tr('belege.delete.confirmQuestion')}</Text>
            <Button
              onPress={onConfirmDelete}
              disabled={deleting}
              style={s.compactButton}
              testID={`receipt-delete-confirm-${receipt.id}`}
            >
              {deleting ? tr('belege.delete.deleting') : tr('belege.delete.confirmYes')}
            </Button>
            <Button variant="ghost" onPress={onCancelDelete} disabled={deleting} style={s.compactButton}>
              {tr('belege.delete.confirmCancel')}
            </Button>
          </View>
        )}
      </View>
      {deleteFailed && <Text style={s.konfliktBody}>{tr('belege.delete.error')}</Text>}
    </Card>
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
        <Button onPress={() => onAssign(receipt.id, z.proposalYear ?? 0)}>
          {tr('belege.zuordnung.konflikt.resolve', { jahr: z.proposalYear })}
        </Button>
        <Button variant="leise" onPress={() => onAssign(receipt.id, z.taxYear ?? 0, true)}>
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
      </View>
      {!override ? (
        <View style={s.actionRow}>
          <Button onPress={() => onAssign(proposalYear)}>{tr('belege.zuordnung.confirm', { jahr: proposalYear })}</Button>
          <Button variant="ghost" onPress={() => setOverride(true)}>
            {tr('belege.zuordnung.otherYear')}
          </Button>
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

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const appbar: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: t.space.s4,
  }
  const appbarTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
  }
  const uploadCard: ViewStyle = {
    gap: t.space.s3,
    marginBottom: t.space.s3,
  }
  const uploadHeading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
  }
  const uploadBody: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.9,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const uploadControls: ViewStyle = {
    gap: t.space.s2,
  }
  const uploadKindLabel: TextStyle = {
    color: t.color.nachtText,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
  }
  const uploadOkText: TextStyle = {
    color: t.color.funkeHell,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const uploadErrText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const emptyBlock: ViewStyle = { alignItems: 'center', paddingVertical: t.space.s6 }
  const emptyHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    textAlign: 'center',
    marginBottom: t.space.s2,
  }
  const emptyBody: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    textAlign: 'center',
  }
  const cardHead: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space.s3,
  }
  const cardTitle: TextStyle = {
    flex: 1,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const fileBadge: TextStyle = {
    marginTop: t.space.s2,
    color: t.color.ok,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
  }
  const dates: ViewStyle = { marginTop: t.space.s3, gap: t.space.s1 }
  const dateLine: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }
  const mono: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.s, fontVariant: ['tabular-nums'] }
  const assignmentMuted: TextStyle = { color: t.color.tinte2, fontSize: t.size.s, marginTop: t.space.s3 }
  const assignmentSettled: TextStyle = { color: t.color.tinte, fontWeight: t.weight.fett, fontSize: t.size.s, marginTop: t.space.s3 }
  const proposalRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginTop: t.space.s3, flexWrap: 'wrap' }
  const actionRow: ViewStyle = { flexDirection: 'row', gap: t.space.s3, marginTop: t.space.s3, flexWrap: 'wrap' }
  const cardFooter: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    marginTop: t.space.s3,
    flexWrap: 'wrap',
  }
  const compactButton: ViewStyle = {
    width: 'auto',
    minHeight: 40,
    paddingHorizontal: t.space.s4,
  }
  const deleteConfirmRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    flexWrap: 'wrap',
  }
  const deleteConfirmText: TextStyle = {
    color: t.color.warn,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
  }
  const conflictBox: ViewStyle = {
    marginTop: t.space.s3,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s3,
    backgroundColor: t.color.warnWeich,
    gap: t.space.s2,
  }
  const conflictHeading: TextStyle = { color: t.color.warn, fontWeight: t.weight.schwer, fontSize: t.size.s }
  const conflictBody: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }

  return {
    screen,
    wideScreen,
    appbar,
    appbarTitle,
    uploadCard,
    uploadHeading,
    uploadBody,
    uploadControls,
    uploadKindLabel,
    uploadOkText,
    uploadErrText,
    emptyBlock,
    emptyHeading,
    emptyBody,
    cardHead,
    cardTitle,
    fileBadge,
    dates,
    dateLine,
    mono,
    zuordnungMuted: assignmentMuted,
    zuordnungSettled: assignmentSettled,
    vorschlagRow: proposalRow,
    actionRow,
    cardFooter,
    compactButton,
    deleteConfirmRow,
    deleteConfirmText,
    konfliktBox: conflictBox,
    konfliktHeading: conflictHeading,
    konfliktBody: conflictBody,
  }
}
