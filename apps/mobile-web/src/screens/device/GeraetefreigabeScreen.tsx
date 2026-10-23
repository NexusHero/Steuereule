// GeraetefreigabeScreen (#238, task 3, ADR-0024) — the match-verification screen a phone lands
// on after opening the device-authorization QR/link (`/device?user_code=…`). Decision 4
// (reinstated): the phone never sees "Freigeben?" — it sees "Steht dieser Code gerade auf
// deinem Bildschirm?" next to the real requesting browser/OS/region/time, and a persistent
// warning that a code received by message/link is never approved here. No session-scope choice
// (Decision 5 stays revoked) — approving is the whole action, one button.
//
// Derived entirely from existing building blocks, per NexusHero's ruling that no new pattern gets
// invented for this screen: Card + Feld + Pill for the context block, LoginScreen's own
// accessibilityRole="alert" pattern for the warning, and ./deviceContext.ts for the raw-field
// parsing. Loading/error/success render through the shared ScreenState (Phase 0.3 AC-3).
import { useState } from 'react'
import { ActivityIndicator, ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Feld, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { useDeviceControllerGetPending, useDeviceControllerApprove } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { parseUserAgent, resolveRegionName, formatRequestedAt } from './deviceContext'
import { LoadingState, ErrorState, SuccessState } from '../shared/ScreenState'

export interface GeraetefreigabeScreenProps {
  readonly userCode: string
}

type ApproveState = 'idle' | 'approving' | 'approved' | 'error'

export function GeraetefreigabeScreen({ userCode }: GeraetefreigabeScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [approveState, setApproveState] = useState<ApproveState>('idle')

  const pendingQuery = useDeviceControllerGetPending({ userCode })
  const approveMutation = useDeviceControllerApprove()

  // `httpClient` never throws on a non-2xx (Musti's T1, F1) — the generated type narrows `.status`
  // to `200` even though a real 400 (expired/invalid code) or 429 reaches this branch at runtime.
  // Widening the check here is what keeps an expired/invalid code from rendering as a real request.
  const pendingStatus = pendingQuery.data ? (pendingQuery.data as { status: number }).status : undefined

  if (pendingQuery.isPending) {
    return <LoadingState bp={bp} label={tr('device.approval.loading')} />
  }

  if (pendingQuery.isError || pendingStatus !== 200) {
    return <ErrorState bp={bp} heading={tr('device.approval.error.heading')} message={tr('device.approval.error.body')} />
  }

  const pending = pendingQuery.data.data

  function approve() {
    setApproveState('approving')
    approveMutation.mutate(
      { data: { userCode } },
      {
        onSuccess: (response) => {
          setApproveState(response.status === 200 ? 'approved' : 'error')
        },
        onError: () => setApproveState('error'),
      },
    )
  }

  // Already resolved (approved from another tab, or this exact tap already landed) — the same
  // honest confirmation, not the approval UI again. `pending.status` is the domain's own field,
  // distinct from the HTTP status checked above.
  if (approveState === 'approved' || pending.status === 'approved') {
    return <SuccessState bp={bp} heading={tr('device.approval.approved.heading')} message={tr('device.approval.approved.body')} />
  }

  if (pending.status !== 'pending') {
    // 'denied', or any future value — this screen only ever produces 'approved' itself; anything
    // else reaching here means the request is no longer actionable.
    return <ErrorState bp={bp} heading={tr('device.approval.error.heading')} message={tr('device.approval.error.body')} />
  }

  const { browser, os } = parseUserAgent(pending.userAgent)
  const regionName = resolveRegionName(pending.region, i18n.language)
  const time = formatRequestedAt(pending.requestedAt, i18n.language)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Text style={styles.code} accessibilityLabel={pending.userCode}>
        {pending.userCode}
      </Text>

      <Card style={styles.contextCard}>
        <Feld label={tr('device.approval.context.browser')}>
          <Text style={styles.contextValue}>{browser ?? tr('device.approval.context.unknownBrowser')}</Text>
        </Feld>
        <Feld label={tr('device.approval.context.os')}>
          <Text style={styles.contextValue}>{os ?? tr('device.approval.context.unknownOs')}</Text>
        </Feld>
        <Feld label={tr('device.approval.context.region')}>
          <Text style={styles.contextValue}>{regionName ?? tr('device.approval.context.unknownRegion')}</Text>
        </Feld>
        <Feld label={tr('device.approval.context.time')}>
          <Pill>{time ?? tr('device.approval.context.unknownTime')}</Pill>
        </Feld>
      </Card>

      <View style={styles.warning} accessibilityRole="alert">
        <Text style={styles.warningText}>{tr('device.approval.warning')}</Text>
      </View>

      <Text style={styles.question}>{tr('device.approval.question')}</Text>

      {approveState === 'error' ? (
        <Text style={styles.approveErrorText} accessibilityRole="alert">
          {tr('device.approval.approveError')}
        </Text>
      ) : null}

      <Button onPress={approve} disabled={approveState === 'approving'} style={styles.cta}>
        {approveState === 'approving' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={t.color.tinte} />
            <Text style={styles.submittingLabel}>{tr('device.approval.confirming')}</Text>
          </View>
        ) : (
          tr('device.approval.confirm')
        )}
      </Button>
    </ScrollView>
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
  // "Code groß" — the large, provenance-carrying number this whole screen exists to compare
  // against the other screen's own display, mono + tabular-nums + letterSpacing.
  const code: TextStyle = {
    fontFamily: t.font.mono,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    textAlign: 'center',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
    marginBottom: t.space.s5,
  }
  const contextCard: ViewStyle = { marginBottom: t.space.s4 }
  const contextValue: TextStyle = { fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte }
  // LoginScreen's own `verifyBanner` box primitive, recoloured with the DS's warn pair — a
  // caution, not an error (the error pair stays for genuine failures like `approveErrorText`).
  const warning: ViewStyle = {
    backgroundColor: t.color.warnWeich,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const warningText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const question: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    textAlign: 'center',
    marginBottom: t.space.s4,
  }
  const approveErrorText: TextStyle = { color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, textAlign: 'center', marginBottom: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }

  return {
    screen,
    wideScreen,
    code,
    contextCard,
    contextValue,
    warning,
    warningText,
    question,
    approveErrorText,
    cta,
    submittingRow,
    submittingLabel,
  }
}
