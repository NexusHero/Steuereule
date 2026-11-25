import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
import { formatEuro, formatEuroCents, parseBookingDraft, toGermanDate } from '@steuereule/core'
import {
  useConfirmationControllerConfirmAnnex,
  useConfirmationControllerDecideProposal,
  useConfirmationControllerDecideTask,
  useConfirmationControllerGet,
  type AnnexConfirmationDto,
  type AssistantTaskDto,
  type ProvenanceDto,
  type FieldProvenanceDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makePrivacyStyles } from '../privacy/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'

export type ConfirmationForm = FieldProvenanceDto['screen']

export interface ConfirmationScreenProps {
  readonly year: number
  readonly onBack: () => void
  readonly onOpenScreen: (screen: ConfirmationForm) => void
}

type Tr = ReturnType<typeof useTranslation>['t']

const NO_AMOUNTS = new Set(['rente.rentenbeginnJahr', 'rente.alterBeiRentenbeginn', 'rente.rentenart', 'vermietung.baujahr'])

function provenanceText(tr: Tr, h: ProvenanceDto): string {
  switch (h.kind) {
    case 'nutzer':
      return tr('bestaetigung.herkunft.nutzer')
    case 'uebernahme':
      return tr('bestaetigung.herkunft.uebernahme', { vorjahr: h.lastYear })
    case 'assistent':
      return h.receiptId ? tr('bestaetigung.herkunft.assistentBeleg', { name: h.name }) : tr('bestaetigung.herkunft.assistent', { name: h.name })
    case 'beleg':
      return tr('bestaetigung.herkunft.beleg')
  }
}

function fieldLabel(tr: Tr, w: FieldProvenanceDto): string {
  if (w.screen === 'buchung') return tr('bestaetigung.buchung.label')
  if (w.screen === 'kapital' && w.field === 'kapitalertraege') return tr('kapital.feld.label')
  if (w.screen === 'rente' && w.field === 'rentenart') return tr('bestaetigung.felder.rentenart')
  if (w.screen === 'lstb' || w.screen === 'rente' || w.screen === 'kapital' || w.screen === 'vermietung') {
    return tr(`${w.screen}.felder.${w.field}`, { defaultValue: w.field })
  }
  return w.field
}

/** A booking draft (#549) as one line: date, text, document number and the booked sum, never its JSON. */
function bookingText(tr: Tr, value: string): string {
  const parsed = parseBookingDraft(value)
  if (!parsed.ok) return tr('bestaetigung.buchung.unlesbar')
  const { date, text, documentNumber, lines } = parsed.draft
  const sumCents = lines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + line.amount, 0)
  return tr('bestaetigung.buchung.zeile', { datum: toGermanDate(date) ?? date, text, beleg: documentNumber, summe: formatEuroCents(sumCents / 100) })
}

function valueText(tr: Tr, w: FieldProvenanceDto, value: string | null): string {
  if (value === null) return tr('bestaetigung.leererWert')
  if (w.screen === 'buchung') return bookingText(tr, value)
  if (value === 'unklar') return tr('bestaetigung.unklar')
  if (w.screen === 'rente' && w.field === 'rentenart') return tr(`rente.arten.${value}`, { defaultValue: value })
  const amount = Number(value)
  if (NO_AMOUNTS.has(`${w.screen}.${w.field}`) || !Number.isFinite(amount)) return value
  return formatEuro(amount)
}

