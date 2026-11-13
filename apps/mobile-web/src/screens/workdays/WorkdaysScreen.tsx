import { useRef, useState } from 'react'
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
  commuterAllowanceByWay,
  type GermanState,
  type HolidayRegion,
  type IsoWeekday,
} from '@steuereule/core'
import {
  getCockpitControllerGetCockpitSummaryQueryKey,
  getCommuteControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useCommuteControllerGet,
  useCommuteControllerPut,
  useMasterDataControllerRead,
  type CommuteInputsDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { LoadingState } from '../shared/ScreenState'
import { integerFrom } from '../shared/integer'
import { InMaskAdvisorCompanion } from '../advisor/InMaskAdvisorCompanion'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'
import { stateForAddress } from '../shared/postalCodePrefill'

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
  // #452 slice 4: last year's commute, offered on a click, never filled in silently.
  const priorQuery = useCommuteControllerGet(taxYear - 1, partnerName === undefined ? undefined : { person: 'B' }, { query: { retry: false } })
  // #451 slice 3: the user's own address suggests the holiday region; the partner's may differ.
  const masterData = useMasterDataControllerRead({ query: { enabled: partnerName === undefined, retry: false } })

  if (query.isPending || priorQuery.isPending || (partnerName === undefined && masterData.isPending)) return <LoadingState bp={bp} label={tr('arbeitstage.loading')} />
  const saved = query.data?.status === 200 ? query.data.data.inputs : null
  const prior = priorQuery.data?.status === 200 ? priorQuery.data.data.inputs : null
  const address = masterData.data?.status === 200 ? masterData.data.data : null
  const addressState = address?.plz ? stateForAddress(address.plz, address.wohnort ?? '') : null
  return (
    <WorkdaysForm
      saved={saved}
      prior={saved === null ? prior : null}
      addressState={partnerName === undefined ? addressState : null}
      taxYear={taxYear}
      onDone={onDone}
      {...(onBack ? { onBack } : {})}
      {...(partnerName === undefined ? {} : { partnerName })}
    />
  )
}

