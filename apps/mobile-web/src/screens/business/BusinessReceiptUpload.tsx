import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { declaresSelfEmployment, useSelfEmploymentCapability } from './useSelfEmployment'
import {
  advisorControllerApplyAction,
  advisorControllerUndoAction,
  useInterviewControllerGetInterview,
} from '@steuereule/api-client'
import type { AdvisorActionProposal } from '@steuereule/core'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { captureReceipt } from '../../lib/receipts/captureReceipt'
import { uploadBusinessReceipt } from '../../lib/receipts/uploadBusinessReceipt'
import { BUSINESS_RECEIPT_ACCEPT, ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import { BookingDraftCard } from '../advisor/chat/BookingDraftCard'
import { makeStyles } from '../advisor/AdvisorChatPanel.styles'
import { problemOf } from './businessKit'
import { useRefreshBusiness } from './useBusiness'

type Direction = 'ausgabe' | 'einnahme'

/**
 * A receipt of the business (ADR-0101 §6): the direction is chosen, the file goes through the one receipt pipeline
 * (ADR-0097), and what comes out is a booking draft shown as a booking, taken over or not by the user.
 * `onlyForSelfEmployed` hides it where the user has no self-employment (the Belege tab).
 */
export function BusinessReceiptUpload({ taxYear, business = 1, onlyForSelfEmployed = false }: { readonly taxYear: number; readonly business?: number; readonly onlyForSelfEmployed?: boolean }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const capability = useSelfEmploymentCapability()
  const interview = useInterviewControllerGetInterview(taxYear, undefined, { query: { enabled: onlyForSelfEmployed } })
  const refresh = useRefreshBusiness(taxYear)
  const [direction, setDirection] = useState<Direction>('ausgabe')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<AdvisorActionProposal | null>(null)

  if (onlyForSelfEmployed) {
    const answers = interview.data?.status === 200 ? interview.data.data.answers : {}
    if (!capability.enabled || !declaresSelfEmployment(answers)) return null
  }

  async function take(file: File) {
    setBusy(true)
    setMessage(null)
    setDraft(null)
    const result = await captureReceipt(file, { taxYear, kind: 'geschaeftsbeleg', direction, business, deps: { upload: uploadBusinessReceipt(direction) } })
    setBusy(false)
    if (!result.ok) return setMessage(tr('business.beleg.fehler'))
    const staged = result.response.stagedAction
    if (staged === undefined || staged === null) return setMessage(result.response.assistantMessage?.content ?? tr('business.beleg.keinEntwurf'))
    setDraft(staged as unknown as AdvisorActionProposal)
  }

  async function run(call: typeof advisorControllerApplyAction, status: 'applied' | 'pending', actionId: string) {
    const response = await call(taxYear, actionId)
    if (response.status !== 200) throw new Error(problemOf(response).message ?? tr('business.speichernFehler'))
    setDraft((d) => (d === null ? d : { ...d, status }))
    refresh()
  }

  return (
    <View testID="beleg-geschaeft">
      <Text style={{ ...t.type.itemTitle, color: t.color.tinte, marginBottom: t.space.s2 }}>{tr('business.beleg.titel')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s3 }}>
        {(['ausgabe', 'einnahme'] as const).map((d) => (
          <Choice key={d} selected={direction === d} onPress={() => setDirection(d)} testID={`beleg-richtung-${d}`}>
            {tr(`business.beleg.richtung.${d}`)}
          </Choice>
        ))}
      </View>
      <ReceiptPickerButton accept={BUSINESS_RECEIPT_ACCEPT} onFile={(file) => void take(file)} disabled={busy} testID="beleg-geschaeft-datei" unsupportedHint={tr('business.bank.nurWeb')}>
        {busy ? tr('business.beleg.liest') : tr('business.beleg.hochladen')}
      </ReceiptPickerButton>
      {message !== null ? (
        <Text style={{ ...t.type.small, color: t.color.tinte2, marginTop: t.space.s2 }} testID="beleg-geschaeft-hinweis">
          {message}
        </Text>
      ) : null}
      {draft !== null ? (
        <BookingDraftCard
          action={draft}
          styles={styles}
          onApply={(id) => run(advisorControllerApplyAction, 'applied', id)}
          onUndo={(id) => run(advisorControllerUndoAction, 'pending', id)}
        />
      ) : null}
    </View>
  )
}

