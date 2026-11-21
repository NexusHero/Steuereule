import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import {
  getCapitalControllerGetMostFavourableCheckQueryKey,
  getCapitalControllerGetQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useCapitalControllerGet,
  useCapitalControllerSetField,
  useCapitalControllerSetOwner,
  useLinkControllerGet,
  useCapitalControllerGetMostFavourableCheck,
  type KapitalFeldDto,
  type KapitalResponseDto,
  type GuenstigerpruefungDto,
} from '@steuereule/api-client'
import { formatEuro, type CapitalFieldId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { UnclearableNumberField } from '../shared/UnclearableNumberField'
import { screenHeaderStyles } from '../shared/screenStyles'
import { ItemNotice } from '../shared/ItemNotice'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { missingItems } from '../cockpit/estimateMissing'
import { CatalogScreen } from '../catalog/CatalogScreen'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePendingMutations } from '../shared/usePendingMutations'
import { SaveFailedNotice } from '../shared/SaveFailedNotice'
import { watchSaveResult } from '../shared/saveFeedback'

export interface CapitalScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function CapitalScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: CapitalScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useCapitalControllerGet(taxYear)
  const setField = useCapitalControllerSetField()
  const setOwner = useCapitalControllerSetOwner()
  const link = useLinkControllerGet(taxYear)
  const { track, flushThen, saveFailed } = usePendingMutations()
  const joint = link.data?.status === 200 && link.data.data.filingType === 'zusammen'

  // The depot / the kind of letting is a catalogue answer; the mask can ask it right here.
  const [questionOpen, setQuestionOpen] = useState(false)

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('kapital.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('kapital.loadError.heading')}
        message={tr('kapital.loadError.message')}
        retryLabel={tr('kapital.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  if (questionOpen) {
    const back = () => {
      setQuestionOpen(false)
      void query.refetch()
    }
    return <CatalogScreen taxYear={taxYear} entry="einkuenfte" onDone={back} onBack={back} />
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getCapitalControllerGetQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getCapitalControllerGetMostFavourableCheckQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
  }

  function send(field: CapitalFieldId, data: KapitalFeldDto) {
    track(watchSaveResult(setField.mutateAsync({ jahr: taxYear, feld: field, data })).then(invalidate))
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('kapital.back')} onPress={() => flushThen(onBack)} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('kapital.heading')}</Text>
      <Text style={styles.help}>{tr('kapital.help')}</Text>

      <DepotNotice kind={response.depot.kind} withheld={withheldTax(response)} />
      {response.depot.kind === 'unbekannt' ? (
        <Button variant="ghost" onPress={() => setQuestionOpen(true)} testID="kapital-frage-beantworten">
          {tr('katalog.einkuenfteBeantworten')}
        </Button>
      ) : null}

      {joint ? (
        <Feld label={tr('kapital.inhaber.frage')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {(['A', 'B', 'gemeinsam'] as const).map((inhaber) => (
              <Chip
                key={inhaber}
                active={(response.inhaber ?? 'A') === inhaber}
                onPress={() => track(watchSaveResult(setOwner.mutateAsync({ jahr: taxYear, data: { inhaber } })).then(invalidate))}
                testID={`kapital-inhaber-${inhaber}`}
              >
                {tr(`kapital.inhaber.${inhaber}`)}
              </Chip>
            ))}
          </View>
        </Feld>
      ) : null}

      {response.requiredFields.map((field) => (
        <UnclearableNumberField
          key={field}
          label={field === 'kapitalertraege' ? tr('kapital.feld.label') : tr(`kapital.felder.${field}`)}
          state={response[field]}
          placeholder={tr('kapital.feld.placeholder')}
          unclearLabel={tr('kapital.feld.unklar')}
          testID={`kapital-${field}`}
          onRecorded={(value) => send(field, { kind: 'erfasst', value })}
          onUnclear={() => send(field, { kind: 'unklar' })}
        />
      ))}

      <NetIncomeHint response={response} />

      <ItemNotice
        amount={response.items[0]?.amount}
        openLabel={tr('kapital.posten.offen')}
        heading={tr('kapital.posten.heading')}
        source={tr('kapital.posten.herkunft')}
      />

      <MostFavourableCheckSection taxYear={taxYear} />

      <SaveFailedNotice visible={saveFailed} />
      <Button onPress={() => flushThen(onDone)} style={styles.cta} testID="kapital-weiter">
        {tr('kapital.weiter')}
      </Button>
    </ScrollView>
  )
}

