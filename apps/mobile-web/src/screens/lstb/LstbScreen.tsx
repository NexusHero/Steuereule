// LStB-Masken-Screen (REQ-016, ticket 08 / ticket 15) — the guided fallback mask for
// transcribing a Lohnsteuerbescheinigung (ADR-036 Scan-Fallback). Three fields, each honestly
// `erfasst` (a whole-euro value was typed), `offen` (not reached yet) or `unklar` ("looked but
// could not read" — the honest fallback, never a silent guess). A figure exceeding the
// Bruttoarbeitslohn is a NAMED widerspruch (ADR-008), never silently fixed.
//
// The client stays dumb (ADR-0033): every state — the three field states AND the derived
// `zustand` (unvollstaendig / widerspruch / vollstaendig) — comes straight from
// `GET /v1/steuerjahre/{jahr}/lstb`, and each edit is `PUT .../lstb/{feld}`. The core's
// `lstbZustand` decides what is true; this screen only renders it and sends whole-euro values.
// Scan/OCR is out of scope (ADR-045) — this is the DATA interface only.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  useLstbControllerGetLstb,
  useLstbControllerSetFeld,
  getLstbControllerGetLstbQueryKey,
  type LstbFeldDto,
  type LstbResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

type FeldId = 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung'

const FELDER: readonly { id: FeldId; labelKey: string }[] = [
  { id: 'bruttoarbeitslohn', labelKey: 'lstb.felder.bruttoarbeitslohn' },
  { id: 'lohnsteuer', labelKey: 'lstb.felder.lohnsteuer' },
  { id: 'sozialversicherung', labelKey: 'lstb.felder.sozialversicherung' },
]

export interface LstbScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function LstbScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: LstbScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useLstbControllerGetLstb(taxYear)
  const setFeld = useLstbControllerSetFeld()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('lstb.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('lstb.loadError.heading')}
        message={tr('lstb.loadError.message')}
        retryLabel={tr('lstb.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  function send(feld: FeldId, data: LstbFeldDto) {
    setFeld.mutate(
      { jahr: taxYear, feld, data },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear) })
        },
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('lstb.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('lstb.heading')}</Text>
      <Text style={styles.help}>{tr('lstb.help')}</Text>

      {FELDER.map((feld) => (
        <LstbFeldEditor
          key={feld.id}
          label={tr(feld.labelKey)}
          zustand={response[feld.id]}
          onErfasst={(wert) => send(feld.id, { kind: 'erfasst', wert })}
          onUnklar={() => send(feld.id, { kind: 'unklar' })}
        />
      ))}

      <ZustandNotice response={response} />

      <Button onPress={onDone} style={styles.cta}>
        {tr('lstb.weiter')}
      </Button>
    </ScrollView>
  )
}

/**
 * One LStB field: a numeric input when `erfasst`, plus the honest "unklar" fallback. The value is
 * sent as a whole-euro integer — the mask stores whole euros only (the LStB's cents are rounded
 * away at entry, matching the fold in angestellte.ts).
 */
function LstbFeldEditor({
  label,
  zustand,
  onErfasst,
  onUnklar,
}: {
  readonly label: string
  readonly zustand: LstbFeldDto
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
          placeholder={tr('lstb.feld.placeholder')}
          onSubmit={submit}
          accessibilityLabel={`${label} (${tr('lstb.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnklar} style={s.unklarButton}>
          <Text style={zustand.kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('lstb.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function ZustandNotice({ response }: { readonly response: LstbResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const z = response.zustand

  if (z.kind === 'vollstaendig') {
    return <Text style={s.zustandOk}>{tr('lstb.zustand.vollstaendig')}</Text>
  }
  if (z.kind === 'widerspruch') {
    return (
      <View style={s.widerspruchBlock}>
        <Text style={s.widerspruchHeading}>{tr('lstb.zustand.widerspruch')}</Text>
        {(z.widersprueche ?? []).map((w) => (
          <Text key={w.art} style={s.widerspruchItem}>
            {tr(`lstb.widerspruch.${w.art}`)}
          </Text>
        ))}
      </View>
    )
  }
  return <Text style={s.zustandOffen}>{tr('lstb.zustand.unvollstaendig', { offen: (z.offen ?? []).length, unklar: (z.unklar ?? []).length })}</Text>
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
  const zustandOk: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.m, marginVertical: t.space.s3 }
  const zustandOffen: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginVertical: t.space.s3 }
  const widerspruchBlock: ViewStyle = { marginVertical: t.space.s3, padding: t.space.s3, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s }
  const widerspruchHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const widerspruchItem: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return { screen, wideScreen, headerRow, heading, help, feldRow, unklarButton, unklarLabel, unklarActive, zustandOk, zustandOffen, widerspruchBlock, widerspruchHeading, widerspruchItem, cta }
}