function WorkdaysForm({
  saved,
  prior,
  addressState,
  taxYear,
  partnerName,
  onDone,
  onBack,
}: {
  readonly saved: CommuteInputsDto | null
  /** Last year's commute, offered via „Wie {Vorjahr} übernehmen“ while this year has none. */
  readonly prior: CommuteInputsDto | null
  /** Bundesland from the master-data address, used only while no region is saved. */
  readonly addressState: GermanState | null
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
  // A change of job during the year (ADR-0079): the first way ends, a second one starts.
  const [changed, setChanged] = useState(saved?.secondOneWayKm != null || Boolean(saved?.periodTo))
  const [firstUntil, setFirstUntil] = useState(saved?.periodTo ?? '')
  const [secondKm, setSecondKm] = useState(textFrom(saved?.secondOneWayKm))
  const [secondTransport, setSecondTransport] = useState<Transport | null>(saved?.secondTransport ?? null)
  const [secondWorkplace, setSecondWorkplace] = useState(saved?.secondWorkplace ?? '')
  const [secondFrom, setSecondFrom] = useState(saved?.secondFrom ?? '')
  // Further Werbungskosten of this person (ADR-0076): amount and, where the form asks, what it was.
  const [bodies, setBodies] = useState(textFrom(saved?.professionalBodiesEur))
  const [bodiesNote, setBodiesNote] = useState(saved?.professionalBodiesNote ?? '')
  const [tools, setTools] = useState(textFrom(saved?.workEquipmentEur))
  const [toolsNote, setToolsNote] = useState(saved?.workEquipmentNote ?? '')
  const [accountFees, setAccountFees] = useState(textFrom(saved?.accountFeesEur))
  const [other, setOther] = useState(textFrom(saved?.otherWorkExpensesEur))
  const [otherNote, setOtherNote] = useState(saved?.otherWorkExpensesNote ?? '')
  const savedRegion = (saved?.publicHolidayRegion as HolidayRegion | null | undefined) ?? null
  const [region, setRegion] = useState<HolidayRegion | null>(savedRegion ?? addressState)
  const [regionFromAddress, setRegionFromAddress] = useState(savedRegion === null && addressState !== null)
  const [publicHolidays, setPublicHolidays] = useState(() =>
    saved?.publicHolidays == null && savedRegion === null && addressState !== null
      ? String(holidaysOnWorkdays(taxYear, addressState, (saved?.workdays as IsoWeekday[] | undefined) ?? [1, 2, 3, 4, 5]))
      : textFrom(saved?.publicHolidays),
  )

  // F4: suggest the holidays that fall on the chosen working days; the user confirms or corrects them.
  function selectRegion(fresh: HolidayRegion) {
    setRegion(fresh)
    setRegionFromAddress(false)
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
  const secondOneWayKm = changed ? integerFrom(secondKm) : null
  const datesValid = !changed || (validDate(firstUntil) && validDate(secondFrom))
  const ways = [
    ...(oneWayKm !== null && transport !== null ? [{ oneWayKm, withCar: transport === 'pkw', from: null, to: changed ? dateOrNull(firstUntil) : null }] : []),
    ...(secondOneWayKm !== null && secondTransport !== null ? [{ oneWayKm: secondOneWayKm, withCar: secondTransport === 'pkw', from: dateOrNull(secondFrom), to: null }] : []),
  ]
  const allowance = result?.kind === 'bestimmt' && ways.length > 0 && datesValid ? allowanceOrNull(taxYear, workdays, result.commuteDays, ways) : null

  const [takenOver, setTakenOver] = useState(false)

  /** „Wie 2025 übernehmen“ (#452 decision 8): fills the form, marked; it counts once „Weiter“ saves it. */
  function takeOverPriorYear() {
    if (!prior) return
    const days = ((prior.workdays as IsoWeekday[] | undefined) ?? [1, 2, 3, 4, 5]).slice()
    setWorkdays(days)
    setVacation(textFrom(prior.vacationDays))
    setSick(textFrom(prior.sickDays))
    setHomeOffice(textFrom(prior.homeOfficeDays))
    setKm(textFrom(prior.oneWayKm))
    setTransport(prior.transport ?? null)
    setWorkplace(prior.workplace ?? '')
    const priorRegion = (prior.publicHolidayRegion as HolidayRegion | null | undefined) ?? null
    if (priorRegion !== null) {
      setRegion(priorRegion)
      setRegionFromAddress(false)
      // The holidays fall on other days this year: recount them for the new year.
      setPublicHolidays(String(holidaysOnWorkdays(taxYear, priorRegion, days)))
    }
    setTakenOver(true)
  }

  const formData = () => ({
    workdays: [...workdays],
    vacationDays: input.vacationDays,
    sickDays: input.sickDays,
    homeOfficeDays: input.homeOfficeDays,
    oneWayKm,
    transport,
    workplace: workplace.trim() === '' ? null : workplace.trim(),
    publicHolidays: publicHolidays.trim() === '' ? null : int(publicHolidays),
    publicHolidayRegion: region,
    professionalBodiesEur: euros(bodies),
    professionalBodiesNote: note(bodiesNote),
    workEquipmentEur: euros(tools),
    workEquipmentNote: note(toolsNote),
    accountFeesEur: euros(accountFees),
    otherWorkExpensesEur: euros(other),
    otherWorkExpensesNote: note(otherNote),
    periodTo: changed ? dateOrNull(firstUntil) : null,
    secondOneWayKm,
    secondTransport: changed ? secondTransport : null,
    secondWorkplace: changed ? note(secondWorkplace) : null,
    secondFrom: changed ? dateOrNull(secondFrom) : null,
  })
  // What was last loaded or saved — leaving a field saves only real changes (#443 AC 7).
  const lastSaved = useRef<string | null>(null)
  if (lastSaved.current === null) lastSaved.current = JSON.stringify(formData())

  function persist(onSaved?: () => void, onFailed?: () => void) {
    if (result?.kind === 'widerspruch' || !datesValid) return
    setError(false)
    const data = formData()
    save.mutate(
      {
        jahr: taxYear,
        data,
        ...(partnerName === undefined ? {} : { params: { person: 'B' as const } }),
      },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            lastSaved.current = JSON.stringify(data)
            const params = partnerName === undefined ? undefined : ({ person: 'B' } as const)
            void queryClient.invalidateQueries({ queryKey: getCommuteControllerGetQueryKey(taxYear, params) })
            void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
            void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
            onSaved?.()
          } else {
            triggerSaveErrorHaptic()
            setError(true)
            onFailed?.()
          }
        },
        onError: () => {
          triggerSaveErrorHaptic()
          setError(true)
          onFailed?.()
        },
      },
    )
  }

  // „Weiter“ waits only for its own save: a save started by leaving a field (the mouse-down on
  // „Weiter“ blurs the input first) must not swallow the click.
  const [moving, setMoving] = useState(false)
  function next() {
    if (result?.kind === 'widerspruch' || !datesValid) return
    setMoving(true)
    persist(onDone, () => setMoving(false))
  }

  /** Leaving a field (also when the sheet is closed) saves a changed, consistent form. */
  function saveOnLeave() {
    if (lastSaved.current === null || JSON.stringify(formData()) === lastSaved.current) return
    persist()
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('arbeitstage.back')} onPress={() => onBack()} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{partnerName === undefined ? tr('arbeitstage.heading') : tr('arbeitstage.headingPartner', { name: partnerName })}</Text>
      <Text style={styles.help}>{tr('arbeitstage.help')}</Text>
      {prior && !takenOver ? (
        <Button variant="leise" onPress={takeOverPriorYear} style={styles.priorButton} testID="wie-vorjahr-arbeitsweg">
          {tr('vorjahr.uebernehmen', { year: taxYear - 1 })}
        </Button>
      ) : null}
      {takenOver ? (
        <Text style={styles.regionHint} accessibilityLiveRegion="polite" testID="wie-vorjahr-markiert">
          {tr('vorjahr.markiert', { year: taxYear - 1 })}
        </Text>
      ) : null}

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
        <Input type="numeric" mono value={vacation} onChange={setVacation} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.urlaub')} testID="arbeitstage-urlaub" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.krank')}>
        <Input type="numeric" mono value={sick} onChange={setSick} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.krank')} testID="arbeitstage-krank" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.homeoffice')}>
        <Input type="numeric" mono value={homeOffice} onChange={setHomeOffice} placeholder={tr('arbeitstage.daysPlaceholder')} accessibilityLabel={tr('arbeitstage.homeoffice')} testID="arbeitstage-homeoffice" onBlur={saveOnLeave} />
      </Feld>

      <Feld label={tr('arbeitstage.feiertage.region')}>
        <View style={styles.weekdayRow}>
          {[...GERMAN_STATES, ...SWISS_CANTONS].map((code) => (
            <Chip key={code} active={region === code} onPress={() => selectRegion(code)} testID={`feiertage-region-${code}`}>
              {tr(`arbeitstage.feiertage.regionen.${code}`)}
            </Chip>
          ))}
        </View>
        {regionFromAddress && region !== null ? (
          <Text style={styles.regionHint} testID="feiertage-region-aus-plz">
            {tr(`arbeitstage.feiertage.regionen.${region}`)} · {tr('plz.fromPostalCode')}
          </Text>
        ) : null}
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
        <Input type="numeric" mono value={km} onChange={setKm} placeholder="0" accessibilityLabel={tr('arbeitstage.weg.km')} testID="arbeitstage-km" onBlur={saveOnLeave} />
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
        <Input type="text" value={workplace} onChange={setWorkplace} placeholder={tr('arbeitstage.weg.arbeitsortPlaceholder')} accessibilityLabel={tr('arbeitstage.weg.arbeitsort')} testID="arbeitstage-arbeitsort" onBlur={saveOnLeave} />
      </Feld>

      <Feld label={tr('arbeitstage.weg.wechsel.frage')}>
        <View style={styles.weekdayRow}>
          <Chip active={changed} onPress={() => setChanged(!changed)} testID="arbeitsweg-wechsel">
            {tr('arbeitstage.weg.wechsel.ja')}
          </Chip>
        </View>
      </Feld>
      {changed ? (
        <>
          <Text style={styles.regionHint}>{tr('arbeitstage.weg.wechsel.hilfe')}</Text>
          <Feld label={tr('arbeitstage.weg.wechsel.bis')}>
            <Input type="text" mono value={firstUntil} onChange={setFirstUntil} placeholder={tr('arbeitstage.weg.wechsel.datumPlaceholder')} accessibilityLabel={tr('arbeitstage.weg.wechsel.bis')} testID="arbeitsweg-bis" onBlur={saveOnLeave} />
          </Feld>
          <Text style={styles.sectionLabel}>{tr('arbeitstage.weg.wechsel.titel')}</Text>
          <Feld label={tr('arbeitstage.weg.wechsel.ab')}>
            <Input type="text" mono value={secondFrom} onChange={setSecondFrom} placeholder={tr('arbeitstage.weg.wechsel.datumPlaceholder')} accessibilityLabel={tr('arbeitstage.weg.wechsel.ab')} testID="arbeitsweg-zweiter-ab" onBlur={saveOnLeave} />
          </Feld>
          {!datesValid ? <Text style={styles.widerspruchBody}>{tr('arbeitstage.weg.wechsel.datumFehler')}</Text> : null}
          <Feld label={tr('arbeitstage.weg.km')}>
            <Input type="numeric" mono value={secondKm} onChange={setSecondKm} placeholder="0" accessibilityLabel={`${tr('arbeitstage.weg.wechsel.titel')}: ${tr('arbeitstage.weg.km')}`} testID="arbeitsweg-zweiter-km" onBlur={saveOnLeave} />
          </Feld>
          <Feld label={tr('arbeitstage.weg.verkehrsmittel')}>
            <View style={styles.weekdayRow}>
              {TRANSPORT.map((means) => (
                <Chip key={means} active={secondTransport === means} onPress={() => setSecondTransport(means)} testID={`arbeitsweg-zweiter-transport-${means}`}>
                  {tr(`arbeitstage.weg.mittel.${means}`)}
                </Chip>
              ))}
            </View>
          </Feld>
          <Feld label={tr('arbeitstage.weg.arbeitsort')}>
            <Input type="text" value={secondWorkplace} onChange={setSecondWorkplace} placeholder={tr('arbeitstage.weg.arbeitsortPlaceholder')} accessibilityLabel={`${tr('arbeitstage.weg.wechsel.titel')}: ${tr('arbeitstage.weg.arbeitsort')}`} testID="arbeitsweg-zweiter-ort" onBlur={saveOnLeave} />
          </Feld>
        </>
      ) : null}
      {allowance !== null ? <Row label={tr('arbeitstage.weg.pauschale')} value={formatEuro(allowance)} /> : null}

      <Text style={styles.sectionLabel}>{tr('arbeitstage.weitere.titel')}</Text>
      <Text style={styles.regionHint}>{tr('arbeitstage.weitere.hilfe')}</Text>
      <Feld label={tr('arbeitstage.weitere.arbeitsmittel')}>
        <Input type="numeric" mono value={tools} onChange={setTools} placeholder="0" accessibilityLabel={tr('arbeitstage.weitere.arbeitsmittel')} testID="werbungskosten-arbeitsmittel" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.weitere.arbeitsmittelArt')}>
        <Input type="text" value={toolsNote} onChange={setToolsNote} placeholder={tr('arbeitstage.weitere.arbeitsmittelArtPlaceholder')} accessibilityLabel={tr('arbeitstage.weitere.arbeitsmittelArt')} testID="werbungskosten-arbeitsmittel-art" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.weitere.kontofuehrung')}>
        <Input type="numeric" mono value={accountFees} onChange={setAccountFees} placeholder="16" accessibilityLabel={tr('arbeitstage.weitere.kontofuehrung')} testID="werbungskosten-kontofuehrung" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.weitere.verbaende')}>
        <Input type="numeric" mono value={bodies} onChange={setBodies} placeholder="0" accessibilityLabel={tr('arbeitstage.weitere.verbaende')} testID="werbungskosten-verbaende" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.weitere.verbaendeArt')}>
        <Input type="text" value={bodiesNote} onChange={setBodiesNote} placeholder={tr('arbeitstage.weitere.verbaendeArtPlaceholder')} accessibilityLabel={tr('arbeitstage.weitere.verbaendeArt')} testID="werbungskosten-verbaende-art" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.weitere.sonstiges')}>
        <Input type="numeric" mono value={other} onChange={setOther} placeholder="0" accessibilityLabel={tr('arbeitstage.weitere.sonstiges')} testID="werbungskosten-sonstiges" onBlur={saveOnLeave} />
      </Feld>
      <Feld label={tr('arbeitstage.weitere.sonstigesArt')}>
        <Input type="text" value={otherNote} onChange={setOtherNote} placeholder={tr('arbeitstage.weitere.sonstigesArtPlaceholder')} accessibilityLabel={tr('arbeitstage.weitere.sonstigesArt')} testID="werbungskosten-sonstiges-art" onBlur={saveOnLeave} />
      </Feld>

      {error ? <Text style={styles.widerspruchBody}>{tr('arbeitstage.speichernFehler')}</Text> : null}

      <InMaskAdvisorCompanion screen="interview" taxYear={taxYear} />

      <Button onPress={next} disabled={moving || result?.kind === 'widerspruch'} style={styles.cta} testID="arbeitstage-weiter">
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

