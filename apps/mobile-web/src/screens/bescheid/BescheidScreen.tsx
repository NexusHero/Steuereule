// BescheidScreen (REQ-023, ticket 10.3) — die Bescheidprüfung: der Steuerbescheid wird Feld für
// Feld eingetippt (ADR-036 Scan-Fallback; das PDF/der Beleg bleibt als Beleg liegen, Scan/OCR ist
// OUT of scope, ADR-045), seine Beträge werden gegen den deterministischen Kern abgeglichen
// (`gleicheBescheidAb` — Abweichungen als sichtbarer Diff, nie still), und nach dem Bescheid gibt
// es den Einspruch-Flow (§ 355 AO Fristen-Countdown + Grund-Auswahl, Produkt-ADR-009).
//
// Der Client bleibt dumm (ADR-0033): jeder Zustand — die fünf Feld-Zustände, der Abgleich, die
// Frist und die legalen Folge-Übergänge — kommt aus `GET /v1/steuerjahre/{jahr}/bescheid`; jede
// Schreiboperation ist ein PUT gegen die echte API. Die Übergänge werden SERVER-seitig validiert
// (istBescheidUebergangErlaubt) — der Screen bietet nur `naechsteZustaende` an, kein stiller
// Übergang.
//
// ADR-032 §2 / ADR-009: NACH dem Bescheid gibt es KEINEN „Korrigieren"-Button — das Wort wäre eine
// falsche Zusage (Korrektur ist der VOR-Bescheid-Flow, ADR-009). Hier gibt es nur den Einspruch.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Feld, Input, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import {
  useBescheidControllerGet,
  useBescheidControllerSetDatum,
  useBescheidControllerSetEinspruch,
  useBescheidControllerSetFeld,
  useBescheidControllerSetStatus,
  getBescheidControllerGetQueryKey,
  type BescheidAbweichungDto,
  type BescheidResponseDto,
  type PutBescheidFeldDto,
  type SetBescheidStatusDtoStatus,
  type SetEinspruchDtoGrund,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

type FeldId = 'einnahmen' | 'vorsorgeaufwand' | 'anrechnung' | 'festgesetzteSteuer' | 'erstattung'

const FELDER: readonly { id: FeldId; labelKey: string }[] = [
  { id: 'einnahmen', labelKey: 'bescheid.felder.einnahmen' },
  { id: 'vorsorgeaufwand', labelKey: 'bescheid.felder.vorsorgeaufwand' },
  { id: 'anrechnung', labelKey: 'bescheid.felder.anrechnung' },
  { id: 'festgesetzteSteuer', labelKey: 'bescheid.felder.festgesetzteSteuer' },
  { id: 'erstattung', labelKey: 'bescheid.felder.erstattung' },
]

const GRUENDE: readonly { id: 'betrag-falsch' | 'beleg-nicht-beruecksichtigt' | 'sonstiges'; labelKey: string }[] = [
  { id: 'betrag-falsch', labelKey: 'bescheid.einspruch.grund.betrag-falsch' },
  { id: 'beleg-nicht-beruecksichtigt', labelKey: 'bescheid.einspruch.grund.beleg-nicht-beruecksichtigt' },
  { id: 'sonstiges', labelKey: 'bescheid.einspruch.grund.sonstiges' },
]

