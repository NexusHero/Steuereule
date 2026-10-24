// BelegeScreen (Ticket 10, Phase 2 Slice 1) — der Beleg-Posteingang (ADR-007/008) als eigener
// Tab. Die Inbox liest die echte `GET /v1/belege` und rendert den ABGELEITETEN Zuordnungs-Zustand
// jedes Belegs ehrlich (ungebunden/vorgeschlagen/zugeordnet/konflikt) — der Zustand kommt von
// @steuereule/core's `zuordnungAusDaten` über die API, wird hier NIE nachgerechnet (ADR-014/048:
// die Wahrheit liegt im Kern, nicht in einer zweiten Kopie).
//
// - ADR-007 (Zuordnung als Vorschlag): ein Datum erzeugt einen Vorschlag ("Regel: Zahlungsdatum"/
//   "Belegdatum"), ein Tap bestätigt via `POST /v1/belege/:id/zuordnung`. Der Screen drängt kein
//   Jahr auf — ungebundene Belege bleiben einfach ungebunden.
// - ADR-008 (Konflikt sichtbar statt stilles Überschreiben): weicht das bestätigte Jahr vom
//   Datums-Vorschlag ab, zeigt der Screen BEIDE Jahre (Amber) und löst NUR über eine explizite
//   Wahl auf — nie durch stilles Überschreiben.
// - ADR-032 §2 (keine Fake-Funktionalität): das Scannen/Fotografieren der Belege (Binary, ADR-036/
//   045) ist bewusst ein Folge-Ticket. Der Screen zeigt das ehrlich als "Scan folgt"-Platzhalter
//   statt eines Scan-/Upload-Buttons, der eine Binary-Speicherung verspräche, die es nicht gibt.
//
// Posture (DoD D16): Belege sind Steuerdaten. Der Screen persistiert NICHTS client-seitig — alle
// Lese-/Schreibvorgänge gehen über die Beleg-API, wo `dateiname` feldverschlüsselt at rest liegt
// (ADR-0008) und jeder Zugriff auditiert wird (REQ-004). Der Screen selbst hält nur flüchtigen
// UI-Zustand (offene Jahres-Override-Felder); kein localStorage/sessionStorage/AsyncStorage.
import { useState } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, HerkunftsChip, Input, Pill, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { useBelegControllerList, useBelegControllerSetZuordnung, getBelegControllerListQueryKey, type BelegResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { LoadingState, ErrorState } from '../shared/ScreenState'

/** The persisted `art` values → i18n keys. Unknown values fall back to the raw string (the
 *  response type is `string | null`, so a forward-compatible value must not crash the screen). */
const ART_LABEL_KEYS: Readonly<Record<string, string>> = {
  Lohnausweis: 'belege.art.lohnausweis',
  Quellensteuer: 'belege.art.quellensteuer',
  Pensionskasse: 'belege.art.pensionskasse',
  Saeule3a: 'belege.art.saeule3a',
  Krankenkasse: 'belege.art.krankenkasse',
  Familienzulage: 'belege.art.familienzulage',
  Rentenbezugsmitteilung: 'belege.art.rentenbezugsmitteilung',
  Sonstiges: 'belege.art.sonstiges',
}

/** A calendar year for the manual override is four digits, nothing else — the API persists an
 *  integer (`SetZuordnungDto.@IsInt`) and the core throws on a non-integer (beleg.ts `ordneZu`). */
const JAHR_RE = /^\d{4}$/

export function BelegeScreen() {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useBelegControllerList()
  const setZuordnung = useBelegControllerSetZuordnung()

  if (query.isPending) {
    return <LoadingState bp={bp} label={tr('belege.loading')} />
  }
  if (query.isError || query.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('belege.loadError.heading')}
        message={tr('belege.loadError.message')}
        retryLabel={tr('belege.loadError.retry')}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const belege = query.data.data
  // "offen" = everything that still needs attention: ungebunden, vorgeschlagen, konflikt.
  const offen = belege.filter((b) => b.zuordnung.kind !== 'zugeordnet').length

  // The one assignment operation (ADR-007 "ein Tap bestätigt", or a manual year that may
  // contradict the suggestion → the server's derived state reports `konflikt`, ADR-008).
  // `vorschlagVerworfen` is ADR-008's "bei meinem Jahr bleiben": persist the dismissal of a
  // contradicting suggestion, keeping `steuerjahr`. On success the list is refetched so the
  // derived state never goes stale client-side.
  function ordneZu(id: string, steuerjahr: number, vorschlagVerworfen = false) {
    setZuordnung.mutate(
      { id, data: { steuerjahr, vorschlagVerworfen } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            void queryClient.invalidateQueries({ queryKey: getBelegControllerListQueryKey() })
          }
        },
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Appbar offen={offen} />
      <ScanFolgt />
      {belege.length === 0 ? (
        <Empty />
      ) : (
        belege.map((beleg) => <BelegCard key={beleg.id} beleg={beleg} onZuordnen={ordneZu} />)
      )}
    </ScrollView>
  )
}

function Appbar({ offen }: { readonly offen: number }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <View style={s.appbar}>
      <Text style={s.appbarTitle}>{tr('belege.appbarTitle')}</Text>
      <Pill>{tr('belege.offen', { count: offen })}</Pill>
    </View>
  )
}