function allowanceOrNull(year: number, workdays: readonly IsoWeekday[], days: number, ways: Parameters<typeof commuterAllowanceByWay>[3]): number | null {
  try {
    return commuterAllowanceByWay(year, workdays, days, ways).reduce((sum, w) => sum + w.allowance, 0)
  } catch {
    return null
  }
}

const GERMAN_DATE = /^\d{2}\.\d{2}\.\d{4}$/

/** Empty, or a date as TT.MM.JJJJ. */
function validDate(s: string): boolean {
  return s.trim() === '' || GERMAN_DATE.test(s.trim())
}

function dateOrNull(s: string): string | null {
  return GERMAN_DATE.test(s.trim()) ? s.trim() : null
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

/** Whole euros or null for an empty field. */
function euros(s: string): number | null {
  const digits = s.replace(/[^\d]/g, '')
  return digits === '' ? null : Number(digits)
}

function note(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t.slice(0, 100)
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
  const priorButton: ViewStyle = { marginBottom: t.space.s4 }
  const regionHint: TextStyle = { color: t.color.ki, fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.xs, marginTop: -t.space.s2 }
  return {
    priorButton,
    regionHint,
    screen, wideScreen, headerRow, heading, help, sectionLabel, weekdayRow, weekday, weekdayActive, weekdayText, weekdayActiveText,
    ergebnisBlock: resultBlock, resultRow, resultLabel, resultValue, honestyNote, widerspruchBlock: conflictBlock, widerspruchHeading: conflictHeading, widerspruchBody: conflictBody, cta,
  }
}
