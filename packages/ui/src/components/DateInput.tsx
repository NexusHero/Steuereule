import { createElement, useRef, useState, type CSSProperties } from 'react'
import { Platform, Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import type { InputAutoComplete } from '../lib/autoComplete'
import { inkOnFunke, useTheme } from '../theme/useTheme'
import { Input } from './Input'

export interface DateInputProps {
  /** The date as the user reads it: `TT.MM.JJJJ`, possibly still incomplete. */
  readonly value: string
  readonly onChange: (value: string) => void
  /** Spoken name of the calendar button, e.g. "Kalender öffnen". */
  readonly calendarLabel: string
  readonly accessibilityLabel?: string
  readonly testID?: string
  /** Earliest and latest day the calendar offers, `YYYY-MM-DD`. Typing is not restricted. */
  readonly min?: string
  readonly max?: string
  /** `bday` for the user's own birth date; other dates must not be filled from the browser's memory. */
  readonly autoComplete?: InputAutoComplete
  readonly onBlur?: () => void
  readonly onSubmit?: () => void
}

const PLACEHOLDER = 'TT.MM.JJJJ'
const MAX_LENGTH = PLACEHOLDER.length
const BUTTON_SIZE = 52

/**
 * Sets the dots of a German date while it is typed: "12052018" becomes "12.05.2018". A date the
 * user writes with their own dots ("2.9.2019") is left alone, and nothing is added while deleting —
 * otherwise the dot would come straight back and the field could not be emptied.
 */
export function maskGermanDate(next: string, previous: string): string {
  const cleaned = next.replace(/[^\d.]/g, '.').replace(/\.{2,}/g, '.').slice(0, MAX_LENGTH)
  if (next.length < previous.length) return cleaned
  if (cleaned.includes('.')) {
    // Own dots: only complete the part being typed ("12.05" → "12.05.").
    const parts = cleaned.split('.')
    const last = parts[parts.length - 1]!
    return parts.length < 3 && last.length === 2 && parts.every((part) => part.length === 2) ? `${cleaned}.` : cleaned
  }
  const digits = cleaned.slice(0, 8)
  if (digits.length < 2) return digits
  if (digits.length < 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

/** A complete, real German date as `YYYY-MM-DD`; null for anything else. */
export function germanDateToIso(value: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
}

export function isoDateToGerman(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** Kept in the layout so the browser anchors its calendar at the button, but never seen or tabbed to. */
const CALENDAR_INPUT_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
  border: 0,
  padding: 0,
}

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function initialCalendarMonth(isoValue: string | null, max?: string): { readonly year: number; readonly month: number } {
  const source = isoValue ?? max ?? new Date().toISOString().slice(0, 10)
  const match = /^(\d{4})-(\d{2})/.exec(source)
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1 }
  }
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
}

function buildMonthDays(year: number, month: number): ReadonlyArray<number | null> {
  const firstDayUtc = new Date(Date.UTC(year, month, 1)).getUTCDay()
  // Monday = 0 ... Sunday = 6
  const leadingEmpty = (firstDayUtc + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: Array<number | null> = []
  for (let i = 0; i < leadingEmpty; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d)
  return cells
}

function formatIsoDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * A date field that can be typed (the dots set themselves) or picked: on the web a button opens the
 * SteuerEule calendar dialog in the Funke design system. Native platforms get the typed field only.
 */
export function DateInput({ value, onChange, calendarLabel, accessibilityLabel, testID, min, max, autoComplete, onBlur, onSubmit }: DateInputProps) {
  const t = useTheme()
  const calendar = useRef<HTMLInputElement | null>(null)
  const currentIso = germanDateToIso(value)
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<{ readonly year: number; readonly month: number }>(() =>
    initialCalendarMonth(currentIso, max),
  )

  const wrapper: ViewStyle = { gap: t.space.s2 }
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const button: ViewStyle = {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: open ? t.color.funke : t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const iconTone = open ? inkOnFunke(t) : t.color.tinte
  const sheet: ViewStyle = { width: 22, height: 20, borderWidth: 2, borderColor: iconTone, borderRadius: 3 }
  const sheetHead: ViewStyle = { height: 5, backgroundColor: iconTone }
  const dialog: ViewStyle = {
    padding: t.space.s3,
    borderRadius: t.radius.m,
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    ...t.shadow.hart,
    gap: t.space.s2,
  }
  const dialogHeader: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space.s1,
  }
  const navGroup: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 4 }
  const navBtn: ViewStyle = {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: t.radius.s,
    borderWidth: 1.5,
    borderColor: t.color.tinte,
    backgroundColor: t.color.grund,
    alignItems: 'center',
    justifyContent: 'center',
  }
  const navBtnText: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.s,
    color: t.color.tinte,
  }
  const monthTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  const weekRow: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
  }
  const weekCell: ViewStyle = {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 2,
  }
  const weekLabel: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.xs,
    color: t.color.tinte2,
  }
  const daysGrid: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
  }
  const dayCellWrap: ViewStyle = {
    width: '14.28%',
    padding: 2,
    alignItems: 'center',
  }
  const dayButtonBase: ViewStyle = {
    width: 34,
    height: 34,
    borderRadius: t.radius.s,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  }
  const dayButtonSelected: ViewStyle = {
    ...dayButtonBase,
    backgroundColor: t.color.funke,
    borderColor: t.color.tinte,
  }
  const dayTextBase: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
    color: t.color.tinte,
  }
  const dayTextSelected: TextStyle = {
    ...dayTextBase,
    color: inkOnFunke(t),
    fontWeight: t.weight.schwer,
  }

  function openCalendar() {
    setOpen((prev) => {
      const next = !prev
      if (next) {
        setViewMonth(initialCalendarMonth(germanDateToIso(value), max))
      }
      return next
    })
  }

  function shiftMonth(deltaMonths: number) {
    setViewMonth((prev) => {
      const nextDate = new Date(Date.UTC(prev.year, prev.month + deltaMonths, 1))
      return { year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() }
    })
  }

  const cells = open ? buildMonthDays(viewMonth.year, viewMonth.month) : []

  return (
    <View style={wrapper}>
      <View style={row}>
        <View style={{ flex: 1 }}>
          <Input
            type="numeric"
            value={value}
            onChange={(next) => onChange(maskGermanDate(next, value))}
            placeholder={PLACEHOLDER}
            {...(accessibilityLabel ? { accessibilityLabel } : {})}
            {...(testID ? { testID } : {})}
            {...(autoComplete ? { autoComplete } : {})}
            {...(onBlur ? { onBlur } : {})}
            {...(onSubmit ? { onSubmit } : {})}
          />
        </View>
        {Platform.OS === 'web' ? (
          // The date input sits next to the button, never inside it: a control nested in a button
          // is invalid for assistive technology (WCAG 4.1.2, axe "nested-interactive").
          <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={calendarLabel}
              aria-expanded={open}
              onPress={openCalendar}
              style={button}
              {...(testID ? { testID: `${testID}-kalender-oeffnen` } : {})}
            >
              <View style={sheet}>
                <View style={sheetHead} />
              </View>
            </Pressable>
            {createElement('input', {
              ref: calendar,
              type: 'date',
              value: currentIso ?? '',
              min,
              max,
              tabIndex: -1,
              'aria-hidden': true,
              'data-testid': testID ? `${testID}-kalender` : undefined,
              style: CALENDAR_INPUT_STYLE,
              onChange: (event: { target: { value: string } }) => {
                const picked = isoDateToGerman(event.target.value)
                if (picked !== '') onChange(picked)
              },
            })}
          </View>
        ) : null}
      </View>
      {Platform.OS === 'web' && open ? (
        <View
          style={dialog}
          accessibilityRole="none"
          testID={testID ? `${testID}-kalender-dialog` : 'date-kalender-dialog'}
        >
          <View style={dialogHeader}>
            <View style={navGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vorheriges Jahr"
                onPress={() => shiftMonth(-12)}
                style={navBtn}
                testID={testID ? `${testID}-kalender-prev-year` : undefined}
              >
                <Text style={navBtnText}>«</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vorheriger Monat"
                onPress={() => shiftMonth(-1)}
                style={navBtn}
                testID={testID ? `${testID}-kalender-prev-month` : undefined}
              >
                <Text style={navBtnText}>‹</Text>
              </Pressable>
            </View>
            <Text style={monthTitle} testID={testID ? `${testID}-kalender-titel` : undefined}>
              {`${MONTH_NAMES[viewMonth.month]} ${viewMonth.year}`}
            </Text>
            <View style={navGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nächster Monat"
                onPress={() => shiftMonth(1)}
                style={navBtn}
                testID={testID ? `${testID}-kalender-next-month` : undefined}
              >
                <Text style={navBtnText}>›</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nächstes Jahr"
                onPress={() => shiftMonth(12)}
                style={navBtn}
                testID={testID ? `${testID}-kalender-next-year` : undefined}
              >
                <Text style={navBtnText}>»</Text>
              </Pressable>
            </View>
          </View>
          <View style={weekRow}>
            {WEEKDAYS.map((wd) => (
              <View key={wd} style={weekCell}>
                <Text style={weekLabel}>{wd}</Text>
              </View>
            ))}
          </View>
          <View style={daysGrid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={dayCellWrap} />
              }
              const iso = formatIsoDay(viewMonth.year, viewMonth.month, day)
              const disabled = (min !== undefined && iso < min) || (max !== undefined && iso > max)
              const selected = currentIso === iso
              const german = isoDateToGerman(iso)
              return (
                <View key={iso} style={dayCellWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={german}
                    disabled={disabled}
                    onPress={() => {
                      onChange(german)
                      setOpen(false)
                    }}
                    style={[selected ? dayButtonSelected : dayButtonBase, disabled && { opacity: 0.3 }]}
                    testID={testID ? `${testID}-kalender-tag-${day}` : undefined}
                  >
                    <Text style={selected ? dayTextSelected : dayTextBase}>{String(day)}</Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        </View>
      ) : null}
    </View>
  )
}
