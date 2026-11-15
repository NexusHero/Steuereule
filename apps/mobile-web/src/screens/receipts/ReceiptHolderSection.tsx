import { useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchReceiptFileBlob,
  getReceiptControllerListQueryKey,
  receiptParseControllerReassign,
  useChildrenControllerList,
  useLinkControllerGet,
  useProfileControllerGetProfile,
  type AssignmentPersonDto,
  type ReceiptResponseDto,
} from '@steuereule/api-client'
import { Button, Chip, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { extractDocumentTextOnDevice } from '../../lib/documentOcr'
import { holderTestId } from '../../lib/receipts/documentAssignment'
import { useHolderLabel, useHolderName } from './DocumentAssignmentCard'

/** The household of a year as the assignment shows it: A, B in a joint return, the children. */
export function useHouseholdPeople(taxYear: number): AssignmentPersonDto[] {
  const profile = useProfileControllerGetProfile({ query: { retry: false } })
  const link = useLinkControllerGet(taxYear, { query: { retry: false } })
  const children = useChildrenControllerList(taxYear, { query: { retry: false } })
  const own = profile.data?.status === 200 ? ((profile.data.data as { firstName?: string | null }).firstName ?? null) : null
  const linkData = link.data?.status === 200 ? link.data.data : null
  const kinder = children.data?.status === 200 ? children.data.data.kinder : []
  return [
    { holder: 'A', name: own || null },
    ...(linkData?.filingType === 'zusammen' && linkData.personBUserId ? [{ holder: 'B', name: linkData.personB?.firstName || null }] : []),
    ...kinder.map((k) => ({ holder: `kind:${k.id}`, name: k.firstName || null })),
  ]
}

type Outcome = { readonly kind: 'moved'; readonly text: string } | { readonly kind: 'failed' }

/**
 * „für: <Name>“ on every document (ADR-0092 §4). One tap lets the user give it to another person of the
 * household; what came from it moves along — taken back at the person before, read again on the device
 * and written for the new one (the server asks „zusätzlich oder ersetzen?“ where something is there).
 */
export function ReceiptHolderSection({ receipt, taxYear }: { readonly receipt: ReceiptResponseDto; readonly taxYear: number }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const people = useHouseholdPeople(receipt.holderTaxYear ?? taxYear)
  const label = useHolderLabel()
  const name = useHolderName()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const year = receipt.holderTaxYear ?? taxYear
  const current = receipt.holders[0] ?? null
  const holder = current === null ? null : (people.find((p) => p.holder === current) ?? { holder: current, name: null })
  const names = [holder, ...receipt.holders.slice(1).map((ref) => people.find((p) => p.holder === ref) ?? { holder: ref, name: null })]
    .filter((p): p is AssignmentPersonDto => p !== null)
    .map(name)
    .join(', ')

  async function readOnDevice(): Promise<{ rawText: string; textSource: 'pdf_text' | 'ocr' } | null> {
    if (!receipt.hasFile) return null
    try {
      const res = await fetchReceiptFileBlob(receipt.id)
      if (!res.ok) return null
      const file = new File([res.blob], receipt.fileName, { type: res.mimeType })
      const extracted = await extractDocumentTextOnDevice(file, { fileName: receipt.fileName, mimeType: res.mimeType })
      return extracted.text.trim() ? { rawText: extracted.text, textSource: extracted.kind === 'pdf' && !extracted.usedOcrFallback ? 'pdf_text' : 'ocr' } : null
    } catch {
      return null
    }
  }

  async function give(to: AssignmentPersonDto) {
    setBusy(true)
    setOutcome(null)
    try {
      const text = await readOnDevice()
      const res = await receiptParseControllerReassign(receipt.id, { taxYear: year, holder: to.holder, ...text })
      if (res.status !== 200) {
        setOutcome({ kind: 'failed' })
        return
      }
      const moved = tr('belegZuordnung.umgehaengt', { name: name(to), applied: res.data.applied, takenBack: res.data.takenBack })
      const waiting = res.data.waiting > 0 ? ` ${tr('belegZuordnung.umgehaengtWartet', { waiting: res.data.waiting })}` : ''
      setOutcome({ kind: 'moved', text: moved + waiting })
      setPicking(false)
      await queryClient.invalidateQueries()
      void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
    } catch {
      setOutcome({ kind: 'failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.section}>
      <View style={s.row}>
        <Chip active={picking} onPress={() => setPicking((v) => !v)} testID={`beleg-inhaber-${receipt.id}`}>
          {holder === null ? tr('belegZuordnung.offen') : tr('belegZuordnung.fuer', { name: names })}
        </Chip>
        <Text style={s.hint}>{tr('belegZuordnung.aendern')}</Text>
      </View>
      {picking ? (
        <View style={s.row}>
          {people
            .filter((p) => p.holder !== current)
            .map((p) => (
              <Button key={p.holder} variant="leise" disabled={busy} onPress={() => void give(p)} testID={`beleg-inhaber-wahl-${receipt.id}-${holderTestId(p.holder)}`}>
                {label(p)}
              </Button>
            ))}
        </View>
      ) : null}
      {busy ? <Text style={s.hint}>{tr('belegZuordnung.lesen')}</Text> : null}
      {outcome !== null ? (
        <Text style={outcome.kind === 'failed' ? s.error : s.hint} testID={`beleg-inhaber-ergebnis-${receipt.id}`}>
          {outcome.kind === 'failed' ? tr('belegZuordnung.fehler') : outcome.text}
        </Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const section: ViewStyle = { gap: t.space.s2, marginTop: t.space.s2 }
  const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, alignItems: 'center' }
  const hint: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const error: TextStyle = { ...t.type.small, color: t.color.warn }
  return { section, row, hint, error }
}
