import { useState } from 'react'
import { ScrollView, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Chip, Feld, Input, inkOnFunke, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  GERMAN_STATES,
  SWISS_CANTONS,
  ISO_WEEKDAYS,
  calculateWorkdays,
  formatEuro,
  holidaysOnWorkdays,
  commuterAllowance,
  type HolidayRegion,
  type IsoWeekday,
} from '@steuereule/core'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getCommuteControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useCommuteControllerGet,
  useCommuteControllerPut,
  type CommuteInputsDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { LoadingState } from '../shared/ScreenState'
import { integerFrom } from '../shared/integer'
import { InMaskAdvisorCompanion } from '../advisor/InMaskAdvisorCompanion'

export interface WorkdaysScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  /** Set when Person A records the partner's commute (ADR-0054, partner without an own account). */
  readonly partnerName?: string
}

export function WorkdaysScreen({ onDone = () => {}, onBack, taxYear = CURRENT_TAX_YEAR, partnerName }: WorkdaysScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const query = useCommuteControllerGet(taxYear, partnerName === undefined ? undefined : { person: 'B' })

  if (query.isPending) return <LoadingState bp={bp} label={tr('arbeitstage.loading')} />
  const saved = query.data?.status === 200 ? query.data.data.inputs : null
  return (
    <WorkdaysForm
      saved={saved}
      taxYear={taxYear}
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      {...(partnerName === undefined ? {} : { partnerName })}
    />
  )
}

