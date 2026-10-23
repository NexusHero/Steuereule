// The Minimal-Gate's two hard gates — Gewerbe (terminal for "Selbstständig", passable for
// "Beides") and CH-only. ADR-0032 drops the DS reference's "notify me"/"Vormerken" buttons
// (neither is built), so these offer only the honest text, the one passable action where it
// exists, and the way back.
import { ScrollView, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Option, useTheme, type Breakpoint } from '@steuereule/ui'
import { GATE_ACKNOWLEDGED, type GateId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makeInterviewStyles } from './styles'
import { PostErrorNotice, type PostErrorKind } from './PostErrorNotice'

interface GateScreenProps {
  readonly gateId: GateId
  readonly job: string | undefined
  readonly onAcknowledge: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
}

export function GateScreen({ gateId, job, onAcknowledge, onBack, bp, notice }: GateScreenProps) {
  if (gateId === 'gewerbe') {
    return <GewerbeGate job={job} onAcknowledge={onAcknowledge} onBack={onBack} bp={bp} notice={notice} />
  }
  return <ChOnlyGate onAcknowledge={onAcknowledge} onBack={onBack} bp={bp} notice={notice} />
}

function GewerbeGate({
  job,
  onAcknowledge,
  onBack,
  bp,
  notice,
}: {
  readonly job: string | undefined
  readonly onAcknowledge: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeInterviewStyles(t)
  // Product ADR-028: "Selbstständig" is a full stop — this screen offers no forward action at
  // all, only the honest text and the way back. "Beides" is explicitly passable and keeps the
  // "prepare the employee part" button (ADR-0032: it promises nothing external).
  const passable = job === 'Beides'

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.gateScreen : styles.wideGateScreen} testID="screen-container">
      <PostErrorNotice kind={notice} />
      <Text style={styles.gateHeading}>{tr('interview.gewerbe.heading')}</Text>
      <Text style={styles.help}>{tr('interview.gewerbe.body1')}</Text>
      <Text style={styles.help}>{tr('interview.gewerbe.body2')}</Text>
      {passable ? (
        <Option onPress={() => onAcknowledge(GATE_ACKNOWLEDGED)}>{tr('interview.gewerbe.prepareEmployeePart')}</Option>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.gateBackLink}>
        <Text style={styles.gateBackLinkText}>{tr('interview.back')}</Text>
      </Pressable>
    </ScrollView>
  )
}

function ChOnlyGate({
  onAcknowledge,
  onBack,
  bp,
  notice,
}: {
  readonly onAcknowledge: (value: string) => void
  readonly onBack: () => void
  readonly bp: Breakpoint
  readonly notice: PostErrorKind | null
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeInterviewStyles(t)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.gateScreen : styles.wideGateScreen} testID="screen-container">
      <PostErrorNotice kind={notice} />
      <Text style={styles.gateHeading}>{tr('interview.chOnly.heading')}</Text>
      <Text style={styles.help}>{tr('interview.chOnly.body1')}</Text>
      <Text style={styles.help}>{tr('interview.chOnly.body2')}</Text>
      <Option onPress={() => onAcknowledge(GATE_ACKNOWLEDGED)}>{tr('interview.chOnly.continueWithoutForeign')}</Option>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.gateBackLink}>
        <Text style={styles.gateBackLinkText}>{tr('interview.back')}</Text>
      </Pressable>
    </ScrollView>
  )
}
