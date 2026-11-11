import { createElement, useRef, type CSSProperties } from 'react'
import { Platform, Pressable, View, type ViewStyle } from 'react-native'
import type { InputAutoComplete } from '../lib/autoComplete'
import { useTheme } from '../theme/useTheme'
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

/**
 * A date field that can be typed (the dots set themselves) or picked: on the web a button opens the
 * browser's own calendar with its month and year menus. Native platforms get the typed field only.
 */
export function DateInput({ value, onChange, calendarLabel, accessibilityLabel, testID, min, max, autoComplete, onBlur, onSubmit }: DateInputProps) {
  const t = useTheme()
  const calendar = useRef<HTMLInputElement | null>(null)

  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const button: ViewStyle = {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
  }
  const sheet: ViewStyle = { width: 22, height: 20, borderWidth: 2, borderColor: t.color.tinte, borderRadius: 3 }
  const sheetHead: ViewStyle = { height: 5, backgroundColor: t.color.tinte }

  function openCalendar() {
    const input = calendar.current
    if (!input) return
    // Older browsers have no showPicker; focusing the date field is the closest they offer.
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.focus()
  }

  return (
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={calendarLabel}
          onPress={openCalendar}
          style={button}
          {...(testID ? { testID: `${testID}-kalender-oeffnen` } : {})}
        >
          <View style={sheet}>
            <View style={sheetHead} />
          </View>
          {createElement('input', {
            ref: calendar,
            type: 'date',
            value: germanDateToIso(value) ?? '',
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
        </Pressable>
      ) : null}
    </View>
  )
}
