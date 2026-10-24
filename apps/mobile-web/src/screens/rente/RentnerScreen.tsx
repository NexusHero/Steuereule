// Rentner-Screen (REQ-022, ticket 10.4) — the guided mask for the Rentenbezugsmitteilung
// (product ADR-034, Anlage R). The user picks a Rentenart (product ADR-036 §3) and transcribes
// the Jahresbetrag plus either the Rentenbeginn-Jahr (Besteuerungsanteil path) or the
// Rentenbeginn-Lebensalter (Ertragsanteil path for the private Rentenversicherung). Each field is
// honestly `erfasst` / `offen` / `unklar`, never silently guessed (ADR-032).
//
// The client stays dumb (ADR-0033): every number — the taxable share AND its § 22 Herkunft — comes
// straight from `GET /v1/steuerjahre/{jahr}/rente` (the core's `renteAlsKernposten` decides what is
// true); each edit is a PUT. This screen only renders the field states and sends whole numbers.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  useRenteControllerGet,
  useRenteControllerSetFeld,
  useRenteControllerSetRentenart,
  getRenteControllerGetQueryKey,
  type RenteFeldDto,
  type RenteResponseDto,
} from '@steuereule/api-client'
import { RENTENARTEN, type Rentenart } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

type FeldId = 'jahresbetrag' | 'rentenbeginnJahr' | 'alterBeiRentenbeginn'

export interface RentnerScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function RentnerScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: RentnerScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useRenteControllerGet(taxYear)
  const setArt = useRenteControllerSetRentenart()
  const setFeld = useRenteControllerSetFeld()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('rente.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('rente.loadError.heading')}
        message={tr('rente.loadError.message')}
        retryLabel={tr('rente.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getRenteControllerGetQueryKey(taxYear) })
  }

  function sendArt(art: Rentenart | null) {
    setArt.mutate({ jahr: taxYear, data: { art } }, { onSuccess: invalidate })
  }

  function send(feld: FeldId, data: RenteFeldDto) {
    setFeld.mutate({ jahr: taxYear, feld, data }, { onSuccess: invalidate })
  }

  // Only the field relevant to the chosen Rentenart is shown — the private Rentenversicherung is
  // taxed via the Ertragsanteil (Lebensalter), everything else via the Besteuerungsanteil (Jahr).
  const showsRentenbeginnJahr = response.art !== null && response.art !== 'PrivateRentenversicherung'
  const showsAlter = response.art === 'PrivateRentenversicherung'

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('rente.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('rente.heading')}</Text>
      <Text style={styles.help}>{tr('rente.help')}</Text>

      <Text style={styles.sectionHeading}>{tr('rente.artHeading')}</Text>
      {RENTENARTEN.map((art) => (
        <Pressable
          key={art}
          accessibilityRole="button"
          onPress={() => sendArt(art)}
          style={[styles.artButton, response.art === art ? styles.artButtonActive : null]}
        >
          <Text style={response.art === art ? styles.artLabelActive : styles.artLabel}>{tr(`rente.arten.${art}`)}</Text>
        </Pressable>
      ))}

      <RenteFeldEditor
        label={tr('rente.felder.jahresbetrag')}
        zustand={response.jahresbetrag}
        onErfasst={(wert) => send('jahresbetrag', { kind: 'erfasst', wert })}
        onUnklar={() => send('jahresbetrag', { kind: 'unklar' })}
      />
      {showsRentenbeginnJahr ? (
        <RenteFeldEditor
          label={tr('rente.felder.rentenbeginnJahr')}
          zustand={response.rentenbeginnJahr}
          onErfasst={(wert) => send('rentenbeginnJahr', { kind: 'erfasst', wert })}
          onUnklar={() => send('rentenbeginnJahr', { kind: 'unklar' })}
        />
      ) : null}
      {showsAlter ? (
        <RenteFeldEditor
          label={tr('rente.felder.alterBeiRentenbeginn')}
          zustand={response.alterBeiRentenbeginn}
          onErfasst={(wert) => send('alterBeiRentenbeginn', { kind: 'erfasst', wert })}
          onUnklar={() => send('alterBeiRentenbeginn', { kind: 'unklar' })}
        />
      ) : null}

      <PostenNotice response={response} />

      <Button onPress={onDone} style={styles.cta}>
        {tr('rente.weiter')}
      </Button>
    </ScrollView>
  )
}

/** One Rentner field: a numeric input when `erfasst`, plus the honest "unklar" fallback. */
function RenteFeldEditor({
  label,
  zustand,
  onErfasst,
  onUnklar,
}: {
  readonly label: string
  readonly zustand: RenteFeldDto
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
          placeholder={tr('rente.feld.placeholder')}
          onSubmit={submit}
          accessibilityLabel={`${label} (${tr('rente.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnklar} style={s.unklarButton}>
          <Text style={zustand.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('rente.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

/** The derived taxable share with its § 22 Herkunft, or the honest "not yet determinable" notice. */
function PostenNotice({ response }: { readonly response: RenteResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const posten = response.posten[0]

  if (posten === undefined) {
    return <Text style={s.postenOffen}>{tr('rente.posten.offen')}</Text>
  }
  return (
    <View style={s.postenBlock}>
      <Text style={s.postenHeading}>{tr('rente.posten.heading')}</Text>
      <Text style={s.postenBetrag}>{`${posten.betrag} €`}</Text>
      <Text style={s.postenHerkunft}>{posten.herkunft}</Text>
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
  const sectionHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, marginBottom: t.space.s2 }
  const artButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    marginBottom: t.space.s2,
  }
  const artButtonActive: ViewStyle = { backgroundColor: t.color.funke, borderColor: t.color.funke }
  const artLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s }
  const artLabelActive: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
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
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    help,
    sectionHeading,
    artButton,
    artButtonActive,
    artLabel,
    artLabelActive,
    feldRow,
    unklarButton,
    unklarLabel,
    unklarActive,
    postenBlock,
    postenHeading,
    postenBetrag,
    postenHerkunft,
    postenOffen,
    cta,
  }
}
