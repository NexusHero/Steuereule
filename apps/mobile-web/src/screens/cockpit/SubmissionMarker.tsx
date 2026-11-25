import { useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, DateInput, Feld, germanDateToIso, isoDateToGerman, useTheme, type UiTheme } from '@steuereule/ui'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getYearHistoryControllerGetQueryKey,
  useSubmissionControllerSubmit,
  useSubmissionControllerWithdraw,
  type CockpitSubmissionDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'
import { todayIso } from '../shared/today'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'

export interface SubmissionMarkerProps {
  readonly year: number
  readonly submission: CockpitSubmissionDto | null
}

type Feedback = { readonly kind: 'ok' | 'error'; readonly text: string } | null

/**
 * „Ich habe die Erklärung abgegeben“ after printing (ADR-0098, product owner decision): the day the
 * user filed, today by default, marks the year as submitted, so the Verlauf shows it as „eingereicht ·
 * wartet auf Bescheid“; „Abgabe zurücknehmen“ while no Bescheid is recorded.
 */
export function SubmissionMarker({ year, submission }: SubmissionMarkerProps) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const submit = useSubmissionControllerSubmit()
  const withdraw = useSubmissionControllerWithdraw()
  const [dateText, setDateText] = useState(() => isoDateToGerman(todayIso()))
  const [feedback, setFeedback] = useState<Feedback>(null)
  const failureMessage = useApiFailureMessage()

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(year) }),
      queryClient.invalidateQueries({ queryKey: getYearHistoryControllerGetQueryKey() }),
    ])

  function fail(text: string) {
    triggerSaveErrorHaptic()
    setFeedback({ kind: 'error', text })
  }

  async function markSubmitted() {
    setFeedback(null)
    const submittedOn = germanDateToIso(dateText)
    if (submittedOn === null) return fail(tr('cockpit.abgabeMarke.datumUngueltig'))
    let res
    try {
      res = await submit.mutateAsync({ jahr: year, data: { submittedOn } })
    } catch (error) {
      return fail(failureMessage(error, { validation: tr('cockpit.abgabeMarke.datumAusserhalb', { jahr: year }), conflict: tr('cockpit.abgabeMarke.schonBescheid', { jahr: year }), unknown: tr('cockpit.abgabeMarke.fehler') }))
    }
    await refresh()
    setFeedback({ kind: 'ok', text: res.data.replacedPrevious ? tr('cockpit.abgabeMarke.ersetzt') : tr('cockpit.abgabeMarke.gespeichert') })
  }

  async function undo() {
    setFeedback(null)
    try {
      await withdraw.mutateAsync({ jahr: year })
    } catch (error) {
      return fail(failureMessage(error, { conflict: tr('cockpit.abgabeMarke.zuruecknehmenBescheid'), unknown: tr('cockpit.abgabeMarke.fehler') }))
    }
    await refresh()
    setFeedback({ kind: 'ok', text: tr('cockpit.abgabeMarke.zurueckgenommen') })
  }

  const status =
    feedback === null ? null : (
      <Text style={feedback.kind === 'ok' ? s.ok : s.error} accessibilityLiveRegion="polite" {...(feedback.kind === 'error' ? { accessibilityRole: 'alert' as const } : {})} testID="cockpit-abgabe-marke-status">
        {feedback.text}
      </Text>
    )

  if (submission !== null) {
    const assessed = submission.status === 'bescheid' || submission.status === 'abgeschlossen'
    return (
      <Card testID="cockpit-abgabe-marke">
        <View style={s.box}>
          <Text style={s.heading}>{tr('cockpit.abgabeMarke.eingereichtTitel')}</Text>
          <Text style={s.body} testID="cockpit-abgabe-marke-stand">
            {tr(assessed ? 'cockpit.abgabeMarke.eingereichtMitBescheid' : 'cockpit.abgabeMarke.eingereicht', { datum: isoDateToGerman(submission.submittedOn) })}
          </Text>
          {submission.withdrawable ? (
            <Button variant="ghost" onPress={() => void undo()} disabled={withdraw.isPending} testID="cockpit-abgabe-zuruecknehmen">
              {tr('cockpit.abgabeMarke.zuruecknehmen')}
            </Button>
          ) : null}
          {status}
        </View>
      </Card>
    )
  }

  return (
    <Card testID="cockpit-abgabe-marke">
      <View style={s.box}>
        <Text style={s.heading}>{tr('cockpit.abgabeMarke.titel')}</Text>
        <Text style={s.body}>{tr('cockpit.abgabeMarke.text', { jahr: year })}</Text>
        <Feld label={tr('cockpit.abgabeMarke.datum')}>
          <DateInput
            value={dateText}
            onChange={setDateText}
            calendarLabel={tr('datum.kalender')}
            min={`${year + 1}-01-01`}
            max={todayIso()}
            accessibilityLabel={tr('cockpit.abgabeMarke.datum')}
            testID="cockpit-abgabe-datum"
          />
        </Feld>
        <Button onPress={() => void markSubmitted()} disabled={submit.isPending} testID="cockpit-abgabe-abgegeben">
          {tr('cockpit.abgabeMarke.cta')}
        </Button>
        {status}
      </View>
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const box: ViewStyle = { gap: t.space.s2 }
  const heading: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte }
  const body: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const ok: TextStyle = { ...t.type.small, color: t.color.ok }
  const error: TextStyle = { ...t.type.small, color: t.color.fehler }
  return { box, heading, body, ok, error }
}
