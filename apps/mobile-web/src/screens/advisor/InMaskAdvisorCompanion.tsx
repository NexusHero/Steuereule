import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
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
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { AdvisorChatPanel } from './AdvisorChatPanel'

export interface InMaskAdvisorCompanionProps {
  readonly screen: Screen
  readonly taxYear?: number | undefined
  readonly title?: string | undefined
}

const SCREEN_QUICK_CHIPS: Readonly<Partial<Record<Screen, readonly string[]>>> = {
  lstb: [
    'Homeoffice vs. Arbeitszimmer prüfen',
    'Fortbildung & Reisekosten klären',
    'Arbeitsmittel & Laptop absetzen',
  ],
  chLohnausweis: [
    'Krankenkasse (z. B. 4.200 CHF) eintragen',
    'Homeoffice-Pauschale prüfen',
    'Kanzlei-Endprüfung starten',
  ],
  interview: [
    'Homeoffice vs. Arbeitszimmer prüfen',
    'Fortbildung & Reisekosten klären',
    'Spenden aus dem Vorjahr prüfen',
  ],
  kind: [
    'Kinderbetreuungskosten (Kita/Hort) prüfen',
    'Spenden aus dem Vorjahr prüfen',
    'Kanzlei-Endprüfung starten',
  ],
  vermietung: [
    'Homeoffice vs. Arbeitszimmer prüfen',
    'Kanzlei-Endprüfung starten',
  ],
  kapital: [
    'Spenden aus dem Vorjahr prüfen',
    'Kanzlei-Endprüfung starten',
  ],
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
  title = 'Eule zu dieser Maske fragen',
}: InMaskAdvisorCompanionProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const [open, setOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<readonly AdvisorChatMessageView[]>([])
  const queryClient = useQueryClient()

  const sessionQuery = useAdvisorControllerGetSession(taxYear, {
    query: { enabled: open, retry: false },
  })
  const sendMutation = useAdvisorControllerSendMessage()
  const applyMutation = useAdvisorControllerApplyAction()
  const undoMutation = useAdvisorControllerUndoAction()

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

  async function handleSendMessage(text: string) {
    try {
      const res = await sendMutation.mutateAsync({
        jahr: taxYear,
        data: { message: text, activeScreen: screen },
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
        accessibilityLabel={title}
        onPress={() => setOpen(true)}
        style={styles.triggerBar}
        testID="in-mask-advisor-trigger"
      >
        <View style={styles.triggerLeft}>
          <OwlGlyph size={18} ink={t.color.ki} ground={t.color.kiWeich} />
          <Text style={styles.triggerTitle}>{title}</Text>
        </View>
        <Text style={styles.triggerHint}>Kanzlei-Begleiter öffnen ▾</Text>
      </Pressable>
    )
  }

  return (
    <Card style={styles.sheetCard} testID="in-mask-advisor-sheet">
      <View style={styles.sheetHeader}>
        <View style={styles.sheetTitleRow}>
          <OwlGlyph size={20} ink={t.color.ki} ground={t.color.kiWeich} />
          <Text style={styles.sheetTitle}>Deine Eule · Direkt-Beratung an der Maske</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Begleiter einklappen"
          onPress={() => setOpen(false)}
          style={styles.closeBtn}
          testID="in-mask-advisor-close"
        >
          <Text style={styles.closeBtnText}>Einklappen ▴</Text>
        </Pressable>
      </View>

      <Text style={styles.privacyNotice}>
        🔒 Mandantengeheimnis aktiv — Werte werden erst nach deinem Klick auf „✓ Jetzt übernehmen“ direkt in diese Maske eingetragen.
      </Text>

      <AdvisorChatPanel
        greeting="Frag mich direkt zu diesem Formularbereich. Ich rechne dir vorab die genaue Steuerwirkung aus."
        messages={displayedMessages}
        quickChips={SCREEN_QUICK_CHIPS[screen] ?? SCREEN_QUICK_CHIPS.interview}
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
      color: t.color.ki,
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
      color: t.color.ki,
    } as TextStyle,
    privacyNotice: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginBottom: t.space.s2,
    } as TextStyle,
  }
}