// ADR-032 §2: der Upload-Platzhalter. Kein Scan-/PDF-Button — der verspräche eine Binary-
// Speicherung, die erst mit dem Scan-Slice (ADR-036/045) kommt. Nur der ehrliche Satz.
function ScanFolgt() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <Card variant="nacht">
      <Text style={s.scanFolgtHeading}>{tr('belege.scanFolgt.heading')}</Text>
      <Text style={s.scanFolgtBody}>{tr('belege.scanFolgt.body')}</Text>
    </Card>
  )
}

function Empty() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  return (
    <View style={s.emptyBlock}>
      <Text style={s.emptyHeading}>{tr('belege.empty.heading')}</Text>
      <Text style={s.emptyBody}>{tr('belege.empty.message')}</Text>
    </View>
  )
}

interface BelegCardProps {
  readonly beleg: BelegResponseDto
  readonly onZuordnen: (id: string, steuerjahr: number, vorschlagVerworfen?: boolean) => void
}

function BelegCard({ beleg, onZuordnen }: BelegCardProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  // `art` is a plain `string | null` on the wire (the response has no enum, only the create DTO
  // does), so an unknown/future value must not crash — it falls back to the raw string. `null`
  // is the generic receipt (not "not yet classified"), rendered honestly as such.
  const artKey = beleg.art === null ? undefined : ART_LABEL_KEYS[beleg.art]
  const artLabel = artKey !== undefined ? tr(artKey) : beleg.art === null ? tr('belege.art.generic') : beleg.art

  return (
    <Card>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} numberOfLines={2}>
          {beleg.dateiname}
        </Text>
        <Chip variante="src">{artLabel}</Chip>
      </View>
      {(beleg.belegdatum !== null || beleg.zahlungsdatum !== null) && (
        <View style={s.dates}>
          {beleg.belegdatum !== null && (
            <Text style={s.dateLine}>
              {tr('belege.datum.belegdatum')}: <Text style={s.mono}>{beleg.belegdatum}</Text>
            </Text>
          )}
          {beleg.zahlungsdatum !== null && (
            <Text style={s.dateLine}>
              {tr('belege.datum.zahlungsdatum')}: <Text style={s.mono}>{beleg.zahlungsdatum}</Text>
            </Text>
          )}
        </View>
      )}
      <ZuordnungSection beleg={beleg} onZuordnen={onZuordnen} />
    </Card>
  )
}

function ZuordnungSection({ beleg, onZuordnen }: BelegCardProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const z = beleg.zuordnung

  if (z.kind === 'ungebunden') {
    return <Text style={s.zuordnungMuted}>{tr('belege.zuordnung.ungebunden')}</Text>
  }
  if (z.kind === 'zugeordnet') {
    return <Text style={s.zuordnungSettled}>{tr('belege.zuordnung.zugeordnet', { jahr: z.steuerjahr })}</Text>
  }
  if (z.kind === 'vorgeschlagen') {
    return (
      <Vorgeschlagen
        vorschlagsJahr={z.steuerjahr ?? 0}
        herkunft={z.herkunft ?? 'zahlungsdatum'}
        onZuordnen={(jahr) => onZuordnen(beleg.id, jahr)}
      />
    )
  }
  // konflikt — ADR-008: beide Jahre sichtbar, Amber statt Rot (Konflikt ist normal, kein Fehler),
  // Auflösung nur über eine explizite Wahl — und in BEIDE Richtungen, keine Sackgasse: entweder
  // den Vorschlag übernehmen (`resolve`) oder beim eigenen Jahr bleiben und den Vorschlag
  // verwerfen (`keep`, vorschlagVerworfen). Beide Pfade führen aus dem Konflikt-Zustand heraus.
  return (
    <View style={s.konfliktBox}>
      <Text style={s.konfliktHeading}>{tr('belege.zuordnung.konflikt.heading')}</Text>
      <Text style={s.konfliktBody}>
        {tr('belege.zuordnung.konflikt.body', { zugeordnet: z.steuerjahr, vorschlag: z.vorschlagsJahr })}
      </Text>
      <View style={s.actionRow}>
        <Button onPress={() => onZuordnen(beleg.id, z.vorschlagsJahr ?? 0)}>
          {tr('belege.zuordnung.konflikt.resolve', { jahr: z.vorschlagsJahr })}
        </Button>
        <Button variante="leise" onPress={() => onZuordnen(beleg.id, z.steuerjahr ?? 0, true)}>
          {tr('belege.zuordnung.konflikt.keep', { jahr: z.steuerjahr })}
        </Button>
      </View>
    </View>
  )
}

