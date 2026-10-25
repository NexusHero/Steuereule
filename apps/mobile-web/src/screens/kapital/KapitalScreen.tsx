// Kapital-Screen (REQ-025, ticket 10.5) — die Kapitalerträge (product ADR-032, Anlage KAP):
// die Depot-Einordnung (Deutscher / Ausländischer Broker / Krypto, abgeleitet aus der Interview-
// Antwort `kap-depot`), das Kapitalerträge-Feld (ehrlich erfasst/offen/unklar) und — wo Abgeltung-
// steuer tatsächlich einbehalten wurde — die § 32d Abs. 6 Günstigerprüfung als bounded comparison
// (ADR-0034-Muster): `aussage`/`kind` wird ZUERST gelesen, nie ein nacktes Urteil.
//
// NAMENS-DISZIPLIN (ADR-0034 §1): DIESER Screen trägt "Günstigerprüfung" (§ 32d Abs. 6) — der
// Veranlagungsartenvergleich (10.2) heißt nicht so. Zwei Vergleiche, zwei Namen.
//
// Der Client bleibt dumm (ADR-0033): jede Zahl — der Kapital-Posten UND die Günstigerprüfung —
// kommt aus der API (der Kern entscheidet, was wahr ist); jeder Edit ist ein PUT.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  useKapitalControllerGet,
  useKapitalControllerSetFeld,
  useKapitalControllerGetGuenstigerpruefung,
  getKapitalControllerGetQueryKey,
  getKapitalControllerGetGuenstigerpruefungQueryKey,
  type KapitalFeldDto,
  type KapitalResponseDto,
  type GuenstigerpruefungDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getKapitalControllerGetQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getKapitalControllerGetGuenstigerpruefungQueryKey(taxYear) })
  }

  function send(data: KapitalFeldDto) {
    setFeld.mutate({ jahr: taxYear, feld: 'kapitalertraege', data }, { onSuccess: invalidate })
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('kapital.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('kapital.heading')}</Text>
      <Text style={styles.help}>{tr('kapital.help')}</Text>

      <DepotNotice kind={response.depot.kind} />

      <KapitalFeldEditor
        label={tr('kapital.feld.label')}
        zustand={response.kapitalertraege}
        onErfasst={(wert) => send({ kind: 'erfasst', wert })}
        onUnklar={() => send({ kind: 'unklar' })}
      />

      <PostenNotice response={response} />

      <GuenstigerpruefungAbschnitt taxYear={taxYear} />

      <Button onPress={onDone} style={styles.cta}>
        {tr('kapital.weiter')}
      </Button>
    </ScrollView>
  )
}

/** Die Depot-Einordnung: was die `kap-depot`-Antwort für die Steuererklärung BEDEUTET (ehrlich benannt). */
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

/** Ein Kapital-Feld: numerische Eingabe wenn `erfasst`, plus der ehrliche "unlesbar"-Fallback. */
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

  function submit() {
    const wert = Number(text)
    if (Number.isInteger(wert) && wert >= 0) onErfasst(wert)
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
          onSubmit={submit}
          accessibilityLabel={`${label} (${tr('kapital.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnklar} style={s.unklarButton}>
          <Text style={zustand.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('kapital.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

/** Der abgeleitete Kapital-Posten mit Herkunft, oder der ehrliche "noch offen"-Hinweis. */
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

/** Die § 32d Abs. 6 Günstigerprüfung — `aussage`/`kind` ZUERST, nie ein nacktes Urteil. */
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

/** Das Ergebnis der Günstigerprüfung: `kind` zuerst lesen, dann das, was die Variante erlaubt. */
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
