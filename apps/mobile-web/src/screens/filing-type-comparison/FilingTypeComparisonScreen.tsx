import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, HerkunftsChip, Input, Option, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import {
  useFilingTypeComparisonControllerGetComparison,
  useInterviewControllerGetInterview,
  useMasterDataControllerRead,
  type FilingTypeComparisonControllerGetComparisonParams,
  type FilingTypeComparisonDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface FilingTypeComparisonScreenProps {
  readonly onBack?: () => void
  readonly onDone?: () => void
  readonly taxYear?: number
  readonly embedded?: boolean
  /** The joint return is already recorded for the year: married is a fact here, not a question. */
  readonly marriedKnown?: boolean
}

export function FilingTypeComparisonScreen({
  onBack,
  onDone,
  taxYear = CURRENT_TAX_YEAR,
  embedded = false,
  marriedKnown = false,
}: FilingTypeComparisonScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  // Married is known from the master data or the basis page: start there, the user can still say otherwise.
  const masterData = useMasterDataControllerRead()
  const interview = useInterviewControllerGetInterview(taxYear)
  const knownMarried =
    (masterData.data?.status === 200 && masterData.data.data.familienstand === 'verheiratet') ||
    (interview.data?.status === 200 && interview.data.data.answers.familienstand === 'Verheiratet')
  const [choice, setMarried] = useState<boolean | null>(null)
  const married = marriedKnown || (choice ?? knownMarried)
  const [zveB, setZveB] = useState('')
  const zveBValue = Number(zveB)
  const ready = married && zveB !== '' && Number.isFinite(zveBValue) && zveBValue >= 0

  const params: FilingTypeComparisonControllerGetComparisonParams = ready
    ? { verheiratet: married, zveB: zveBValue }
    : { verheiratet: married }

  const query = useFilingTypeComparisonControllerGetComparison(taxYear, params, { query: { enabled: ready } })

  const content = (
    <>
      {!embedded ? (
        <View style={styles.headerRow}>
          {onBack ? <BackButton accessibilityLabel={tr('veranlagungsartenvergleich.back')} onPress={onBack} /> : <BackButtonSpacer />}
        </View>
      ) : null}

      <Text style={styles.heading}>{tr('veranlagungsartenvergleich.heading')}</Text>

      {marriedKnown ? null : (
        <>
          <Text style={styles.label}>{tr('veranlagungsartenvergleich.verheiratetLabel')}</Text>
          <View style={styles.optionRow}>
            <Option selected={married} onPress={() => setMarried(true)} style={styles.rowOption} testID="verheiratet-ja">
              {tr('veranlagungsartenvergleich.ja')}
            </Option>
            <Option selected={!married} onPress={() => setMarried(false)} style={styles.rowOption} testID="verheiratet-nein">
              {tr('veranlagungsartenvergleich.nein')}
            </Option>
          </View>
        </>
      )}

      {married ? (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{tr('veranlagungsartenvergleich.partnerEinkommenLabel')}</Text>
          <Input
            type="numeric"
            mono
            value={zveB}
            onChange={setZveB}
            placeholder={tr('veranlagungsartenvergleich.partnerEinkommenPlaceholder')}
            testID="zveb-input"
            accessibilityLabel={tr('veranlagungsartenvergleich.partnerEinkommenLabel')}
          />
        </View>
      ) : (
        <Text style={styles.hinweis}>{tr('veranlagungsartenvergleich.nichtVerheiratet')}</Text>
      )}

      {ready && query.isPending ? <LoadingState bp={bp} label={tr('veranlagungsartenvergleich.loading')} /> : null}
      {ready && (query.isError || query.data?.status !== 200) ? (
        <ErrorState
          bp={bp}
          heading={tr('veranlagungsartenvergleich.loadError.heading')}
          message={tr('veranlagungsartenvergleich.loadError.message')}
          retryLabel={tr('veranlagungsartenvergleich.loadError.retry')}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {ready && !query.isPending && query.data?.status === 200 && query.data.data !== null ? (
        <Result dto={query.data.data} />
      ) : null}

      {onDone ? (
        <Button onPress={onDone} style={styles.doneCta} testID="veranlagungsartenvergleich-weiter">
          {tr('veranlagungsartenvergleich.done')}
        </Button>
      ) : null}
    </>
  )

  if (embedded) {
    return <View style={styles.embedded}>{content}</View>
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      {content}
    </ScrollView>
  )
}

function Result({ dto }: { readonly dto: FilingTypeComparisonDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  if (dto.kind === 'nicht-anwendbar') {
    const text = dto.reason === 'keine-einnahmen' ? tr('veranlagungsartenvergleich.keineEinnahmen') : tr('veranlagungsartenvergleich.nichtVerheiratet')
    return <Text style={styles.aussage}>{text}</Text>
  }

  const statement =
    dto.kind === 'eindeutig'
      ? dto.recommendation === 'zusammen'
        ? tr('veranlagungsartenvergleich.eindeutigZusammen')
        : tr('veranlagungsartenvergleich.eindeutigEinzel')
      : dto.kind === 'zu-knapp'
        ? tr('veranlagungsartenvergleich.zuKnapp')
        : tr('veranlagungsartenvergleich.unbestimmt')

  const zveA = dto.provenance?.zveA ?? 0
  const zveB = dto.provenance?.zveB ?? 0
  const calculationPath = tr('veranlagungsartenvergleich.herkunftRechenweg', { zveA, zveB })

  return (
    <View style={styles.resultBlock}>
      <Text style={styles.aussage} testID="aussage">
        {statement}
      </Text>

      <Card>
        <Text style={styles.zahlLabel}>{tr('veranlagungsartenvergleich.einzel')}</Text>
        <Text style={styles.zahl}>{formatEuro(dto.single ?? 0)}</Text>
        <HerkunftsChip source={{ rule: tr('veranlagungsartenvergleich.herkunftRegelEinzel'), calculationPath }} />
      </Card>

      <Card>
        <Text style={styles.zahlLabel}>{tr('veranlagungsartenvergleich.zusammen')}</Text>
        <Text style={styles.zahl}>{formatEuro(dto.joint ?? 0)}</Text>
        <HerkunftsChip source={{ rule: tr('veranlagungsartenvergleich.herkunftRegelZusammen'), calculationPath }} />
      </Card>

      {dto.uncertainty?.kind === 'unbestimmt' ? (
        <Text style={styles.hinweis}>{tr('veranlagungsartenvergleich.progressionsvorbehaltHinweis')}</Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.overview.narrow
  const wideScreen: ViewStyle = t.layout.overview.wide
  const embedded: ViewStyle = { width: '100%' }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const label: TextStyle = { ...t.type.label, color: t.color.tinte, marginBottom: t.space.s2 }
  const optionRow: ViewStyle = { flexDirection: 'row', gap: t.space.s3 }
  // Two options side by side share the row; a full-width option would push the second out of its card.
  const rowOption: ViewStyle = { flex: 1, width: 'auto' }
  const inputBlock: ViewStyle = { marginTop: t.space.s3 }
  const notice: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s3 }
  const resultBlock: ViewStyle = { marginTop: t.space.s5 }
  const statement: TextStyle = { ...t.type.subhead, color: t.color.tinte, marginBottom: t.space.s4 }
  const numberLabel: TextStyle = { ...t.type.meta, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s1 }
  const number: TextStyle = { ...t.type.headline, color: t.color.tinte, fontVariant: ['tabular-nums'], marginBottom: t.space.s2 }
  const doneCta: ViewStyle = { marginTop: t.space.s5 }
  return { screen, wideScreen, embedded, headerRow, heading, label, optionRow, rowOption, inputBlock, hinweis: notice, resultBlock, aussage: statement, zahlLabel: numberLabel, zahl: number, doneCta }
}
