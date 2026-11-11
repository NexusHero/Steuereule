import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { DateInput, germanDateToIso, isoDateToGerman, maskGermanDate } from './DateInput'
import { renderUi } from '../test-utils'

describe('maskGermanDate', () => {
  it('sets the dots while digits are typed', () => {
    expect(maskGermanDate('1', '')).toBe('1')
    expect(maskGermanDate('12', '1')).toBe('12.')
    expect(maskGermanDate('12.0', '12.')).toBe('12.0')
    expect(maskGermanDate('12.05', '12.0')).toBe('12.05.')
    expect(maskGermanDate('12.05.2018', '12.05.201')).toBe('12.05.2018')
  })

  it('turns eight pasted digits into a date', () => {
    expect(maskGermanDate('12052018', '')).toBe('12.05.2018')
  })

  it('leaves short forms the user typed with their own dots alone', () => {
    expect(maskGermanDate('20.8.', '20.8')).toBe('20.8.')
    expect(maskGermanDate('20.8.2019', '20.8.201')).toBe('20.8.2019')
  })

  it('never puts a dot back while the user deletes', () => {
    expect(maskGermanDate('12', '12.')).toBe('12')
    expect(maskGermanDate('12.05', '12.05.')).toBe('12.05')
  })

  it('drops everything that is not a digit or a dot and stops at ten characters', () => {
    expect(maskGermanDate('12/05-2018', '')).toBe('12.05.2018')
    expect(maskGermanDate('12.05.20189', '12.05.2018')).toBe('12.05.2018')
  })
})

describe('date conversion', () => {
  it('reads a complete German date as ISO, padding single digits, and rejects impossible days', () => {
    expect(germanDateToIso('12.05.2018')).toBe('2018-05-12')
    expect(germanDateToIso('2.9.2019')).toBe('2019-09-02')
    expect(germanDateToIso('31.02.2019')).toBeNull()
    expect(germanDateToIso('12.05.')).toBeNull()
    expect(isoDateToGerman('2018-05-12')).toBe('12.05.2018')
    expect(isoDateToGerman('kaputt')).toBe('')
  })
})

describe('DateInput', () => {
  it('reports typed digits with the dots set', () => {
    const onChange = vi.fn()
    renderUi(<DateInput value="" onChange={onChange} calendarLabel="Kalender öffnen" testID="datum" />)
    fireEvent.change(screen.getByTestId('datum'), { target: { value: '12052018' } })
    expect(onChange).toHaveBeenCalledWith('12.05.2018')
  })

  it('offers a calendar whose pick arrives as a German date', () => {
    const onChange = vi.fn()
    renderUi(<DateInput value="" onChange={onChange} calendarLabel="Kalender öffnen" testID="datum" />)
    expect(screen.getByLabelText('Kalender öffnen')).toBeTruthy()
    fireEvent.change(screen.getByTestId('datum-kalender'), { target: { value: '2018-05-12' } })
    expect(onChange).toHaveBeenCalledWith('12.05.2018')
  })

  it('opens the calendar on the date already typed and respects the latest allowed day', () => {
    renderUi(<DateInput value="12.05.2018" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" max="2026-12-31" />)
    const calendar = screen.getByTestId('datum-kalender') as HTMLInputElement
    expect(calendar.value).toBe('2018-05-12')
    expect(calendar.getAttribute('max')).toBe('2026-12-31')
    expect(calendar.getAttribute('type')).toBe('date')
  })

  it('keeps the calendar input out of the tab order and away from screen readers; the button is the way in', () => {
    renderUi(<DateInput value="" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" />)
    const calendar = screen.getByTestId('datum-kalender')
    expect(calendar.getAttribute('tabindex')).toBe('-1')
    expect(calendar.getAttribute('aria-hidden')).toBe('true')
  })
})
