import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  useKapitalControllerGet,
  useKapitalControllerSetFeld,
  useKapitalControllerSetInhaber,
  useKopplungControllerGet,
  useKapitalControllerGetGuenstigerpruefung,
  getKapitalControllerGetQueryKey,
  getKapitalControllerGetGuenstigerpruefungQueryKey,
  type KapitalFeldDto,
  type KapitalResponseDto,
  type GuenstigerpruefungDto,
} from '@steuereule/api-client'
import type { KapitalFeldId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { ganzzahlAus } from '../shared/ganzzahl'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { KatalogScreen } from '../katalog/KatalogScreen'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface KapitalScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function KapitalScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: KapitalScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useKapitalControllerGet(taxYear)
  const setFeld = useKapitalControllerSetFeld()
  const setInhaber = useKapitalControllerSetInhaber()
  const kopplung = useKopplungControllerGet(taxYear)
  const zusammen = kopplung.data?.status === 200 && kopplung.data.data.veranlagungsart === 'zusammen'

  // The depot / the kind of letting is a catalogue answer; the mask can ask it right here.
  const [frageOffen, setFrageOffen] = useState(false)

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

  if (frageOffen) {
    const zurueck = () => {
      setFrageOffen(false)
      void query.refetch()
    }
    return <KatalogScreen taxYear={taxYear} entry="einkuenfte" onDone={zurueck} onBack={zurueck} />
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getKapitalControllerGetQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getKapitalControllerGetGuenstigerpruefungQueryKey(taxYear) })
  }

  function send(feld: KapitalFeldId, data: KapitalFeldDto) {
    setFeld.mutate({ jahr: taxYear, feld, data }, { onSuccess: invalidate })
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
        <Button variante="ghost" onPress={() => setFrageOffen(true)} testID="kapital-frage-beantworten">
          {tr('katalog.einkuenfteBeantworten')}
        </Button>
      ) : null}

      {zusammen ? (
        <Feld label={tr('kapital.inhaber.frage')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {(['A', 'B', 'gemeinsam'] as const).map((inhaber) => (
              <Chip
                key={inhaber}
                aktiv={(response.inhaber ?? 'A') === inhaber}
                onPress={() => setInhaber.mutate({ jahr: taxYear, data: { inhaber } }, { onSuccess: invalidate })}
                testID={`kapital-inhaber-${inhaber}`}
              >
                {tr(`kapital.inhaber.${inhaber}`)}
              </Chip>
            ))}
          </View>
        </Feld>
      ) : null}

      {response.pflichtfelder.map((feld) => (
        <KapitalFeldEditor
          key={feld}
          label={feld === 'kapitalertraege' ? tr('kapital.feld.label') : tr(`kapital.felder.${feld}`)}
          zustand={response[feld]}
          onErfasst={(wert) => send(feld, { kind: 'erfasst', wert })}
          onUnklar={() => send(feld, { kind: 'unklar' })}
        />
      ))}

      <PostenNotice response={response} />

      <GuenstigerpruefungAbschnitt taxYear={taxYear} />

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

function KapitalFeldEditor({
  label,
  zustand,
  onErfasst,
  onUnklar,
}: {
  readonly label: string
  readonly zustand: KapitalFeldDto
  readonly onErfasst: (wert: number) => void
  readonly onUnklar: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(zustand.kind === 'erfasst' ? String(zustand.wert) : '')

  function commit() {
    const wert = ganzzahlAus(text)
    if (wert === null) return
    if (zustand.kind === 'erfasst' && zustand.wert === wert) return
    onErfasst(wert)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={zustand.kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={tr('kapital.feld.placeholder')}
          onSubmit={commit}
          onBlur={commit}
          accessibilityLabel={`${label} (${tr('kapital.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnklar} style={s.unklarButton}>
          <Text style={zustand.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('kapital.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function PostenNotice({ response }: { readonly response: KapitalResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const posten = response.posten[0]

  if (posten === undefined) {
    return <Text style={s.postenOffen}>{tr('kapital.posten.offen')}</Text>
  }
  return (
    <View style={s.postenBlock}>
      <Text style={s.postenHeading}>{tr('kapital.posten.heading')}</Text>
      <Text style={s.postenBetrag}>{`${posten.betrag} €`}</Text>
      <Text style={s.postenHerkunft}>{tr('kapital.posten.herkunft')}</Text>
    </View>
  )
}

function GuenstigerpruefungAbschnitt({ taxYear }: { readonly taxYear: number }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const query = useKapitalControllerGetGuenstigerpruefung(taxYear, undefined)

  if (query.isPending) return null
  if (query.isError || query.data.status !== 200) return null
  const dto = query.data.data
  if (dto === null) return null

  return (
    <View style={s.resultBlock}>
      <Text style={s.resultHeading}>{tr('kapital.guenstigerpruefung.heading')}</Text>
      <Ergebnis dto={dto} />
    </View>
  )
}

function Ergebnis({ dto }: { readonly dto: GuenstigerpruefungDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)

  if (dto.kind === 'nicht-anwendbar') {
    const text =
      dto.grund === 'keine-abgeltung-einbehalten'
        ? tr('kapital.guenstigerpruefung.keineAbgeltungEinbehalten')
        : dto.grund === 'krypto-gegated'
          ? tr('kapital.guenstigerpruefung.kryptoGegated')
          : dto.grund === 'keine-kapitalertraege'
            ? tr('kapital.guenstigerpruefung.keineKapitalertraege')
            : tr('kapital.guenstigerpruefung.kapDepotNichtBeantwortet')
    return <Text style={s.aussage}>{text}</Text>
  }

  const aussage =
    dto.kind === 'eindeutig'
      ? dto.empfehlung === 'persoenlich'
        ? tr('kapital.guenstigerpruefung.eindeutigPersoenlich')
        : tr('kapital.guenstigerpruefung.eindeutigAbgeltung')
      : dto.kind === 'zu-knapp'
        ? tr('kapital.guenstigerpruefung.zuKnapp')
        : tr('kapital.guenstigerpruefung.unbestimmt')

  return (
    <View>
      <Text style={s.aussage} testID="guenstigerpruefung-aussage">
        {aussage}
      </Text>

      <Card>
        <Text style={s.zahlLabel}>{tr('kapital.guenstigerpruefung.abgeltung')}</Text>
        <Text style={s.zahl}>{`${dto.abgeltung ?? 0} €`}</Text>
      </Card>

      <Card>
        <Text style={s.zahlLabel}>{tr('kapital.guenstigerpruefung.persoenlich')}</Text>
        <Text style={s.zahl}>{`${dto.persoenlich ?? 0} €`}</Text>
      </Card>

      {dto.unschaerfe?.kind === 'unbestimmt' ? (
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
  const feldRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const unklarButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const unklarLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const unklarActive: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const postenBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const postenHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s1 }
  const postenBetrag: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'] }
  const postenHerkunft: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s1 }
  const postenOffen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginVertical: t.space.s3 }
  const resultBlock: ViewStyle = { marginTop: t.space.s4 }
  const resultHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, marginBottom: t.space.s2 }
  const aussage: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.xl, marginBottom: t.space.s3 }
  const zahlLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.mono, fontSize: t.size.xs, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s1 }
  const zahl: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], fontVariant: ['tabular-nums'], marginBottom: t.space.s2 }
  const hinweis: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s3 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    depotText,
    feldRow,
    unklarButton,
    unklarLabel,
    unklarActive,
    postenBlock,
    postenHeading,
    postenBetrag,
    postenHerkunft,
    postenOffen,
    resultBlock,
    resultHeading,
    aussage,
    zahlLabel,
    zahl,
    hinweis,
    cta,
  }
}
