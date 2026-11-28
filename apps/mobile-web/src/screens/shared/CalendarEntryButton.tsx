import { Pressable, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { calendarFile, type CalendarEntry } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { Icon } from '../../icons/Icon'
import { triggerBrowserDownload } from '../privacy/exportDownload'

export interface CalendarEntryButtonProps {
  /** The deadline; the day the file is made is filled in when it is pressed. */
  readonly entry: Omit<CalendarEntry, 'createdOn'>
  /** Without the ending, e.g. `abgabefrist-2025`. */
  readonly fileName: string
  readonly testID: string
}

/**
 * Puts a deadline into the user's own calendar: a calendar file the device opens. Made on the device;
 * nothing is sent. Only where a browser can hand over a file, so absent in a native build.
 */
export function CalendarEntryButton({ entry, fileName, testID }: CalendarEntryButtonProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  if (typeof document === 'undefined') return null
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s1, alignSelf: 'flex-start', minHeight: 44 }
  const label: TextStyle = { ...t.type.small, color: t.color.tinte, textDecorationLine: 'underline' }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('fristen.kalenderA11y', { titel: entry.title })}
      onPress={() => {
        const createdOn = new Date().toISOString().slice(0, 10)
        triggerBrowserDownload(new Blob([calendarFile({ ...entry, createdOn })], { type: 'text/calendar;charset=utf-8' }), `${fileName}.ics`)
      }}
      style={row}
      testID={testID}
    >
      <Icon name="calendar" size={16} color={t.color.tinte} />
      <Text style={label}>{tr('fristen.kalender')}</Text>
    </Pressable>
  )
}
