import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
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
import { fieldLabelText, instanceText, valueText } from './confirmationText'

export type ConfirmationForm = FieldProvenanceDto['screen']

export interface ConfirmationScreenProps {
  readonly year: number
  readonly onBack: () => void
  /** Opens the mask a value lives on; `field` says which one (the interview's page). */
  readonly onOpenScreen: (screen: ConfirmationForm, field?: string) => void
}

type Tr = ReturnType<typeof useTranslation>['t']


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
  const [stale, setStale] = useState(false)

  if (overview.isPending) return <LoadingState bp={bp} label={t('bestaetigung.loading')} />
  if (overview.data?.status !== 200) {
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
    setStale(false)
    try {
      const result = await action()
      // A value changed after the screen was drawn (MCP-4): nothing was confirmed, the user looks again.
      if (result.status === 409) {
        triggerSaveErrorHaptic()
        setStale(true)
      } else if (result.status !== 200) {
        triggerSaveErrorHaptic()
        setError(true)
      }
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
      {stale ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite" testID="bestaetigung-veraendert">
          {t('bestaetigung.veraendert')}
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
        // Every mask the Anlage's values live on (the Hauptvordruck holds several): one way to each (H2-2, WEB-18).
        const masks = annex.values.filter((w, i, all) => w.screen !== 'buchung' && all.findIndex((other) => other.screen === w.screen) === i)
        const shown = annex.values.filter((w) => !w.confirmed).map((w) => ({ key: w.key, version: w.version, ...(w.person === 'B' ? { person: 'B' as const } : {}) }))
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
                {instanceText(t, w) ? <Text style={styles.hint} testID={`instanz-${id}`}>{instanceText(t, w)}</Text> : null}
                <Text style={styles.sectionBody}>{fieldLabelText(t, w)}</Text>
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
                  onPress={() => void afterChange(() => confirm.mutateAsync({ jahr: year, anlage: annex.annex, data: { values: shown } }))}
                >
                  {t('bestaetigung.anlageBestaetigen', { anlage: annexName })}
                </Button>
              ) : null}
              {/* A booking is changed by taking or dropping its draft here; there is no mask to open for it. */}
              {masks.map((w) => (
                <Button key={w.screen} variant="ghost" testID={`aendern-${annex.annex}-${w.screen}`} onPress={() => onOpenScreen(w.screen, w.field)}>
                  {masks.length === 1 ? t('bestaetigung.einzelnAendern') : t('bestaetigung.aendernIn', { maske: t(`bestaetigung.masken.${w.screen}`) })}
                </Button>
              ))}
            </View>
          </Card>
        )
      })}
    </ScrollView>
  )
}
