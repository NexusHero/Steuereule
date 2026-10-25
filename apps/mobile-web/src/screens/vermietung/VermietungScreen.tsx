// Vermietung-Screen (REQ-026, ticket 10.6) — the guided mask for several ganzjährig vermietete
// objects (product ADR-033, Anlage V einfach). Each object carries four honest fields
// (Mieteinnahmen, Anschaffungskosten, Baujahr, Werbungskosten — erfasst/offen/unklar, never
// silently guessed, ADR-032) and its derived facts: the Mieteinnahmen-Posten, the Werbungskosten
// and the lineare AfA (§ 7 Abs. 4 Satz 1 EStG) with Herkunft — reported, never subtracted (the
// net calc is a later slice's work). Verkauf/möbliert stays gated (ADR-033 — honest statement,
// no half feature).
//
// The client stays dumb (ADR-0033): every number comes straight from the API (the core decides
// what is true); each edit is a PUT, each new object a POST.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro, VERMIETUNG_FELDER, type VermietungFeldId } from '@steuereule/core'
import {
  getVermietungControllerGetQueryKey,
  useVermietungControllerCreate,
  useVermietungControllerGet,
  useVermietungControllerSetFeld,
  type VermietungFeldDto,
  type VermietungResponseDto,
  type VermietungsobjektDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface VermietungScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function VermietungScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: VermietungScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useVermietungControllerGet(taxYear)
  const createObjekt = useVermietungControllerCreate()
  const setFeld = useVermietungControllerSetFeld()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('vermietung.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('vermietung.loadError.heading')}
        message={tr('vermietung.loadError.message')}
        retryLabel={tr('vermietung.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getVermietungControllerGetQueryKey(taxYear) })
  }

  function send(objektId: string, feld: VermietungFeldId, data: VermietungFeldDto) {
    setFeld.mutate({ jahr: taxYear, objektId, feld, data }, { onSuccess: invalidate })
  }

  function addObjekt() {
    createObjekt.mutate({ jahr: taxYear }, { onSuccess: invalidate })
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('vermietung.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('vermietung.heading')}</Text>
      <Text style={styles.help}>{tr('vermietung.help')}</Text>

      <EinordnungNotice kind={response.einordnung.kind} />

      {response.objekte.map((objekt, index) => (
        <ObjektCard key={objekt.id} objekt={objekt} index={index} onSend={(feld, data) => send(objekt.id, feld, data)} />
      ))}

      {response.einordnung.kind === 'verkauf-oder-moebliert' ? null : (
        <Button variante="ghost" onPress={addObjekt} style={styles.addCta} testID="objekt-hinzufuegen">
          {tr('vermietung.addObjekt')}
        </Button>
      )}

      <StandNotice response={response} />

      <Button onPress={onDone} style={styles.cta}>
        {tr('vermietung.weiter')}
      </Button>
    </ScrollView>
  )
}

/** The server-derived Einordnung — the Verkauf/möbliert gate is named honestly (ADR-033). */
function EinordnungNotice({ kind }: { readonly kind: VermietungResponseDto['einordnung']['kind'] }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const text =
    kind === 'verkauf-oder-moebliert'
      ? tr('vermietung.einordnung.verkaufOderMoebliert')
      : kind === 'unbekannt'
        ? tr('vermietung.einordnung.unbekannt')
        : tr('vermietung.einordnung.berechenbar')
  return <Text style={styles.notice}>{text}</Text>
}

/** ONE object: the four field editors plus the derived facts (Miete, Werbungskosten, AfA). */
function ObjektCard({
  objekt,
  index,
  onSend,
}: {
  readonly objekt: VermietungsobjektDto
  readonly index: number
  readonly onSend: (feld: VermietungFeldId, data: VermietungFeldDto) => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  return (
    <Card style={styles.objektCard}>
      <Text style={styles.objektHeading}>{tr('vermietung.objektHeading', { index: index + 1 })}</Text>
      {VERMIETUNG_FELDER.map((feld) => (
        <VermietungFeldEditor
          key={feld}
          label={tr(`vermietung.felder.${feld}`)}
          zustand={objekt[feld]}
          onErfasst={(wert) => onSend(feld, { kind: 'erfasst', wert })}
          onUnklar={() => onSend(feld, { kind: 'unklar' })}
        />
      ))}
      <FaktenNotice objekt={objekt} />
    </Card>
  )
}

/** One field: a numeric input when `erfasst`, plus the honest "unlesbar" fallback. */
function VermietungFeldEditor({
  label,
  zustand,
  onErfasst,
  onUnklar,
}: {
  readonly label: string
  readonly zustand: VermietungFeldDto
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
          placeholder={tr('vermietung.feld.placeholder')}
          onSubmit={submit}
          accessibilityLabel={`${label} (${tr('vermietung.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnklar} style={s.unklarButton}>
          <Text style={zustand.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('vermietung.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

/** The object's derived facts: Mieteinnahmen, Werbungskosten, AfA with its § 7 Abs. 4 Herkunft. */
function FaktenNotice({ objekt }: { readonly objekt: VermietungsobjektDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { fakten } = objekt

  if (fakten.offenePosten === 3 && fakten.einnahmen === null && fakten.afa === null) {
    return <Text style={styles.faktenOffen}>{tr('vermietung.fakten.leer')}</Text>
  }

  return (
    <View style={styles.faktenBlock}>
      {fakten.einnahmen !== null ? (
        <Text style={styles.faktenZeile}>{tr('vermietung.fakten.miete', { betrag: formatEuro(fakten.einnahmen) })}</Text>
      ) : null}
      {fakten.werbungskosten !== null ? (
        <Text style={styles.faktenZeile}>{tr('vermietung.fakten.werbungskosten', { betrag: formatEuro(fakten.werbungskosten) })}</Text>
      ) : null}
      {fakten.afa !== null ? (
        <View>
          <Text style={styles.faktenZeile}>{tr('vermietung.fakten.afa', { betrag: formatEuro(fakten.afa.betrag) })}</Text>
          <Text style={styles.faktenHerkunft}>{fakten.afa.herkunft}</Text>
        </View>
      ) : null}
      {fakten.offenePosten > 0 ? (
        <Text style={styles.faktenOffen}>{tr('vermietung.fakten.offen', { count: fakten.offenePosten })}</Text>
      ) : null}
    </View>
  )
}

/** The fold over ALL objects: sums reported, never subtracted (partial truth as a partial truth). */
function StandNotice({ response }: { readonly response: VermietungResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { stand } = response
  if (response.objekte.length === 0) return null

  return (
    <View style={styles.standBlock}>
      <Text style={styles.standHeading}>{tr('vermietung.stand.heading')}</Text>
      <Text style={styles.standZeile}>{tr('vermietung.stand.einnahmen', { betrag: formatEuro(stand.einnahmen) })}</Text>
      <Text style={styles.standZeile}>{tr('vermietung.stand.werbungskosten', { betrag: formatEuro(stand.werbungskosten) })}</Text>
      <Text style={styles.standZeile}>{tr('vermietung.stand.afa', { betrag: formatEuro(stand.afa) })}</Text>
      {stand.kind === 'offen' ? (
        <Text style={styles.standOffen}>{tr('vermietung.stand.offen', { count: stand.offenePosten })}</Text>
      ) : null}
      {stand.kind === 'offen' && stand.gegated !== undefined && stand.gegated.includes('Vermietung') ? (
        <Text style={styles.standOffen}>{tr('vermietung.stand.gated')}</Text>
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
  const notice: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    borderLeftWidth: 3,
    borderLeftColor: t.color.funke,
    paddingLeft: t.space.s3,
    marginBottom: t.space.s4,
  }
  const objektCard: ViewStyle = { marginBottom: t.space.s4 }
  const objektHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.l, marginBottom: t.space.s3 }
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
  const faktenBlock: ViewStyle = { marginTop: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const faktenZeile: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s1 }
  const faktenHerkunft: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const faktenOffen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const addCta: ViewStyle = { marginTop: t.space.s2 }
  const standBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const standHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const standZeile: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s1 }
  const standOffen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    notice,
    objektCard,
    objektHeading,
    feldRow,
    unklarButton,
    unklarLabel,
    unklarActive,
    faktenBlock,
    faktenZeile,
    faktenHerkunft,
    faktenOffen,
    addCta,
    standBlock,
    standHeading,
    standZeile,
    standOffen,
    cta,
  }
}
