import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, HerkunftsChip, Input, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { useReceiptControllerList, useReceiptControllerSetAssignment, getReceiptControllerListQueryKey, type ReceiptResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { LoadingState, ErrorState } from '../shared/ScreenState'

const KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  Lohnausweis: 'belege.art.lohnausweis',
  Quellensteuer: 'belege.art.quellensteuer',
  Pensionskasse: 'belege.art.pensionskasse',
  Saeule3a: 'belege.art.saeule3a',
  Krankenkasse: 'belege.art.krankenkasse',
  Familienzulage: 'belege.art.familienzulage',
  Rentenbezugsmitteilung: 'belege.art.rentenbezugsmitteilung',
  Sonstiges: 'belege.art.sonstiges',
}

const YEAR_RE = /^\d{4}$/

export function ReceiptsScreen() {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useReceiptControllerList()
  const setAssignment = useReceiptControllerSetAssignment()

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

  function assign(id: string, steuerjahr: number, vorschlagVerworfen = false) {
    setAssignment.mutate(
      { id, data: { steuerjahr, vorschlagVerworfen } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
          }
        },
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar open={open} />
      <ScanFollows />
      {receipts.length === 0 ? (
        <Empty />
      ) : (
        receipts.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} onAssign={assign} />)
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

function ScanFollows() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <Card variant="nacht">
      <Text style={s.scanFolgtHeading}>{tr('belege.scanFolgt.heading')}</Text>
      <Text style={s.scanFolgtBody}>{tr('belege.scanFolgt.body')}</Text>
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
  readonly onAssign: (id: string, steuerjahr: number, vorschlagVerworfen?: boolean) => void
}

function ReceiptCard({ receipt, onAssign }: ReceiptCardProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const kindKey = receipt.art === null ? undefined : KIND_LABEL_KEYS[receipt.art]
  const kindLabel = kindKey !== undefined ? tr(kindKey) : receipt.art === null ? tr('belege.art.generic') : receipt.art

  return (
    <Card>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} numberOfLines={2}>
          {receipt.dateiname}
        </Text>
        <Chip variant="src">{kindLabel}</Chip>
      </View>
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
    </Card>
  )
}

function AssignmentSection({ receipt, onAssign }: ReceiptCardProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const z = receipt.assignment

  if (z.kind === 'ungebunden') {
    return <Text style={s.zuordnungMuted}>{tr('belege.zuordnung.ungebunden')}</Text>
  }
  if (z.kind === 'zugeordnet') {
    return <Text style={s.zuordnungSettled}>{tr('belege.zuordnung.zugeordnet', { jahr: z.steuerjahr })}</Text>
  }
  if (z.kind === 'vorgeschlagen') {
    return (
      <Proposed
        proposalYear={z.steuerjahr ?? 0}
        provenance={z.provenance ?? 'zahlungsdatum'}
        onAssign={(year) => onAssign(receipt.id, year)}
      />
    )
  }
  return (
    <View style={s.konfliktBox}>
      <Text style={s.konfliktHeading}>{tr('belege.zuordnung.konflikt.heading')}</Text>
      <Text style={s.konfliktBody}>
        {tr('belege.zuordnung.konflikt.body', { zugeordnet: z.steuerjahr, vorschlag: z.proposalYear })}
      </Text>
      <View style={s.actionRow}>
        <Button onPress={() => onAssign(receipt.id, z.proposalYear ?? 0)}>
          {tr('belege.zuordnung.konflikt.resolve', { jahr: z.proposalYear })}
        </Button>
        <Button variant="leise" onPress={() => onAssign(receipt.id, z.steuerjahr ?? 0, true)}>
          {tr('belege.zuordnung.konflikt.keep', { jahr: z.steuerjahr })}
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
  const scanFollowsHeading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s2,
  }
  const scanFollowsBody: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.85,
    fontFamily: t.font.text,
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
  const dates: ViewStyle = { marginTop: t.space.s3, gap: t.space.s1 }
  const dateLine: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }
  const mono: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.s, fontVariant: ['tabular-nums'] }
  const assignmentMuted: TextStyle = { color: t.color.tinte2, fontSize: t.size.s, marginTop: t.space.s3 }
  const assignmentSettled: TextStyle = { color: t.color.tinte, fontWeight: t.weight.fett, fontSize: t.size.s, marginTop: t.space.s3 }
  const proposalRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginTop: t.space.s3, flexWrap: 'wrap' }
  const actionRow: ViewStyle = { flexDirection: 'row', gap: t.space.s3, marginTop: t.space.s3 }
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
    screen, wideScreen, appbar, appbarTitle, scanFolgtHeading: scanFollowsHeading, scanFolgtBody: scanFollowsBody,
    emptyBlock, emptyHeading, emptyBody, cardHead, cardTitle, dates, dateLine, mono,
    zuordnungMuted: assignmentMuted, zuordnungSettled: assignmentSettled, vorschlagRow: proposalRow, actionRow, konfliktBox: conflictBox, konfliktHeading: conflictHeading, konfliktBody: conflictBody,
  }
}
