// Arbeitstage-Assistent-Screen (M4, ticket 08 / ticket 15) — calendar logic from the core,
// never free text. The user selects their work-week pattern and enters vacation/sick/home-office
// days; @steuereule/core's `berechneWerktage` derives the weekday/commute-day count from the
// actual calendar (how many of each chosen weekday fall in the tax year), instead of trusting a
// hand-typed "220 Tage" figure the old prototype collected (ADR-0031 §2's `tage`, #337).
//
// HONESTY BOUNDARY (ADR-0032): gesetzliche Feiertage are NOT subtracted — `werktage.ts` says so
// plainly. The figures are named `werktage`/`pendlertage` ("vor Feiertagen"), an upper bound, and
// this screen says so on-screen rather than promising `arbeitstage`. There is NO persistence this
// slice (no werktage endpoint/model exists) — so there is no save button, only the honest result.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { WOCHENTAGE, berechneWerktage, type IsoWochentag } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface ArbeitstageScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
}

export function ArbeitstageScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR }: ArbeitstageScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  // Work-week pattern: Mo–Fr by default (the ordinary employee case).
  const [werktage, setWerktage] = useState<readonly IsoWochentag[]>([1, 2, 3, 4, 5])
  const [urlaub, setUrlaub] = useState('')
  const [krank, setKrank] = useState('')
  const [homeoffice, setHomeoffice] = useState('')

  function toggle(tag: IsoWochentag) {
    setWerktage((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag].sort()))
  }

  const eingabe = {
    jahr: taxYear,
    werktage,
    urlaubstage: int(urlaub),
    krankheitstage: int(krank),
    homeofficeTage: int(homeoffice),
  }
  const ergebnis = werktage.length > 0 ? berechneWerktage(eingabe) : null

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('arbeitstage.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{tr('arbeitstage.heading')}</Text>
      <Text style={styles.help}>{tr('arbeitstage.help')}</Text>

      <Text style={styles.sectionLabel}>{tr('arbeitstage.weekdays')}</Text>
      <View style={styles.weekdayRow}>
        {WOCHENTAGE.map((tag) => (
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

      {ergebnis !== null ? <Ergebnis ergebnis={ergebnis} /> : null}

      <Button onPress={onDone} style={styles.cta}>
        {tr('arbeitstage.weiter')}
      </Button>
    </ScrollView>
  )
}

function Ergebnis({ ergebnis }: { readonly ergebnis: ReturnType<typeof berechneWerktage> }) {
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
      {/* The honesty boundary ADR-0032 makes visible: these are weekdays, not work days after
          public holidays — the Feiertagskalender is a later slice. */}
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