function WorkdaysForm({
  saved,
  taxYear,
  partnerName,
  onDone,
  onBack,
}: {
  readonly saved: CommuteInputsDto | null
  readonly taxYear: number
  readonly partnerName?: string
  readonly onDone: () => void
  readonly onBack?: () => void
}) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const save = useCommuteControllerPut()

  const [workdays, setWorkdays] = useState<readonly IsoWeekday[]>((saved?.workdays as IsoWeekday[] | undefined) ?? [1, 2, 3, 4, 5])
  const [vacation, setVacation] = useState(textFrom(saved?.vacationDays))
  const [sick, setSick] = useState(textFrom(saved?.sickDays))
  const [homeOffice, setHomeOffice] = useState(textFrom(saved?.homeOfficeDays))
  const [km, setKm] = useState(textFrom(saved?.oneWayKm))
  const [transport, setTransport] = useState<Transport | null>(saved?.transport ?? null)
  const [workplace, setWorkplace] = useState(saved?.workplace ?? '')
  const [region, setRegion] = useState<HolidayRegion | null>((saved?.publicHolidayRegion as HolidayRegion | null | undefined) ?? null)
  const [publicHolidays, setPublicHolidays] = useState(textFrom(saved?.publicHolidays))

  // F4: suggest the holidays that fall on the chosen working days; the user confirms or corrects them.
  function selectRegion(fresh: HolidayRegion) {
    setRegion(fresh)
    setPublicHolidays(String(holidaysOnWorkdays(taxYear, fresh, workdays)))
  }
  const [error, setError] = useState(false)

  function toggle(tag: IsoWeekday) {
    setWorkdays((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag].sort()))
  }

  const input = {
    year: taxYear,
    workdays,
    vacationDays: int(vacation),
    sickDays: int(sick),
    homeOfficeDays: int(homeOffice),
    publicHolidays: int(publicHolidays),
  }
  const result = workdays.length > 0 ? calculateWorkdays(input) : null
  const oneWayKm = integerFrom(km)
  const allowance =
    result?.kind === 'bestimmt' && oneWayKm !== null && transport !== null
      ? allowanceOrNull(oneWayKm, result.commuteDays, taxYear, transport === 'pkw')
      : null

  function next() {
    if (result?.kind === 'widerspruch') return
    setError(false)
    save.mutate(
      {
        jahr: taxYear,
        data: {
          workdays: [...workdays],
          vacationDays: input.vacationDays,
          sickDays: input.sickDays,
          homeOfficeDays: input.homeOfficeDays,
          oneWayKm,
          transport,
          workplace: workplace.trim() === '' ? null : workplace.trim(),
          publicHolidays: publicHolidays.trim() === '' ? null : int(publicHolidays),
          publicHolidayRegion: region,
        },
        ...(partnerName === undefined ? {} : { params: { person: 'B' as const } }),
      },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
            void queryClient.invalidateQueries({ queryKey: getCommuteControllerGetQueryKey(taxYear, params) })
            void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
            void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
            onDone()
          } else {
            setError(true)
          }
        },
        onError: () => setError(true),
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('arbeitstage.back')} onPress={() => onBack()} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{partnerName === undefined ? tr('arbeitstage.heading') : tr('arbeitstage.headingPartner', { name: partnerName })}</Text>
      <Text style={styles.help}>{tr('arbeitstage.help')}</Text>

      <Text style={styles.sectionLabel}>{tr('arbeitstage.weekdays')}</Text>
      <View style={styles.weekdayRow}>
        {ISO_WEEKDAYS.map((tag) => (
          <Pressable
            key={tag}
            accessibilityRole="button"
            aria-pressed={workdays.includes(tag)}
            onPress={() => toggle(tag)}
            style={[styles.weekday, workdays.includes(tag) ? styles.weekdayActive : null]}
          >
            <Text style={workdays.includes(tag) ? styles.weekdayActiveText : styles.weekdayText}>
              {tr(`arbeitstage.weekdayNames.${tag}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Feld label={tr('arbeitstage.urlaub')}>
        <Input type="numeric" mono value={vacation} onChange={setVacation} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.urlaub')} testID="arbeitstage-urlaub" />
      </Feld>
      <Feld label={tr('arbeitstage.krank')}>
        <Input type="numeric" mono value={sick} onChange={setSick} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.krank')} testID="arbeitstage-krank" />
      </Feld>
      <Feld label={tr('arbeitstage.homeoffice')}>
        <Input type="numeric" mono value={homeOffice} onChange={setHomeOffice} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.homeoffice')} testID="arbeitstage-homeoffice" />
      </Feld>

      <Feld label={tr('arbeitstage.feiertage.region')}>
        <View style={styles.weekdayRow}>
          {[...GERMAN_STATES, ...SWISS_CANTONS].map((code) => (
            <Chip key={code} active={region === code} onPress={() => selectRegion(code)} testID={`feiertage-region-${code}`}>
              {tr(`arbeitstage.feiertage.regionen.${code}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      <Feld label={tr('arbeitstage.feiertage.anzahl')}>
        <Input
          type="numeric"
          mono
          value={publicHolidays}
          onChange={setPublicHolidays}
          placeholder={tr('arbeitstage.daysPlaceholder')}
          accessibilityLabel={tr('arbeitstage.feiertage.anzahl')}
          testID="arbeitstage-feiertage-anzahl"
        />
      </Feld>

      {result !== null ? <Result result={result} /> : null}

      <Text style={styles.sectionLabel}>{tr('arbeitstage.weg.titel')}</Text>
      <Feld label={tr('arbeitstage.weg.km')}>
        <Input type="numeric" mono value={km} onChange={setKm} placeholder="0" accessibilityLabel={tr('arbeitstage.weg.km')} testID="arbeitstage-km" />
      </Feld>
      <Feld label={tr('arbeitstage.weg.verkehrsmittel')}>
        <View style={styles.weekdayRow}>
          {TRANSPORT.map((means) => (
            <Chip key={means} active={transport === means} onPress={() => setTransport(means)} testID={`arbeitstage-transport-${means}`}>
              {tr(`arbeitstage.weg.mittel.${means}`)}
            </Chip>
          ))}
        </View>
      </Feld>
      <Feld label={tr('arbeitstage.weg.arbeitsort')}>
        <Input type="text" value={workplace} onChange={setWorkplace} placeholder={tr('arbeitstage.weg.arbeitsortPlaceholder')} accessibilityLabel={tr('arbeitstage.weg.arbeitsort')} testID="arbeitstage-arbeitsort" />
      </Feld>
      {allowance !== null ? <Row label={tr('arbeitstage.weg.pauschale')} value={formatEuro(allowance)} /> : null}

      {error ? <Text style={styles.widerspruchBody}>{tr('arbeitstage.speichernFehler')}</Text> : null}

      <InMaskAdvisorCompanion screen="interview" taxYear={taxYear} />

      <Button onPress={next} disabled={save.isPending || result?.kind === 'widerspruch'} style={styles.cta} testID="arbeitstage-weiter">
        {tr('arbeitstage.weiter')}
      </Button>
    </ScrollView>
  )
}

const TRANSPORT: readonly Transport[] = ['pkw', 'oepnv', 'andere']
type Transport = 'pkw' | 'oepnv' | 'andere'

function textFrom(value: number | null | undefined): string {
  return value === null || value === undefined || value === 0 ? '' : String(value)
}

function allowanceOrNull(oneWayKm: number, days: number, year: number, withCar: boolean): number | null {
  try {
    return commuterAllowance({ oneWayKm, days, year, withCar })
  } catch {
    return null
  }
}

function Result({ result }: { readonly result: ReturnType<typeof calculateWorkdays> }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  if (result.kind === 'widerspruch') {
    return (
      <View style={styles.widerspruchBlock}>
        <Text style={styles.widerspruchHeading}>{tr('arbeitstage.widerspruch')}</Text>
        <Text style={styles.widerspruchBody}>{tr('arbeitstage.widerspruchBody')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.ergebnisBlock}>
      <Row label={tr('arbeitstage.wochentage')} value={String(result.weekdays)} />
      <Row label={tr('arbeitstage.werktage')} value={String(result.workdays)} />
      <Row label={tr('arbeitstage.pendlertage')} value={String(result.commuteDays)} />
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
  const weekdayActiveText: TextStyle = { color: inkOnFunke(t), fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s }
  const resultBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4, backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.tinte, borderRadius: t.radius.s }
  const resultRow: ViewStyle = { flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.space.s2 }
  const resultLabel: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m }
  const resultValue: TextStyle = { color: t.color.tinte, fontFamily: t.font.mono, fontSize: t.size.m, fontVariant: ['tabular-nums'] }
  const honestyNote: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.xs, marginTop: t.space.s2 }
  const conflictBlock: ViewStyle = { marginTop: t.space.s4, padding: t.space.s4, borderWidth: t.space.kontur, borderColor: t.color.warn, borderRadius: t.radius.s }
  const conflictHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const conflictBody: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s }
  const cta: ViewStyle = { marginTop: t.space.s4 }
  return {
    screen, wideScreen, headerRow, heading, help, sectionLabel, weekdayRow, weekday, weekdayActive, weekdayText, weekdayActiveText,
    ergebnisBlock: resultBlock, resultRow, resultLabel, resultValue, honestyNote, widerspruchBlock: conflictBlock, widerspruchHeading: conflictHeading, widerspruchBody: conflictBody, cta,
  }
}
