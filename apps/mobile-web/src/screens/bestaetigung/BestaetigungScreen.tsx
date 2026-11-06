import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Card, useBreakpoint, useTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import {
  useConfirmationControllerConfirmAnnex,
  useConfirmationControllerDecideProposal,
  useConfirmationControllerGet,
  type AnnexConfirmationDto,
  type ProvenanceDto,
  type FieldProvenanceDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makePrivacyStyles } from '../datenschutz/styles'
import { ErrorState, LoadingState } from '../shared/ScreenState'

export type ConfirmationForm = FieldProvenanceDto['screen']

export interface ConfirmationScreenProps {
  readonly year: number
  readonly onBack: () => void
  readonly onOpenScreen: (screen: ConfirmationForm) => void
}

type Tr = ReturnType<typeof useTranslation>['t']

const NO_AMOUNTS = new Set(['rente.rentenbeginnJahr', 'rente.alterBeiRentenbeginn', 'rente.rentenart', 'vermietung.baujahr'])

function provenanceText(tr: Tr, h: ProvenanceDto): string {
  switch (h.art) {
    case 'nutzer':
      return tr('bestaetigung.herkunft.nutzer')
    case 'uebernahme':
      return tr('bestaetigung.herkunft.uebernahme', { vorjahr: h.vorjahr })
    case 'assistent':
      return h.receiptId ? tr('bestaetigung.herkunft.assistentBeleg', { name: h.name }) : tr('bestaetigung.herkunft.assistent', { name: h.name })
    case 'beleg':
      return tr('bestaetigung.herkunft.beleg')
  }
}

function fieldLabel(tr: Tr, w: FieldProvenanceDto): string {
  if (w.screen === 'kapital' && w.field === 'kapitalertraege') return tr('kapital.feld.label')
  if (w.screen === 'rente' && w.field === 'rentenart') return tr('bestaetigung.felder.rentenart')
  if (w.screen === 'lstb' || w.screen === 'rente' || w.screen === 'kapital' || w.screen === 'vermietung') {
    return tr(`${w.screen}.felder.${w.field}`, { defaultValue: w.field })
  }
  return w.field
}

function valueText(tr: Tr, w: FieldProvenanceDto, value: string | null): string {
  if (value === null) return tr('bestaetigung.leererWert')
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
  const [error, setError] = useState(false)

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

  const afterChange = async (action: () => Promise<{ status: number }>) => {
    setError(false)
    try {
      const result = await action()
      if (result.status !== 200) setError(true)
    } catch {
      setError(true)
    }
    await queryClient.invalidateQueries()
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('bestaetigung.back')} onPress={onBack} style={styles.backButton}>
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle}>{t('bestaetigung.title', { jahr: year })}</Text>
      </View>

      {annexes.length === 0 ? (
        <Text style={styles.sectionBody}>{t('bestaetigung.leer')}</Text>
      ) : (
        <Text style={styles.sectionBody}>{t('bestaetigung.intro')}</Text>
      )}
      {error ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {t('bestaetigung.fehler')}
        </Text>
      ) : null}

      {annexes.map((anlage: AnnexConfirmationDto) => {
        const annexName = t(`bestaetigung.anlagen.${anlage.anlage}`)
        const firstScreen = anlage.values[0]?.screen
        return (
          <Card key={anlage.anlage} style={{ marginBottom: theme.space.s4 }} testID={`anlage-${anlage.anlage}`}>
            <Text style={styles.sectionTitle}>{annexName}</Text>
            <Text style={styles.hint}>
              {anlage.unconfirmed > 0 ? t('bestaetigung.unbestaetigt', { count: anlage.unconfirmed }) : t('bestaetigung.nurVorschlaege')}
            </Text>
            {anlage.values.map((w) => (
              <View key={w.key} style={{ gap: theme.space.s1, marginTop: theme.space.s3 }}>
                <Text style={styles.sectionBody}>{fieldLabel(t, w)}</Text>
                <Text style={styles.sectionTitle}>{valueText(t, w, w.value)}</Text>
                <Text style={styles.hint}>{provenanceText(t, w.provenance)}</Text>
                {w.proposal ? (
                  <View style={{ gap: theme.space.s2 }}>
                    <Text style={styles.sectionBody}>
                      {t('bestaetigung.vorschlag', {
                        herkunft: provenanceText(t, w.proposal.provenance),
                        neu: valueText(t, w, w.proposal.value),
                        alt: valueText(t, w, w.value),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: theme.space.s2 }}>
                      <Button
                        variant="ghost"
                        disabled={decide.isPending}
                        testID={`vorschlag-annehmen-${w.key}`}
                        onPress={() => void afterChange(() => decide.mutateAsync({ jahr: year, key: w.key, data: { decision: 'annehmen' } }))}
                      >
                        {t('bestaetigung.vorschlagAnnehmen')}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={decide.isPending}
                        testID={`vorschlag-verwerfen-${w.key}`}
                        onPress={() => void afterChange(() => decide.mutateAsync({ jahr: year, key: w.key, data: { decision: 'verwerfen' } }))}
                      >
                        {t('bestaetigung.vorschlagVerwerfen')}
                      </Button>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
            <View style={{ gap: theme.space.s2, marginTop: theme.space.s4 }}>
              {anlage.unconfirmed > 0 ? (
                <Button
                  disabled={confirm.isPending}
                  testID={`bestaetige-${anlage.anlage}`}
                  onPress={() => void afterChange(() => confirm.mutateAsync({ jahr: year, anlage: anlage.anlage }))}
                >
                  {t('bestaetigung.anlageBestaetigen', { anlage: annexName })}
                </Button>
              ) : null}
              {firstScreen ? (
                <Button variant="ghost" testID={`aendern-${anlage.anlage}`} onPress={() => onOpenScreen(firstScreen)}>
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
