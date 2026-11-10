import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Card, OwlGlyph, useTheme, type UiTheme } from '@steuereule/ui'
import {
  evaluateAdvisorTurn,
  type AdvisorChatMessageView,
  type CaseDigest,
  type Screen,
} from '@steuereule/core'
import {
  getAdvisorControllerGetSessionQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getLstbControllerGetLstbQueryKey,
  getChSalaryCertificateControllerGetQueryKey,
  getCapitalControllerGetQueryKey,
  getRentalControllerGetQueryKey,
  getChildrenControllerListQueryKey,
  getCommuteControllerGetQueryKey,
  getConfirmationControllerGetQueryKey,
  useAdvisorControllerGetSession,
  useAdvisorControllerSendMessage,
  useAdvisorControllerApplyAction,
  useAdvisorControllerUndoAction,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { AdvisorChatPanel, sendOptionsToDto, type ChatSendOptions } from './AdvisorChatPanel'
import { useOptionalCopilotBridge } from './CopilotBridgeProvider'

export interface InMaskAdvisorCompanionProps {
  readonly screen: Screen
  readonly taxYear?: number | undefined
  readonly title?: string | undefined
}

type QuickChipKey =
  | 'homeofficeCheck'
  | 'trainingTravel'
  | 'workEquipment'
  | 'healthInsuranceCh'
  | 'homeofficeLumpSum'
  | 'finalReview'
  | 'priorDonations'
  | 'childcareCosts'

const SCREEN_QUICK_CHIP_KEYS: Readonly<Partial<Record<Screen, readonly QuickChipKey[]>>> = {
  lstb: ['homeofficeCheck', 'trainingTravel', 'workEquipment'],
  chLohnausweis: ['healthInsuranceCh', 'homeofficeLumpSum', 'finalReview'],
  interview: ['homeofficeCheck', 'trainingTravel', 'priorDonations'],
  kind: ['childcareCosts', 'priorDonations', 'finalReview'],
  vermietung: ['homeofficeCheck', 'finalReview'],
  kapital: ['priorDonations', 'finalReview'],
}

const DEFAULT_FALLBACK_DIGEST: CaseDigest = {
  taxYear: CURRENT_TAX_YEAR,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: 55000, wageTaxEur: 9500, socialSecurityEur: 10500 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 15,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: 450,
}

export function InMaskAdvisorCompanion({
  screen,
  taxYear = CURRENT_TAX_YEAR,
  title,
}: InMaskAdvisorCompanionProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const bridge = useOptionalCopilotBridge()
  const insideOwlWorkspace = bridge?.insideOwlWorkspace ?? false
  const [open, setOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<readonly AdvisorChatMessageView[]>([])
  const queryClient = useQueryClient()
  const resolvedTitle = title ?? tr('advisor.companion.triggerTitle', 'Eule zu dieser Maske fragen')

  const chipKeys = SCREEN_QUICK_CHIP_KEYS[screen] ?? SCREEN_QUICK_CHIP_KEYS.interview ?? []
  const quickChips = chipKeys.map((key) => tr(`advisor.companion.chips.${key}`))

  const sessionQuery = useAdvisorControllerGetSession(taxYear, {
    query: { enabled: open && !insideOwlWorkspace, retry: false },
  })
  const sendMutation = useAdvisorControllerSendMessage()
  const applyMutation = useAdvisorControllerApplyAction()
  const undoMutation = useAdvisorControllerUndoAction()

  if (insideOwlWorkspace) {
    return null
  }

  const serverMessages =
    sessionQuery.data?.status === 200
      ? (sessionQuery.data.data.messages as unknown as readonly AdvisorChatMessageView[])
      : null

  const displayedMessages = serverMessages ?? localMessages

  async function invalidateMaskQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getChSalaryCertificateControllerGetQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getCapitalControllerGetQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getRentalControllerGetQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getChildrenControllerListQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getCommuteControllerGetQueryKey(taxYear) }),
      queryClient.invalidateQueries({ queryKey: getConfirmationControllerGetQueryKey(taxYear) }),
    ])
  }

  async function handleSendMessage(text: string, options?: ChatSendOptions) {
    try {
      const res = await sendMutation.mutateAsync({
        jahr: taxYear,
        data: { message: text, activeScreen: screen, ...sendOptionsToDto(options) },
      })
      if (res.status === 200) {
        await queryClient.invalidateQueries({
          queryKey: getAdvisorControllerGetSessionQueryKey(taxYear),
        })
        return
      }
    } catch {
      // Offline / guest fallback: evaluate locally in-memory
    }

    const replaceFrom = options?.replaceFromMessageId
    if (replaceFrom !== undefined) {
      setLocalMessages((prev) => {
        const at = prev.findIndex((m) => m.id === replaceFrom)
        return at === -1 ? prev : prev.slice(0, at)
      })
    }
    const userMsg: AdvisorChatMessageView = {
      id: `local-u-${Date.now()}`,
      role: 'user',
      content: text,
      meta: null,
      createdAt: new Date().toISOString(),
    }
    const turn = evaluateAdvisorTurn({
      message: text,
      activeScreen: screen,
      digest: { ...DEFAULT_FALLBACK_DIGEST, taxYear },
    })
    const assistantMsg: AdvisorChatMessageView = {
      id: `local-a-${Date.now() + 1}`,
      role: 'assistant',
      content: turn.replyText,
      meta: turn.meta,
      createdAt: new Date().toISOString(),
    }
    setLocalMessages((prev) => [...prev, userMsg, assistantMsg])
  }

  async function handleApplyAction(actionId: string) {
    try {
      const res = await applyMutation.mutateAsync({ jahr: taxYear, actionId })
      if (res.status === 200) {
        await invalidateMaskQueries()
        return
      }
    } catch {
      // Local fallback state update
    }
    setLocalMessages((prev) =>
      prev.map((m) =>
        m.meta?.action?.actionId === actionId
          ? { ...m, meta: { ...m.meta, action: { ...m.meta.action, status: 'applied' } } }
          : m,
      ),
    )
  }

  async function handleUndoAction(actionId: string) {
    try {
      const res = await undoMutation.mutateAsync({ jahr: taxYear, actionId })
      if (res.status === 200) {
        await invalidateMaskQueries()
        return
      }
    } catch {
      // Local fallback state update
    }
    setLocalMessages((prev) =>
      prev.map((m) =>
        m.meta?.action?.actionId === actionId
          ? { ...m, meta: { ...m.meta, action: { ...m.meta.action, status: 'undone' } } }
          : m,
      ),
    )
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resolvedTitle}
        onPress={() => setOpen(true)}
        style={styles.triggerBar}
        testID="in-mask-advisor-trigger"
      >
        <View style={styles.triggerLeft}>
          <OwlGlyph size={18} ink={t.color.ki} ground={t.color.kiWeich} />
          <Text style={styles.triggerTitle}>{resolvedTitle}</Text>
        </View>
        <Text style={styles.triggerHint}>{tr('advisor.companion.triggerHint', 'Kanzlei-Begleiter öffnen ▾')}</Text>
      </Pressable>
    )
  }

  return (
    <Card style={styles.sheetCard} testID="in-mask-advisor-sheet">
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitleRow}>
          <OwlGlyph size={20} ink={t.color.ki} ground={t.color.kiWeich} />
          <Text style={styles.sheetTitle}>{tr('advisor.companion.sheetTitle', 'Deine Eule · Direkt-Beratung an der Maske')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.companion.closeAria', 'Begleiter einklappen')}
          onPress={() => setOpen(false)}
          style={styles.closeBtn}
          testID="in-mask-advisor-close"
        >
          <Text style={styles.closeBtnText}>{tr('advisor.companion.closeButton', 'Einklappen ▴')}</Text>
        </Pressable>
      </View>

      <Text style={styles.privacyNotice}>
        {tr(
          'advisor.companion.privacyNotice',
          '🔒 Mandantengeheimnis aktiv — Werte werden erst nach deinem Klick auf „✓ Jetzt übernehmen“ direkt in diese Maske eingetragen.',
        )}
      </Text>

      <AdvisorChatPanel
        greeting={tr(
          'advisor.companion.greeting',
          'Frag mich direkt zu diesem Formularbereich. Ich rechne dir vorab die genaue Steuerwirkung aus.',
        )}
        messages={displayedMessages}
        quickChips={quickChips}
        isSending={sendMutation.isPending}
        onSendMessage={handleSendMessage}
        onApplyAction={handleApplyAction}
        onUndoAction={handleUndoAction}
        compact
      />
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  return {
    triggerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: t.space.s3,
      paddingHorizontal: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.kiWeich,
      borderWidth: 1.5,
      borderColor: t.color.ki,
      marginVertical: t.space.s4,
    } as ViewStyle,
    triggerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s2,
    } as ViewStyle,
    triggerTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    triggerHint: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.kiTinte,
    } as TextStyle,
    sheetCard: {
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.grund,
      borderWidth: 2,
      borderColor: t.color.ki,
      marginVertical: t.space.s4,
    } as ViewStyle,
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.space.s2,
    } as ViewStyle,
    sheetTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s2,
    } as ViewStyle,
    sheetTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    closeBtn: {
      paddingVertical: 4,
      paddingHorizontal: t.space.s2,
    } as ViewStyle,
    closeBtnText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.kiTinte,
    } as TextStyle,
    privacyNotice: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginBottom: t.space.s2,
    } as TextStyle,
  }
}
