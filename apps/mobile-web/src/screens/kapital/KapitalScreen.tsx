import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  useCapitalControllerGet,
  useCapitalControllerSetField,
  useCapitalControllerSetOwner,
  useLinkControllerGet,
  useCapitalControllerGetMostFavourableCheck,
  getCapitalControllerGetQueryKey,
  getCapitalControllerGetMostFavourableCheckQueryKey,
  type KapitalFeldDto,
  type KapitalResponseDto,
  type GuenstigerpruefungDto,
} from '@steuereule/api-client'
import type { CapitalFieldId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { integerFrom } from '../shared/ganzzahl'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { CatalogScreen } from '../katalog/KatalogScreen'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

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
  }

  function send(field: CapitalFieldId, data: KapitalFeldDto) {
    setField.mutate({ jahr: taxYear, feld: field, data }, { onSuccess: invalidate })
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('kapital.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('kapital.heading')}</Text>
      <Text style={styles.help}>{tr('kapital.help')}</Text>

      <DepotNotice kind={response.depot.kind} />
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
                onPress={() => setOwner.mutate({ jahr: taxYear, data: { inhaber } }, { onSuccess: invalidate })}
                testID={`kapital-inhaber-${inhaber}`}
              >
                {tr(`kapital.inhaber.${inhaber}`)}
              </Chip>
            ))}
          </View>
        </Feld>
      ) : null}

      {response.requiredFields.map((field) => (
        <CapitalFieldEditor
          key={field}
          label={field === 'kapitalertraege' ? tr('kapital.feld.label') : tr(`kapital.felder.${field}`)}
          state={response[field]}
          onRecorded={(value) => send(field, { kind: 'erfasst', value })}
          onUnclear={() => send(field, { kind: 'unklar' })}
        />
      ))}

      <ItemNotice response={response} />

      <MostFavourableCheckSection taxYear={taxYear} />

      <Button onPress={onDone} style={styles.cta}>
        {tr('kapital.weiter')}
      </Button>
    </ScrollView>
  )
}

function DepotNotice({ kind }: { readonly kind: KapitalResponseDto['depot']['kind'] }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const text =
    kind === 'deutscher-broker'
      ? tr('kapital.depot.deutscherBroker')
      : kind === 'auslaendischer-broker'
        ? tr('kapital.depot.auslaendischerBroker')
        : kind === 'krypto'
          ? tr('kapital.depot.krypto')
          : tr('kapital.depot.unbekannt')
  return <Text style={s.depotText}>{text}</Text>
}

function CapitalFieldEditor({
  label,
  state,
  onRecorded,
  onUnclear,
}: {
  readonly label: string
  readonly state: KapitalFeldDto
  readonly onRecorded: (value: number) => void
  readonly onUnclear: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(state.kind === 'erfasst' ? String(state.value) : '')

  function commit() {
    const value = integerFrom(text)
    if (value === null) return
    if (state.kind === 'erfasst' && state.value === value) return
    onRecorded(value)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={state.kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={tr('kapital.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('kapital.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnclear} style={s.unklarButton}>
          <Text style={state.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('kapital.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function ItemNotice({ response }: { readonly response: KapitalResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const items = response.items[0]

  if (items === undefined) {
    return <Text style={s.postenOffen}>{tr('kapital.posten.offen')}</Text>
  }
  return (
    <View style={s.postenBlock}>
      <Text style={s.postenHeading}>{tr('kapital.posten.heading')}</Text>
      <Text style={s.postenBetrag}>{`${items.amount} €`}</Text>
      <Text style={s.postenHerkunft}>{tr('kapital.posten.herkunft')}</Text>
    </View>
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
        <Text style={s.zahl}>{`${dto.flatRateTax ?? 0} €`}</Text>
      </Card>

      <Card>
        <Text style={s.zahlLabel}>{tr('kapital.guenstigerpruefung.persoenlich')}</Text>
        <Text style={s.zahl}>{`${dto.personal ?? 0} €`}</Text>
      </Card>

      {dto.uncertainty?.kind === 'unbestimmt' ? (
        <Text style={s.hinweis}>{tr('kapital.guenstigerpruefung.progressionsvorbehaltHinweis')}</Text>
      ) : null}
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
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s4 }
  const depotText: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s3 }
  const fieldRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const unclearButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const unclearLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const unclearActive: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const itemsBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const itemsHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s1 }
  const itemAmount: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'] }
  const itemSource: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s1 }
  const itemsOpen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginVertical: t.space.s3 }
  const resultBlock: ViewStyle = { marginTop: t.space.s4 }
  const resultHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, marginBottom: t.space.s2 }
  const statement: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.xl, marginBottom: t.space.s3 }
  const numberLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.mono, fontSize: t.size.xs, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s1 }
  const number: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], fontVariant: ['tabular-nums'], marginBottom: t.space.s2 }
  const notice: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s3 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    depotText,
    feldRow: fieldRow,
    unklarButton: unclearButton,
    unklarLabel: unclearLabel,
    unklarActive: unclearActive,
    postenBlock: itemsBlock,
    postenHeading: itemsHeading,
    postenBetrag: itemAmount,
    postenHerkunft: itemSource,
    postenOffen: itemsOpen,
    resultBlock,
    resultHeading,
    aussage: statement,
    zahlLabel: numberLabel,
    zahl: number,
    hinweis: notice,
    cta,
  }
}
