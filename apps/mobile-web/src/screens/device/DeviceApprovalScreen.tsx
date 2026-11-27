import { useState } from 'react'
import { ActivityIndicator, ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Feld, Pill, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import { useDeviceControllerGetPending, useDeviceControllerApprove } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { StepUpInline } from '../../auth/StepUpInline'
import { parseUserAgent, resolveRegionName, formatRequestedAt } from './deviceContext'
import { LoadingState, ErrorState, LoadFailedState, SuccessState } from '../shared/ScreenState'
import { classifyApiFailure, useApiFailureMessage } from '../../net/apiFailure'

export interface DeviceApprovalScreenProps {
  readonly userCode: string
}

type ApproveState = 'idle' | 'approving' | 'approved' | 'error' | 'step-up'

export function DeviceApprovalScreen({ userCode }: DeviceApprovalScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [approveState, setApproveState] = useState<ApproveState>('idle')
  const [approveError, setApproveError] = useState<unknown>(null)
  const failureMessage = useApiFailureMessage()

  const pendingQuery = useDeviceControllerGetPending({ userCode })
  const approveMutation = useDeviceControllerApprove()

  if (pendingQuery.isPending) {
    return <LoadingState bp={bp} label={tr('device.approval.loading')} />
  }

  if (pendingQuery.isError) {
    // NR-11: only an unknown or malformed code is "ungültig oder abgelaufen"; a server or network failure is a
    // load failure with a retry, so nobody requests a new code for nothing.
    const kind = classifyApiFailure(pendingQuery.error).kind
    if (kind === 'not-found' || kind === 'validation') {
      return <ErrorState bp={bp} heading={tr('device.approval.error.heading')} message={tr('device.approval.error.body')} testID="geraet-code-ungueltig" />
    }
    return <LoadFailedState bp={bp} error={pendingQuery.error} onRetry={() => void pendingQuery.refetch()} />
  }

  const pending = pendingQuery.data.data

  function approve() {
    setApproveState('approving')
    approveMutation.mutate(
      { data: { userCode } },
      {
        onSuccess: () => setApproveState('approved'),
        onError: (error) => {
          // Signing another device in needs a fresh sign-in or a step-up first (API-1).
          if (classifyApiFailure(error).kind === 'step-up') return setApproveState('step-up')
          setApproveError(error)
          setApproveState('error')
        },
      },
    )
  }

  if (approveState === 'approved' || pending.status === 'approved') {
    return <SuccessState bp={bp} heading={tr('device.approval.approved.heading')} message={tr('device.approval.approved.body')} />
  }

  if (pending.status !== 'pending') {
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
          {failureMessage(approveError, { server: tr('device.approval.approveError'), unknown: tr('device.approval.approveError'), forbidden: tr('device.approval.approveError') })}
        </Text>
      ) : null}

      {approveState === 'step-up' ? (
        <StepUpInline testID="geraet-freigeben-stepup" onConfirmed={approve} onCancel={() => setApproveState('idle')} />
      ) : null}

      <Button onPress={approve} disabled={approveState === 'approving' || approveState === 'step-up'} style={styles.cta} testID="geraet-freigeben">
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
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const code: TextStyle = {
    ...t.type.code,
    color: t.color.tinte,
    textAlign: 'center',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
    marginBottom: t.space.s5,
  }
  const contextCard: ViewStyle = { marginBottom: t.space.s4 }
  const contextValue: TextStyle = { ...t.type.body, color: t.color.tinte }
  const warning: ViewStyle = {
    backgroundColor: t.color.warnWeich,
    borderWidth: t.space.kontur,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const warningText: TextStyle = { ...t.type.small, color: t.color.tinte }
  const question: TextStyle = {
    ...t.type.emphasis,
    color: t.color.tinte,
    textAlign: 'center',
    marginBottom: t.space.s4,
  }
  const approveErrorText: TextStyle = { ...t.type.small, color: t.color.fehler, textAlign: 'center', marginBottom: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { ...t.type.button, color: t.color.tinte }

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
