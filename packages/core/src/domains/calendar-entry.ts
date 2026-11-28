/**
 * A deadline as a calendar file (iCalendar, RFC 5545): one all-day entry on the day itself, with
 * reminders before it. Any calendar app opens it; nothing is sent anywhere and no account is linked.
 */
export interface CalendarEntry {
  /** Stable per deadline, so importing the file again replaces the entry instead of doubling it. */
  readonly uid: string
  /** The day of the deadline, ISO yyyy-mm-dd. */
  readonly day: string
  readonly title: string
  readonly description: string
  /** Whole days before the deadline on which the calendar reminds. */
  readonly remindDaysBefore: readonly number[]
  /** The day the file is made, ISO yyyy-mm-dd (the entry's required timestamp). */
  readonly createdOn: string
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function compactDay(day: string, what: string): string {
  const match = ISO_DAY.exec(day)
  if (!match) throw new Error(`calendarFile: ${what} must be an ISO yyyy-mm-dd date, got "${day}".`)
  return `${match[1]}${match[2]}${match[3]}`
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and line breaks are escaped in text values. */
function escapeText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\r\n', '\\n').replaceAll('\n', '\\n')
}

const MAX_LINE_OCTETS = 75
const octets = (text: string): number => new TextEncoder().encode(text).length

/** RFC 5545 §3.1: a content line longer than 75 octets continues on the next line after a space. */
function fold(line: string): string[] {
  const lines: string[] = []
  let current = ''
  for (const char of line) {
    // A continuation line starts with one space, which counts towards its length.
    if (octets(current + char) > MAX_LINE_OCTETS) {
      lines.push(current)
      current = ` ${char}`
    } else current += char
  }
  lines.push(current)
  return lines
}

export function calendarFile(entry: CalendarEntry): string {
  const start = compactDay(entry.day, 'day')
  const end = compactDay(nextDay(entry.day), 'day')
  const stamp = `${compactDay(entry.createdOn, 'createdOn')}T000000Z`
  const alarms = entry.remindDaysBefore.flatMap((days) => {
    if (!Number.isInteger(days) || days < 0) throw new Error(`calendarFile: a reminder is whole days before the deadline, got ${days}.`)
    return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(entry.title)}`, `TRIGGER:-P${days}D`, 'END:VALARM']
  })
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SteuerEule//Fristen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(entry.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DESCRIPTION:${escapeText(entry.description)}`,
    'TRANSP:TRANSPARENT',
    ...alarms,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}