function erfasst(state: KapitalResponseDto['kapitalertraege']): number | null {
  return state.kind === 'erfasst' && state.value !== undefined ? state.value : null
}

/** The withheld capital gains tax as entered: a German bank only „has withheld“ it once it is above 0. */
function withheldTax(response: KapitalResponseDto): number | null {
  return erfasst(response.kapitalertragsteuer)
}

/**
 * The estimate takes the income before the allowance and deducts the full Sparer-Pauschbetrag itself.
 * An allowance used that is larger than the income means the amount after it was entered (682 € over
 * the exemption order instead of 2.682 €): then the tax on it would be 0 € (Echtdatentest 18.11.2026).
 */
function NetIncomeHint({ response }: { readonly response: KapitalResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const income = erfasst(response.kapitalertraege)
  const used = erfasst(response.sparerPauschbetrag)
  if (income === null || used === null || used <= income) return null
  return (
    <Text style={s.depotText} accessibilityRole="alert" testID="kapital-plausi-netto">
      {tr('kapital.feld.plausiNetto', { brutto: formatEuro(income + used) })}
    </Text>
  )
}

function DepotNotice({ kind, withheld }: { readonly kind: KapitalResponseDto['depot']['kind']; readonly withheld: number | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const text =
    kind === 'deutscher-broker'
      ? withheld !== null && withheld > 0
        ? tr('kapital.depot.deutscherBroker')
        : tr('kapital.depot.deutscherBrokerOhneSteuer')
      : kind === 'auslaendischer-broker'
        ? tr('kapital.depot.auslaendischerBroker')
        : kind === 'krypto'
          ? tr('kapital.depot.krypto')
          : tr('kapital.depot.unbekannt')
  return (
    <Text style={s.depotText} testID="kapital-depot-hinweis">
      {text}
    </Text>
  )
}

function MostFavourableCheckSection({ taxYear }: { readonly taxYear: number }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const query = useCapitalControllerGetMostFavourableCheck(taxYear, undefined)

  if (query.isPending) return null
  if (query.isError || query.data.status !== 200) return null
  const dto = query.data.data
  if (dto === null) return null

  return (
    <View style={s.resultBlock}>
      <Text style={s.resultHeading}>{tr('kapital.guenstigerpruefung.heading')}</Text>
      <Result dto={dto} />
    </View>
  )
}

function Result({ dto }: { readonly dto: GuenstigerpruefungDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)

  if (dto.kind === 'nicht-anwendbar') {
    const text =
      dto.reason === 'keine-abgeltung-einbehalten'
        ? tr('kapital.guenstigerpruefung.keineAbgeltungEinbehalten')
        : dto.reason === 'krypto-gegated'
          ? tr('kapital.guenstigerpruefung.kryptoGegated')
          : dto.reason === 'keine-kapitalertraege'
            ? tr('kapital.guenstigerpruefung.keineKapitalertraege')
            : dto.reason === 'schaetzung-offen'
              ? tr('kapital.guenstigerpruefung.schaetzungOffen', { liste: missingList(dto.missing ?? [], tr) })
              : dto.reason === 'schaetzung-nicht-moeglich'
                ? tr('kapital.guenstigerpruefung.schaetzungNichtMoeglich', { grund: tr(`cockpit.erstattung.grund.${dto.estimateReason ?? 'unbekannt'}`) })
                : tr('kapital.guenstigerpruefung.kapDepotNichtBeantwortet')
    return <Text style={s.aussage}>{text}</Text>
  }

  const statement =
    dto.kind === 'eindeutig'
      ? dto.recommendation === 'persoenlich'
        ? tr('kapital.guenstigerpruefung.eindeutigPersoenlich')
        : tr('kapital.guenstigerpruefung.eindeutigAbgeltung')
      : dto.kind === 'zu-knapp'
        ? tr('kapital.guenstigerpruefung.zuKnapp')
        : tr('kapital.guenstigerpruefung.unbestimmt')

  return (
    <View>
      <Text style={s.aussage} testID="guenstigerpruefung-aussage">
        {statement}
      </Text>

      <Card>
        <Text style={s.zahlLabel}>{tr('kapital.guenstigerpruefung.abgeltung')}</Text>
        <Text style={s.zahl} testID="guenstigerpruefung-abgeltung">{formatEuro(dto.flatRateTax ?? 0)}</Text>
      </Card>

      <Card>
        <Text style={s.zahlLabel}>{tr('kapital.guenstigerpruefung.persoenlich')}</Text>
        <Text style={s.zahl} testID="guenstigerpruefung-persoenlich">{formatEuro(dto.personal ?? 0)}</Text>
      </Card>

      <Card>
        <Text style={s.zahlLabel}>{tr('kapital.guenstigerpruefung.unterschied')}</Text>
        <Text style={s.zahl} testID="guenstigerpruefung-unterschied">{formatEuro(Math.abs(dto.delta ?? 0))}</Text>
      </Card>

      {dto.estimateTreatment ? (
        <Text style={s.hinweis}>
          {tr(dto.estimateTreatment === 'abgeltung' ? 'kapital.guenstigerpruefung.schaetzungAbgeltung' : 'kapital.guenstigerpruefung.schaetzungQuelle')}
        </Text>
      ) : null}

      {dto.uncertainty?.kind === 'unbestimmt' ? (
        <Text style={s.hinweis}>{tr('kapital.guenstigerpruefung.progressionsvorbehaltHinweis')}</Text>
      ) : null}
    </View>
  )
}

/** The estimate's missing ids in the Cockpit's own words; Person B's with a prefix. */
function missingList(ids: readonly string[], tr: ReturnType<typeof useTranslation<typeof APP_NS>>['t']): string {
  return missingItems(ids)
    .map((item) => {
      const was =
        item.id === 'veranlagungsart'
          ? tr('kapital.guenstigerpruefung.fehltVeranlagungsart')
          : tr(item.known ? `cockpit.erstattung.fehlt.${item.id}` : 'cockpit.erstattung.fehlt.sonstiges')
      return item.person === 'B' ? tr('kapital.guenstigerpruefung.fehltPartner', { was }) : was
    })
    .join(', ')
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const depotText: TextStyle = { ...t.type.body, color: t.color.tinte, marginBottom: t.space.s3 }
  const resultBlock: ViewStyle = { marginTop: t.space.s4 }
  const resultHeading: TextStyle = { ...t.type.bodyStrong, color: t.color.tinte, marginBottom: t.space.s2 }
  const statement: TextStyle = { ...t.type.subhead, color: t.color.tinte, marginBottom: t.space.s3 }
  const numberLabel: TextStyle = { ...t.type.meta, color: t.color.tinte2, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s1 }
  const number: TextStyle = { ...t.type.headline, color: t.color.tinte, fontVariant: ['tabular-nums'], marginBottom: t.space.s2 }
  const notice: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s3 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    ...screenHeaderStyles(t),
    depotText,
    resultBlock,
    resultHeading,
    aussage: statement,
    zahlLabel: numberLabel,
    zahl: number,
    hinweis: notice,
    cta,
  }
}
