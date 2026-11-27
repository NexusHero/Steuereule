import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInApp } from '../../../test/test-render'
import * as download from '../privacy/exportDownload'
import { CalendarEntryButton } from './CalendarEntryButton'

afterEach(() => vi.restoreAllMocks())

describe('a deadline into the calendar', () => {
  it('hands the device a calendar file for the day of the deadline, made today', async () => {
    const handed = vi.spyOn(download, 'triggerBrowserDownload').mockImplementation(() => {})
    renderInApp(
      <CalendarEntryButton
        entry={{ uid: 'abgabefrist-2025@steuereule', day: '2026-07-31', title: 'Abgabefrist Steuererklärung 2025', description: 'Letzter Tag.', remindDaysBefore: [30, 7] }}
        fileName="steuereule-abgabefrist-2025"
        testID="kalender"
      />,
    )
    const button = screen.getByTestId('kalender')
    expect(button.getAttribute('aria-label')).toBe('Abgabefrist Steuererklärung 2025 in den Kalender eintragen')
    fireEvent.click(button)
    expect(handed).toHaveBeenCalledOnce()
    const [blob, name] = handed.mock.calls[0]!
    expect(name).toBe('steuereule-abgabefrist-2025.ics')
    expect(blob.type).toBe('text/calendar;charset=utf-8')
    // jsdom's Blob has no text(); its FileReader reads one.
    const file = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)))
      reader.readAsText(blob)
    })
    expect(file).toContain('DTSTART;VALUE=DATE:20260731')
    expect(file).toContain(`DTSTAMP:${new Date().toISOString().slice(0, 10).replaceAll('-', '')}T000000Z`)
    expect(file).toContain('TRIGGER:-P30D')
  })
})
