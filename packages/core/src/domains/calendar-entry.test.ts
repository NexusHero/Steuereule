import { describe, expect, it } from 'vitest'
import { calendarFile, type CalendarEntry } from './calendar-entry'

const ENTRY: CalendarEntry = {
  uid: 'abgabefrist-2025@steuereule',
  day: '2026-07-31',
  title: 'Abgabefrist Steuererklärung 2025',
  description: 'Letzter Tag für die Abgabe.',
  remindDaysBefore: [14, 1],
  createdOn: '2026-05-02',
}

describe('a deadline as a calendar file', () => {
  it('is one all-day entry on the day of the deadline, ending the day after', () => {
    const file = calendarFile(ENTRY)
    expect(file.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(file.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(file).toContain('UID:abgabefrist-2025@steuereule\r\n')
    expect(file).toContain('DTSTAMP:20260502T000000Z\r\n')
    expect(file).toContain('DTSTART;VALUE=DATE:20260731\r\nDTEND;VALUE=DATE:20260801\r\n')
    expect(file).toContain('SUMMARY:Abgabefrist Steuererklärung 2025\r\n')
  })

  it('reminds on each of the days asked for', () => {
    const file = calendarFile(ENTRY)
    expect(file.match(/BEGIN:VALARM/g)).toHaveLength(2)
    expect(file).toContain('TRIGGER:-P14D\r\n')
    expect(file).toContain('TRIGGER:-P1D\r\n')
    expect(calendarFile({ ...ENTRY, remindDaysBefore: [] })).not.toContain('VALARM')
  })

  it('ends a deadline on the last day of a month or year on the first of the next', () => {
    expect(calendarFile({ ...ENTRY, day: '2026-12-31' })).toContain('DTEND;VALUE=DATE:20270101\r\n')
    expect(calendarFile({ ...ENTRY, day: '2028-02-29' })).toContain('DTEND;VALUE=DATE:20280301\r\n')
  })

  it('escapes what a text value may not hold, and folds a long line', () => {
    const file = calendarFile({ ...ENTRY, title: 'Einspruch; Bescheid, 2024', description: `Zeile eins\nZeile zwei \\ ${'ä'.repeat(60)}` })
    expect(file).toContain('SUMMARY:Einspruch\\; Bescheid\\, 2024\r\n')
    expect(file).toContain('DESCRIPTION:Zeile eins\\nZeile zwei \\\\ ')
    const lines = file.split('\r\n')
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
    expect(lines.some((line) => line.startsWith(' '))).toBe(true)
    // Unfolded, the text is whole again.
    expect(file.replaceAll('\r\n ', '')).toContain('ä'.repeat(60))
  })

  it('refuses a day that is no date and a reminder that is no whole day', () => {
    expect(() => calendarFile({ ...ENTRY, day: '31.07.2026' })).toThrow(/day must be an ISO/)
    expect(() => calendarFile({ ...ENTRY, createdOn: '' })).toThrow(/createdOn must be an ISO/)
    expect(() => calendarFile({ ...ENTRY, remindDaysBefore: [1.5] })).toThrow(/whole days/)
  })
})