interface VorgeschlagenProps {
  readonly vorschlagsJahr: number
  readonly herkunft: 'zahlungsdatum' | 'belegdatum'
  readonly onZuordnen: (jahr: number) => void
}

function Vorgeschlagen({ vorschlagsJahr, herkunft, onZuordnen }: VorgeschlagenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const s = makeStyles(t)
  const [override, setOverride] = useState(false)
  const [jahrText, setJahrText] = useState(String(vorschlagsJahr))
  const jahr = Number.parseInt(jahrText, 10)
  const jahrGueltig = JAHR_RE.test(jahrText) && Number.isInteger(jahr)

  return (
    <View>
      <View style={s.vorschlagRow}>
        <Text style={s.zuordnungMuted}>{tr('belege.zuordnung.vorgeschlagen', { jahr: vorschlagsJahr })}</Text>
        <HerkunftsChip
          quelle={{ regel: herkunft === 'zahlungsdatum' ? tr('belege.zuordnung.regelZahlungsdatum') : tr('belege.zuordnung.regelBelegdatum') }}
        />
      </View>
      {!override ? (
        <View style={s.actionRow}>
          <Button onPress={() => onZuordnen(vorschlagsJahr)}>{tr('belege.zuordnung.confirm', { jahr: vorschlagsJahr })}</Button>
          <Button variante="ghost" onPress={() => setOverride(true)}>
            {tr('belege.zuordnung.otherYear')}
          </Button>
        </View>
      ) : (
        <View>
          <Input
            type="numeric"
            mono
            accessibilityLabel={tr('belege.zuordnung.otherYearLabel')}
            value={jahrText}
            onChange={setJahrText}
          />
          {!jahrGueltig && <Text style={s.konfliktBody}>{tr('belege.zuordnung.yearInvalid')}</Text>}
          <View style={s.actionRow}>
            <Button
              disabled={!jahrGueltig}
              onPress={() => {
                if (jahrGueltig) onZuordnen(jahr)
              }}
            >
              {tr('belege.zuordnung.otherYearConfirm')}
            </Button>
            <Button variante="ghost" onPress={() => setOverride(false)}>
              {tr('belege.zuordnung.otherYearCancel')}
            </Button>
          </View>
        </View>
      )}
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
  const appbar: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: t.space.s4,
  }
  const appbarTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
  }
  const scanFolgtHeading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s2,
  }
  const scanFolgtBody: TextStyle = {
    color: t.color.nachtText,
    opacity: 0.85,
    fontFamily: t.font.text,
    fontSize: t.size.s,
  }
  const emptyBlock: ViewStyle = { alignItems: 'center', paddingVertical: t.space.s6 }
  const emptyHeading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    textAlign: 'center',
    marginBottom: t.space.s2,
  }
  const emptyBody: TextStyle = {
    color: t.color.tinte2,
    fontFamily: t.font.text,
    fontSize: t.size.m,
    textAlign: 'center',
  }
  const cardHead: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.space.s3,
  }
  const cardTitle: TextStyle = {
    flex: 1,
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const dates: ViewStyle = { marginTop: t.space.s3, gap: t.space.s1 }
  const dateLine: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }
  const mono: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.s, fontVariant: ['tabular-nums'] }
  const zuordnungMuted: TextStyle = { color: t.color.tinte2, fontSize: t.size.s, marginTop: t.space.s3 }
  const zuordnungSettled: TextStyle = { color: t.color.tinte, fontWeight: t.weight.fett, fontSize: t.size.s, marginTop: t.space.s3 }
  const vorschlagRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, marginTop: t.space.s3, flexWrap: 'wrap' }
  const actionRow: ViewStyle = { flexDirection: 'row', gap: t.space.s3, marginTop: t.space.s3 }
  const konfliktBox: ViewStyle = {
    marginTop: t.space.s3,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s3,
    backgroundColor: t.color.warnWeich,
    gap: t.space.s2,
  }
  const konfliktHeading: TextStyle = { color: t.color.warn, fontWeight: t.weight.schwer, fontSize: t.size.s }
  const konfliktBody: TextStyle = { color: t.color.tinte2, fontSize: t.size.s }

  return {
    screen, wideScreen, appbar, appbarTitle, scanFolgtHeading, scanFolgtBody,
    emptyBlock, emptyHeading, emptyBody, cardHead, cardTitle, dates, dateLine, mono,
    zuordnungMuted, zuordnungSettled, vorschlagRow, actionRow, konfliktBox, konfliktHeading, konfliktBody,
  }
}
