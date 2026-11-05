import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  GERMAN_STATES,
  SWISS_CANTONS,
  ISO_WEEKDAYS,
  calculateWorkdays,
  formatEuro,
  holidaysOnWorkdays,
  commuterAllowance,
  type HolidayRegion,
  type IsoWochentag,
} from '@steuereule/core'
import { useArbeitswegControllerGet, useArbeitswegControllerPut, type ArbeitswegEingabenDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { LoadingState } from '../shared/ScreenState'
import { ganzzahlAus } from '../shared/ganzzahl'

export interface ArbeitstageScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's commute (ADR-0054, partner without an own account). */
  readonly partnerName?: string
}

export function ArbeitstageScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, partnerName }: ArbeitstageScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const query = useArbeitswegControllerGet(taxYear, partnerName === undefined ? undefined : { person: 'B' })

  if (query.isPending) return <LoadingState bp={bp} label={tr('arbeitstage.loading')} />
  const gespeichert = query.data?.status === 200 ? query.data.data.eingaben : null
  return (
    <ArbeitstageFormular
      gespeichert={gespeichert}
      taxYear={taxYear}
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      {...(partnerName === undefined ? {} : { partnerName })}
    />
  )
}

function ArbeitstageFormular({
  gespeichert,
  taxYear,
  partnerName,
  onDone,
  onBack,
}: {
  readonly gespeichert: ArbeitswegEingabenDto | null
  readonly taxYear: number
  readonly partnerName?: string
  readonly onDone: () => void
  readonly onBack?: () => void
}) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const speichern = useArbeitswegControllerPut()

  const [werktage, setWerktage] = useState<readonly IsoWochentag[]>((gespeichert?.arbeitstage as IsoWochentag[] | undefined) ?? [1, 2, 3, 4, 5])
  const [urlaub, setUrlaub] = useState(textAus(gespeichert?.urlaubstage))
  const [krank, setKrank] = useState(textAus(gespeichert?.krankheitstage))
  const [homeoffice, setHomeoffice] = useState(textAus(gespeichert?.homeofficeTage))
  const [km, setKm] = useState(textAus(gespeichert?.einfacheKm))
  const [verkehrsmittel, setVerkehrsmittel] = useState<Verkehrsmittel | null>(gespeichert?.verkehrsmittel ?? null)
  const [arbeitsort, setArbeitsort] = useState(gespeichert?.taetigkeitsstaette ?? '')
  const [region, setRegion] = useState<HolidayRegion | null>((gespeichert?.feiertageRegion as HolidayRegion | null | undefined) ?? null)
  const [feiertage, setFeiertage] = useState(textAus(gespeichert?.feiertage))

  // F4: suggest the holidays that fall on the chosen working days; the user confirms or corrects them.
  function waehleRegion(neu: HolidayRegion) {
    setRegion(neu)
    setFeiertage(String(holidaysOnWorkdays(taxYear, neu, werktage)))
  }
  const [fehler, setFehler] = useState(false)

  function toggle(tag: IsoWochentag) {
    setWerktage((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag].sort()))
  }

  const eingabe = {
    jahr: taxYear,
    werktage,
    urlaubstage: int(urlaub),
    krankheitstage: int(krank),
    homeofficeTage: int(homeoffice),
    feiertage: int(feiertage),
  }
  const ergebnis = werktage.length > 0 ? calculateWorkdays(eingabe) : null
  const einfacheKm = ganzzahlAus(km)
  const pauschale =
    ergebnis?.kind === 'bestimmt' && einfacheKm !== null && verkehrsmittel !== null
      ? pauschaleOderNull(einfacheKm, ergebnis.pendlertage, taxYear, verkehrsmittel === 'pkw')
      : null

  function weiter() {
    if (ergebnis?.kind === 'widerspruch') return
    setFehler(false)
    speichern.mutate(
      {
        jahr: taxYear,
        data: {
          arbeitstage: [...werktage],
          urlaubstage: eingabe.urlaubstage,
          krankheitstage: eingabe.krankheitstage,
          homeofficeTage: eingabe.homeofficeTage,
          einfacheKm,
          verkehrsmittel,
          taetigkeitsstaette: arbeitsort.trim() === '' ? null : arbeitsort.trim(),
          feiertage: feiertage.trim() === '' ? null : int(feiertage),
          feiertageRegion: region,
        },
        ...(partnerName === undefined ? {} : { params: { person: 'B' as const } }),
      },
      {
        onSuccess: (response) => (response.status === 200 ? onDone() : setFehler(true)),
        onError: () => setFehler(true),
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('arbeitstage.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{partnerName === undefined ? tr('arbeitstage.heading') : tr('arbeitstage.headingPartner', { name: partnerName })}</Text>
      <Text style={styles.help}>{tr('arbeitstage.help')}</Text>

      <Text style={styles.sectionLabel}>{tr('arbeitstage.weekdays')}</Text>
      <View style={styles.weekdayRow}>
        {ISO_WEEKDAYS.map((tag) => (
          <Pressable
            key={tag}
            accessibilityRole="button"
            aria-pressed={werktage.includes(tag)}
            onPress={() => toggle(tag)}
            style={[styles.weekday, werktage.includes(tag) ? styles.weekdayActive : null]}
          >
            <Text style={werktage.includes(tag) ? styles.weekdayActiveText : styles.weekdayText}>
              {tr(`arbeitstage.weekdayNames.${tag}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Feld label={tr('arbeitstage.urlaub')}>
        <Input type="numeric" mono value={urlaub} onChange={setUrlaub} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.urlaub')} />
      </Feld>
      <Feld label={tr('arbeitstage.krank')}>
        <Input type="numeric" mono value={krank} onChange={setKrank} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.krank')} />
      </Feld>
      <Feld label={tr('arbeitstage.homeoffice')}>
        <Input type="numeric" mono value={homeoffice} onChange={setHomeoffice} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.homeoffice')} />
      </Feld>

      <Feld label={tr('arbeitstage.feiertage.region')}>
        <View style={styles.weekdayRow}>
          {[...GERMAN_STATES, ...SWISS_CANTONS].map((code) => (
            <Chip key={code} aktiv={region === code} onPress={() => waehleRegion(code)} testID={`feiertage-region-${code}`}>
              {tr(`arbeitstage.feiertage.regionen.${code}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      <Feld label={tr('arbeitstage.feiertage.anzahl')}>
        <Input
          type="numeric"
          mono
          value={feiertage}
          onChange={setFeiertage}
          placeholder={tr('arbeitstage.daysPlaceholder')}
          accessibilityLabel={tr('arbeitstage.feiertage.anzahl')}
        />
      </Feld>

      {ergebnis !== null ? <Ergebnis ergebnis={ergebnis} /> : null}

      <Text style={styles.sectionLabel}>{tr('arbeitstage.weg.titel')}</Text>
      <Feld label={tr('arbeitstage.weg.km')}>
        <Input type="numeric" mono value={km} onChange={setKm} placeholder="0" accessibilityLabel={tr('arbeitstage.weg.km')} />
      </Feld>
      <Feld label={tr('arbeitstage.weg.verkehrsmittel')}>
        <View style={styles.weekdayRow}>
          {VERKEHRSMITTEL.map((mittel) => (
            <Chip key={mittel} aktiv={verkehrsmittel === mittel} onPress={() => setVerkehrsmittel(mittel)}>
              {tr(`arbeitstage.weg.mittel.${mittel}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      <Feld label={tr('arbeitstage.weg.arbeitsort')}>
        <Input type="text" value={arbeitsort} onChange={setArbeitsort} placeholder={tr('arbeitstage.weg.arbeitsortPlaceholder')} accessibilityLabel={tr('arbeitstage.weg.arbeitsort')} />
      </Feld>
      {pauschale !== null ? <Row label={tr('arbeitstage.weg.pauschale')} value={formatEuro(pauschale)} /> : null}

      {fehler ? <Text style={styles.widerspruchBody}>{tr('arbeitstage.speichernFehler')}</Text> : null}

      <Button onPress={weiter} disabled={speichern.isPending || ergebnis?.kind === 'widerspruch'} style={styles.cta}>
        {tr('arbeitstage.weiter')}
      </Button>
    </ScrollView>
  )
}

const VERKEHRSMITTEL: readonly Verkehrsmittel[] = ['pkw', 'oepnv', 'andere']
type Verkehrsmittel = 'pkw' | 'oepnv' | 'andere'

function textAus(wert: number | null | undefined): string {
  return wert === null || wert === undefined || wert === 0 ? '' : String(wert)
}

function pauschaleOderNull(einfacheKm: number, tage: number, jahr: number, mitPkw: boolean): number | null {
  try {
    return commuterAllowance({ einfacheKm, tage, jahr, mitPkw })
  } catch {
    return null
  }
}

function Ergebnis({ ergebnis }: { readonly ergebnis: ReturnType<typeof calculateWorkdays> }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  if (ergebnis.kind === 'widerspruch') {
    return (
      <View style={styles.widerspruchBlock}>
        <Text style={styles.widerspruchHeading}>{tr('arbeitstage.widerspruch')}</Text>
        <Text style={styles.widerspruchBody}>{tr('arbeitstage.widerspruchBody')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.ergebnisBlock}>
      <Row label={tr('arbeitstage.wochentage')} value={String(ergebnis.wochentage)} />
      <Row label={tr('arbeitstage.werktage')} value={String(ergebnis.werktage)} />
      <Row label={tr('arbeitstage.pendlertage')} value={String(ergebnis.pendlertage)} />
      <Text style={styles.honestyNote}>{tr('arbeitstage.honestyNote')}</Text>
    </View>
  )
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  )
}

function int(s: string): number {
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 ? n : 0
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
  const sectionLabel: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, marginBottom: t.space.s2 }
  const weekdayRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s4 }
  const weekday: ViewStyle = {
    minWidth: 44,
    paddingHorizontal: t.space.s2,
    paddingVertical: t.space.s2,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    alignItems: 'center',
  }
  const weekdayActive: ViewStyle = { backgroundColor: t.color.funke }
  const weekdayText: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s }
  const weekdayActiveText: TextStyle = { color: t.color.funkeTinte, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const ergebnisBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4, backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const resultRow: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.space.s2 }
  const resultLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m }
  const resultValue: TextStyle = { color: t.color.tinte, fontFamily: t.font.mono, fontSize: t.size.m, fontVariant: ['tabular-nums'] }
  const honestyNote: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.xs, marginTop: t.space.s2 }
  const widerspruchBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s }
  const widerspruchHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const widerspruchBody: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen, wideScreen, headerRow, heading, help, sectionLabel, weekdayRow, weekday, weekdayActive, weekdayText, weekdayActiveText,
    ergebnisBlock, resultRow, resultLabel, resultValue, honestyNote, widerspruchBlock, widerspruchHeading, widerspruchBody, cta,
  }
}