export function ConfirmationScreen({ year, onBack, onOpenScreen }: ConfirmationScreenProps) {
  const bp = useBreakpoint()
  const theme = useTheme()
  const styles = makePrivacyStyles(theme)
  const { t } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const overview = useConfirmationControllerGet(year)
  const confirm = useConfirmationControllerConfirmAnnex()
  const decide = useConfirmationControllerDecideProposal()
  const decideTask = useConfirmationControllerDecideTask()
  const [error, setError] = useState(false)

  if (overview.isPending) return <LoadingState bp={bp} label={t('bestaetigung.loading')} />
  if (overview.isError || overview.data === undefined) {
    return (
      <ErrorState
        bp={bp}
        heading={t('bestaetigung.loadError.heading')}
        message={t('bestaetigung.loadError.message')}
        retryLabel={t('bestaetigung.loadError.retry')}
        onRetry={() => void overview.refetch()}
      />
    )
  }
  const { annexes } = overview.data.data
  // An API of before #547 answers without tasks.
  const tasks: readonly AssistantTaskDto[] = overview.data.data.tasks ?? []

  const afterChange = async (action: () => Promise<{ status: number }>) => {
    setError(false)
    try {
      // A refusal rejects with an ApiError (WEB-28); a resolved action succeeded.
      await action()
    } catch {
      triggerSaveErrorHaptic()
      setError(true)
    }
    await queryClient.invalidateQueries()
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('bestaetigung.back')} onPress={onBack} style={styles.backButton} testID="bestaetigung-zurueck">
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('bestaetigung.title', { jahr: year })}</Text>
      </View>

      {annexes.length > 0 ? (
        <Text style={styles.sectionBody}>{t('bestaetigung.intro')}</Text>
      ) : tasks.length === 0 ? (
        <Text style={styles.sectionBody}>{t('bestaetigung.leer')}</Text>
      ) : null}
      {error ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {t('bestaetigung.fehler')}
        </Text>
      ) : null}

      {tasks.length > 0 ? (
        <Card style={{ marginBottom: theme.space.s4 }} testID="aufgaben">
          <Text style={styles.sectionTitle}>{t('bestaetigung.aufgaben.title')}</Text>
          <Text style={styles.hint}>{t('bestaetigung.aufgaben.intro')}</Text>
          {tasks.map((task) => (
            <View key={task.id} style={{ gap: theme.space.s1, marginTop: theme.space.s3 }} testID={`aufgabe-${task.id}`}>
              <Text style={styles.sectionTitle}>{t(`bestaetigung.aufgaben.art.${task.kind}`, { defaultValue: t('bestaetigung.aufgaben.art.sonstiges') })}</Text>
              {/* What an assistant wrote: a text node only, never markup or a link. */}
              <Text style={styles.sectionBody}>{task.text}</Text>
              <Text style={styles.hint}>{t('bestaetigung.aufgaben.von', { name: task.assistant })}</Text>
              <View style={{ flexDirection: 'row', gap: theme.space.s2 }}>
                <Button
                  variant="ghost"
                  disabled={decideTask.isPending}
                  testID={`aufgabe-erledigt-${task.id}`}
                  onPress={() => void afterChange(() => decideTask.mutateAsync({ jahr: year, id: task.id, data: { decision: 'erledigt' } }))}
                >
                  {t('bestaetigung.aufgaben.erledigt')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={decideTask.isPending}
                  testID={`aufgabe-verwerfen-${task.id}`}
                  onPress={() => void afterChange(() => decideTask.mutateAsync({ jahr: year, id: task.id, data: { decision: 'verworfen' } }))}
                >
                  {t('bestaetigung.aufgaben.verwerfen')}
                </Button>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {annexes.map((annex: AnnexConfirmationDto) => {
        const annexName = t(`bestaetigung.anlagen.${annex.annex}`)
        const firstScreen = annex.values[0]?.screen
        return (
          <Card key={annex.annex} style={{ marginBottom: theme.space.s4 }} testID={`anlage-${annex.annex}`}>
            <Text style={styles.sectionTitle}>{annexName}</Text>
            <Text style={styles.hint}>
              {annex.unconfirmed > 0 ? t('bestaetigung.unbestaetigt', { count: annex.unconfirmed }) : t('bestaetigung.nurVorschlaege')}
            </Text>
            {annex.values.map((w) => {
              // A field can be the user's and Person B's at once (ADR-0054): the person is part of its identity.
              const id = w.person === 'B' ? `B-${w.key}` : w.key
              const decision = (d: 'annehmen' | 'verwerfen') => ({ decision: d, ...(w.person === 'B' ? { person: 'B' as const } : {}) })
              // A booking draft waits in an empty place: there is no value of the user to show beside it.
              const draftOnly = w.screen === 'buchung' && w.value === null && w.proposal !== null
              return (
              <View key={id} style={{ gap: theme.space.s1, marginTop: theme.space.s3 }}>
                {w.person === 'B' ? <Text style={styles.hint}>{t('bestaetigung.personB')}</Text> : null}
                <Text style={styles.sectionBody}>{fieldLabel(t, w)}</Text>
                {draftOnly ? null : (
                  <>
                    <Text style={styles.sectionTitle}>{valueText(t, w, w.value)}</Text>
                    <Text style={styles.hint}>{provenanceText(t, w.provenance)}</Text>
                  </>
                )}
                {w.proposal ? (
                  <View style={{ gap: theme.space.s2 }}>
                    <Text style={styles.sectionBody}>
                      {draftOnly
                        ? t('bestaetigung.buchung.vorschlag', { herkunft: provenanceText(t, w.proposal.provenance), buchung: valueText(t, w, w.proposal.value) })
                        : t('bestaetigung.vorschlag', {
                            herkunft: provenanceText(t, w.proposal.provenance),
                            neu: valueText(t, w, w.proposal.value),
                            alt: valueText(t, w, w.value),
                          })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: theme.space.s2 }}>
                      <Button
                        variant="ghost"
                        disabled={decide.isPending}
                        testID={`vorschlag-annehmen-${id}`}
                        onPress={() => void afterChange(() => decide.mutateAsync({ jahr: year, key: w.key, data: decision('annehmen') }))}
                      >
                        {t('bestaetigung.vorschlagAnnehmen')}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={decide.isPending}
                        testID={`vorschlag-verwerfen-${id}`}
                        onPress={() => void afterChange(() => decide.mutateAsync({ jahr: year, key: w.key, data: decision('verwerfen') }))}
                      >
                        {t('bestaetigung.vorschlagVerwerfen')}
                      </Button>
                    </View>
                  </View>
                ) : null}
              </View>
              )
            })}
            <View style={{ gap: theme.space.s2, marginTop: theme.space.s4 }}>
              {annex.unconfirmed > 0 ? (
                <Button
                  disabled={confirm.isPending}
                  testID={`bestaetige-${annex.annex}`}
                  onPress={() => void afterChange(() => confirm.mutateAsync({ jahr: year, anlage: annex.annex }))}
                >
                  {t('bestaetigung.anlageBestaetigen', { anlage: annexName })}
                </Button>
              ) : null}
              {/* A booking is changed by taking or dropping its draft here; there is no mask to open for it. */}
              {firstScreen && firstScreen !== 'buchung' ? (
                <Button variant="ghost" testID={`aendern-${annex.annex}`} onPress={() => onOpenScreen(firstScreen)}>
                  {t('bestaetigung.einzelnAendern')}
                </Button>
              ) : null}
            </View>
          </Card>
        )
      })}
    </ScrollView>
  )
}
