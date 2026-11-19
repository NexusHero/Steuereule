import { useState } from 'react'
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import type { YearDocumentsDto, YearHistoryResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BackButton } from '../shared/BackButton'
import { ReceiptFileModal } from '../receipts/ReceiptFileModal'
import { HistoryGate, historyScreenStyles } from './HistoryGate'
import { historyStyles } from './historyStyles'
import { germanDate, newestFirst, signedEuro } from './historyFormat'

export interface HistoryDocumentsScreenProps {
  readonly isGuest: boolean
  readonly onBack: () => void
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
}

/**
 * „Unterlagen“ (ADR-0099 §9, mock „Praktisch“): the Bescheide per year as a list, each one viewed and
 * downloaded through the stored Beleg (the Belege tab's preview), the weeks from the Abgabe to the Bescheid
 * with „Nachfragen lohnt sich“ after twelve weeks without one, and the Einsprüche with their outcome.
 */
export function HistoryDocumentsScreen(props: HistoryDocumentsScreenProps) {
  return (
    <HistoryGate isGuest={props.isGuest} onRegister={props.onRegister} onLogin={props.onLogin}>
      {(data) => <DocumentsLoaded {...props} data={data} />}
    </HistoryGate>
  )
}

function DocumentsLoaded({ data, onBack }: HistoryDocumentsScreenProps & { readonly data: YearHistoryResponseDto }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [preview, setPreview] = useState<{ readonly id: string; readonly fileName: string } | null>(null)
  const years = newestFirst(data.documents)
  const assessedYears = years.filter((y) => y.documents.length > 0 || y.assessmentDate !== null)
  const withWait = years.filter((y) => y.wait !== null && y.submittedOn !== null)
  const appeals = years.flatMap((y) => y.appeals.map((a, i) => ({ year: y.year, index: i, appeal: a })))
  const twoPeople = years.some((y) => y.appeals.some((a) => a.person === 'B'))

  return (
    <ScrollView contentContainerStyle={bp === 's' ? s.screen : s.wideScreen} testID="screen-container">
      <BackButton accessibilityLabel={tr('verlauf.zurueck')} onPress={onBack} testID="verlauf-unterlagen-zurueck" />
      <Text style={s.title} accessibilityRole="header" testID="verlauf-unterlagen-titel">
        {tr('verlauf.unterlagen.titel')}
      </Text>
      {years.length === 0 ? (
        <View style={s.card} testID="verlauf-unterlagen-leer">
          <Text style={s.muted}>{tr('verlauf.unterlagen.leer')}</Text>
        </View>
      ) : (
        <>
          <ReceiptFileModal receiptId={preview?.id ?? null} {...(preview ? { fileName: preview.fileName } : {})} onClose={() => setPreview(null)} />
          <View style={s.card} testID="verlauf-unterlagen-bescheide">
            <Text style={s.cardTitle} accessibilityRole="header">
              {tr('verlauf.unterlagen.bescheideTitel')}
            </Text>
            <Text style={s.muted}>{tr('verlauf.unterlagen.bescheideText')}</Text>
            <View style={s.items}>
              {assessedYears.map((y) => (
                <AssessmentDocuments key={y.year} entry={y} onOpen={(id, fileName) => setPreview({ id, fileName })} />
              ))}
              {assessedYears.length === 0 ? <Text style={s.muted}>{tr('verlauf.unterlagen.keinBescheid')}</Text> : null}
            </View>
          </View>

          {withWait.length > 0 ? (
            <View style={s.card} testID="verlauf-unterlagen-dauer">
              <Text style={s.cardTitle} accessibilityRole="header">
                {tr('verlauf.unterlagen.dauerTitel')}
              </Text>
              <View style={s.items}>
                {withWait.map((y) => {
                  const wait = y.wait!
                  const line = wait.pending
                    ? tr('verlauf.unterlagen.dauerOffen', { abgabe: germanDate(y.submittedOn) })
                    : tr('verlauf.unterlagen.dauerZeile', { abgabe: germanDate(y.submittedOn), bescheid: germanDate(y.assessmentDate) })
                  return (
                    <View key={y.year} style={s.entry} testID={`verlauf-unterlagen-dauer-${y.year}`}>
                      <View style={s.lineTop}>
                        <Text style={s.strong}>{y.year}</Text>
                        <Text style={s.weeks}>{tr('verlauf.unterlagen.wochen', { count: wait.weeks })}</Text>
                      </View>
                      <Text style={s.muted}>{line}</Text>
                      {wait.askTaxOffice ? (
                        <Text style={[s.pill, s.pillAbweichung]} testID={`verlauf-unterlagen-nachfragen-${y.year}`}>
                          {tr('verlauf.unterlagen.nachfragen')}
                        </Text>
                      ) : null}
                    </View>
                  )
                })}
              </View>
              <Text style={s.muted}>{tr('verlauf.unterlagen.regel')}</Text>
            </View>
          ) : null}

          <View style={s.card} testID="verlauf-unterlagen-einsprueche">
            <Text style={s.cardTitle} accessibilityRole="header">
              {tr('verlauf.unterlagen.einspruchTitel')}
            </Text>
            {appeals.length === 0 ? (
              <Text style={s.muted}>{tr('verlauf.unterlagen.keinEinspruch')}</Text>
            ) : (
              <View style={s.items}>
                {appeals.map(({ year, index, appeal }) => {
                  const reason = tr(`bescheid.einspruch.grund.${appeal.reason}`)
                  const head = appeal.date === null ? reason : tr('verlauf.unterlagen.einspruchZeile', { grund: reason, datum: germanDate(appeal.date) })
                  const who = twoPeople && appeal.person ? tr('verlauf.unterlagen.personSuffix', { was: String(year), person: tr(`verlauf.person.${appeal.person}`) }) : String(year)
                  return (
                    <View key={`${year}-${index}`} style={s.entry} testID={`verlauf-unterlagen-einspruch-${year}-${index}`}>
                      <View style={s.lineTop}>
                        <Text style={s.strong}>{who}</Text>
                        {appeal.amount !== null ? <Text style={s.weeks}>{signedEuro(appeal.amount)}</Text> : null}
                      </View>
                      <Text style={s.muted}>{head}</Text>
                      <Text style={s.body}>{tr(`verlauf.unterlagen.ergebnis.${appeal.outcome}`)}</Text>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  )
}

function AssessmentDocuments({ entry, onOpen }: { readonly entry: YearDocumentsDto; readonly onOpen: (id: string, fileName: string) => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  if (entry.documents.length === 0) {
    return (
      <View style={s.entry} testID={`verlauf-unterlagen-jahr-${entry.year}`}>
        <Text style={s.strong}>{entry.year}</Text>
        <Text style={s.muted}>{tr('verlauf.unterlagen.keinBescheid')}</Text>
      </View>
    )
  }
  return (
    <View style={s.entry} testID={`verlauf-unterlagen-jahr-${entry.year}`}>
      <Text style={s.strong}>{entry.year}</Text>
      {entry.documents.map((d) => (
        <View key={d.receiptId} style={s.docRow}>
          <View style={s.docBody}>
            <Text style={s.body} numberOfLines={1}>
              {d.fileName}
            </Text>
            <Text style={s.muted}>{tr('verlauf.unterlagen.hochgeladen', { datum: germanDate(d.uploadedAt) })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('verlauf.unterlagen.oeffnenA11y', { jahr: entry.year, datei: d.fileName })}
            onPress={() => onOpen(d.receiptId, d.fileName)}
            style={s.docButton}
            testID={`verlauf-unterlagen-bescheid-${d.receiptId}`}
          >
            <Text style={s.strong}>{tr('verlauf.unterlagen.oeffnen')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const base = historyStyles(t)
  const items: ViewStyle = { gap: t.space.s3, borderTopWidth: 1, borderTopColor: t.color.linieWeich, paddingTop: t.space.s3 }
  const entry: ViewStyle = { gap: 4 }
  const lineTop: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: t.space.s3 }
  const weeks: TextStyle = { ...t.type.labelStrong, color: t.color.tinte, fontVariant: ['tabular-nums'] }
  const docRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const docBody: ViewStyle = { flex: 1, minWidth: 0 }
  const docButton: ViewStyle = { minHeight: 44, minWidth: 44, paddingHorizontal: t.space.s4, justifyContent: 'center', borderWidth: t.space.kontur, borderColor: t.color.tinte2, borderRadius: t.radius.pille, backgroundColor: t.color.karte }
  const title: TextStyle = { ...t.type.title, color: t.color.tinte }
  return { ...base, ...historyScreenStyles(t), items, entry, lineTop, weeks, docRow, docBody, docButton, title }
}