export interface BescheidScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function BescheidScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: BescheidScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useBescheidControllerGet(taxYear)
  const setFeld = useBescheidControllerSetFeld()
  const setDatum = useBescheidControllerSetDatum()
  const setStatus = useBescheidControllerSetStatus()
  const setEinspruch = useBescheidControllerSetEinspruch()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('bescheid.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('bescheid.loadError.heading')}
        message={tr('bescheid.loadError.message')}
        retryLabel={tr('bescheid.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const response = query.data.data

  const refetch = () => void queryClient.invalidateQueries({ queryKey: getBescheidControllerGetQueryKey(taxYear) })

  function sendFeld(feld: FeldId, data: PutBescheidFeldDto) {
    setFeld.mutate({ jahr: taxYear, feld, data }, { onSuccess: refetch })
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('bescheid.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading}>{tr('bescheid.heading')}</Text>
      <Text style={styles.help}>{tr('bescheid.help')}</Text>

      <FristBanner frist={response.frist} />

      {FELDER.map((feld) => (
        <BescheidFeldEditor
          key={feld.id}
          feldId={feld.id}
          label={tr(feld.labelKey)}
          zustand={response.felder.find((f) => f.id === feld.id)}
          onErfasst={(wert) => sendFeld(feld.id, { kind: 'erfasst', wert })}
          onUnklar={() => sendFeld(feld.id, { kind: 'unklar' })}
        />
      ))}

      <DatumEditor datum={response.frist.bescheiddatum} onSet={(datum) => setDatum.mutate({ jahr: taxYear, data: { datum } }, { onSuccess: refetch })} />

      <AbgleichSection response={response} />

      <StatusSection response={response} onSetStatus={(status) => setStatus.mutate({ jahr: taxYear, data: { status } }, { onSuccess: refetch })} />

      <EinspruchSection
        response={response}
        onEinspruch={(grund) => setEinspruch.mutate({ jahr: taxYear, data: { grund } }, { onSuccess: refetch })}
      />

      <Button onPress={onDone} style={styles.cta}>
        {tr('bescheid.done')}
      </Button>
    </ScrollView>
  )
}

function FristBanner({ frist }: { readonly frist: BescheidResponseDto['frist'] }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  if (frist.bescheiddatum === null) {
    return (
      <Card variant="nacht">
        <Text style={s.fristHeading}>{tr('bescheid.frist.nochKeinDatum')}</Text>
      </Card>
    )
  }
  const abgelaufen = (frist.verbleibendeTage ?? 0) < 0
  return (
    <Card variant="nacht">
      <Text style={s.fristHeading}>{tr('bescheid.frist.heading')}</Text>
      {abgelaufen ? (
        <Text style={s.fristBody}>{tr('bescheid.frist.abgelaufen', { ende: frist.fristEnde })}</Text>
      ) : (
        <Text style={s.fristBody}>{tr('bescheid.frist.verbleibend', { tage: frist.verbleibendeTage, ende: frist.fristEnde })}</Text>
      )}
    </Card>
  )
}

function BescheidFeldEditor({
  feldId,
  label,
  zustand,
  onErfasst,
  onUnklar,
}: {
  readonly feldId: FeldId
  readonly label: string
  readonly zustand: { kind: 'erfasst' | 'offen' | 'unklar'; wert?: number } | undefined
  readonly onErfasst: (wert: number) => void
  readonly onUnklar: () => void
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const kind = zustand?.kind ?? 'offen'
  const [text, setText] = useState(kind === 'erfasst' ? String(zustand?.wert) : '')

  function submit() {
    const wert = Number(text)
    const gueltig = Number.isInteger(wert) && (feldId === 'erstattung' ? true : wert >= 0)
    if (gueltig) onErfasst(wert)
  }

  return (
    <Feld label={label}>
      <View style={s.feldRow}>
        <Input
          type="numeric"
          mono
          value={kind === 'unklar' ? '' : text}
          onChange={setText}
          placeholder={tr('bescheid.feld.placeholder')}
          onSubmit={submit}
          accessibilityLabel={`${label} (${tr('bescheid.feld.placeholder')})`}
        />
        <Pressable accessibilityRole="button" onPress={onUnklar} style={s.unklarButton}>
          <Text style={kind === 'unklar' ? s.unklarActive : s.unklarLabel}>{tr('bescheid.feld.unklar')}</Text>
        </Pressable>
      </View>
    </Feld>
  )
}

function DatumEditor({ datum, onSet }: { readonly datum: string | null; readonly onSet: (datum: string | null) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [text, setText] = useState(datum ?? '')

  function submit() {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) onSet(text)
  }

  return (
    <Feld label={tr('bescheid.datum.label')}>
      <View style={s.feldRow}>
        <Input
          type="text"
          mono
          value={text}
          onChange={setText}
          placeholder="JJJJ-MM-TT"
          onSubmit={submit}
          accessibilityLabel={tr('bescheid.datum.label')}
        />
      </View>
    </Feld>
  )
}

function AbgleichSection({ response }: { readonly response: BescheidResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const abweichungen = response.abgleich.abweichungen

  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{tr('bescheid.abgleich.heading')}</Text>
      {response.abgleich.berechnungUnvollstaendig ? (
        <Text style={s.muted}>{tr('bescheid.abgleich.unvollstaendig')}</Text>
      ) : null}
      {abweichungen.length === 0 ? (
        <Text style={s.ok}>{tr('bescheid.abgleich.stimmt')}</Text>
      ) : (
        abweichungen.map((a) => <AbweichungZeile key={a.feld} a={a} />)
      )}
    </View>
  )
}

function AbweichungZeile({ a }: { readonly a: BescheidAbweichungDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <Card>
      <View style={s.abweichungHead}>
        <Text style={s.abweichungFeld}>{tr(`bescheid.felder.${a.feld}`)}</Text>
        <Text style={s.abweichungDelta}>{a.differenz > 0 ? '+' : ''}{formatEuro(a.differenz)}</Text>
      </View>
      <Text style={s.abweichungBody}>
        {tr('bescheid.abgleich.zeile', { bescheid: formatEuro(a.bescheid), berechnet: formatEuro(a.berechnet) })}
      </Text>
    </Card>
  )
}

function StatusSection({ response, onSetStatus }: { readonly response: BescheidResponseDto; readonly onSetStatus: (status: SetBescheidStatusDtoStatus) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const naechste = response.naechsteZustaende.filter((z) => z === 'geprüft' || z === 'einspruch-eingelegt') as SetBescheidStatusDtoStatus[]
  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{tr('bescheid.status.heading')}</Text>
      <View style={s.statusRow}>
        <Pill>{tr(`bescheid.status.${response.status}`)}</Pill>
      </View>
      {/* nur die Folge-Zustände, die der Server erlaubt (kein stiller Übergang) — der Einspruch
          hat seinen eigenen Flow unten, daher hier nur „geprüft". */}
      {naechste.includes('geprüft') ? (
        <Button onPress={() => onSetStatus('geprüft')} style={s.cta}>
          {tr('bescheid.status.alsGeprueft')}
        </Button>
      ) : null}
    </View>
  )
}

function EinspruchSection({ response, onEinspruch }: { readonly response: BescheidResponseDto; readonly onEinspruch: (grund: SetEinspruchDtoGrund) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)

  // Nur NACH dem Bescheid und nur wenn der Server „geprüft → einspruch-eingelegt" erlaubt. Es gibt
  // hier bewusst KEINEN „Korrigieren"-Button (ADR-009/ADR-032): nach dem Bescheid ist der
  // Einspruch der einzige Weg, die Korrektur ist der VOR-Bescheid-Flow.
  if (!response.naechsteZustaende.includes('einspruch-eingelegt')) {
    if (response.status === 'einspruch-eingelegt') {
      return (
        <View style={s.section}>
          <Text style={s.sectionHeading}>{tr('bescheid.einspruch.heading')}</Text>
          <Text style={s.ok}>{tr('bescheid.einspruch.eingelegt', { grund: tr(`bescheid.einspruch.grund.${response.einspruchGrund ?? 'sonstiges'}`) })}</Text>
        </View>
      )
    }
    return null
  }

  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{tr('bescheid.einspruch.heading')}</Text>
      <Text style={s.muted}>{tr('bescheid.einspruch.help')}</Text>
      {GRUENDE.map((g) => (
        <Button key={g.id} variante="ghost" onPress={() => onEinspruch(g.id)} style={s.grundButton}>
          {tr(g.labelKey)}
        </Button>
      ))}
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
  const section: ViewStyle = { marginTop: t.space.s4 }
  const sectionHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, marginBottom: t.space.s2 }
  const muted: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s2 }
  const ok: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s2 }
  const fristHeading: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.funkeHell, textTransform: 'uppercase', letterSpacing: 0.08 * t.size.xs, marginBottom: t.space.s2 }
  const fristBody: TextStyle = { color: t.color.nachtText, opacity: 0.85, fontFamily: t.font.text, fontSize: t.size.s }
  const abweichungHead: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.space.s3 }
  const abweichungFeld: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const abweichungDelta: TextStyle = { color: t.color.warn, fontFamily: t.font.mono, fontWeight: t.weight.schwer, fontSize: t.size.m }
  const abweichungBody: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginTop: t.space.s2 }
  const statusRow: ViewStyle = { flexDirection: 'row', gap: t.space.s2, marginBottom: t.space.s2 }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  const grundButton: ViewStyle = { marginTop: t.space.s2 }
  return {
    screen, wideScreen, headerRow, heading, help, feldRow, unklarButton, unklarLabel, unklarActive,
    section, sectionHeading, muted, ok, fristHeading, fristBody, abweichungHead, abweichungFeld,
    abweichungDelta, abweichungBody, statusRow, cta, grundButton,
  }
}
