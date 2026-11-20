import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { DateInput } from './DateInput'
import { renderUi } from '../test-utils'

function open(testID = 'datum') {
  fireEvent.click(screen.getByTestId(`${testID}-kalender-oeffnen`))
}

describe('DateInput calendar dialog', () => {
  it('walks month by month and year by year, rolling the year over in December and January', () => {
    renderUi(<DateInput value="15.12.2018" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" />)
    open()
    const title = () => screen.getByTestId('datum-kalender-titel').textContent
    expect(title()).toBe('Dezember 2018')

    fireEvent.click(screen.getByTestId('datum-kalender-next-month'))
    expect(title()).toBe('Januar 2019')
    fireEvent.click(screen.getByTestId('datum-kalender-prev-month'))
    expect(title()).toBe('Dezember 2018')
    fireEvent.click(screen.getByTestId('datum-kalender-next-year'))
    expect(title()).toBe('Dezember 2019')
    fireEvent.click(screen.getByTestId('datum-kalender-prev-year'))
    fireEvent.click(screen.getByTestId('datum-kalender-prev-year'))
    expect(title()).toBe('Dezember 2017')
  })

  it('lays the days out from a Monday: May 2018 starts on a Tuesday and has 31 days', () => {
    renderUi(<DateInput value="12.05.2018" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" />)
    open()
    for (const weekday of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) expect(screen.getByText(weekday)).toBeTruthy()
    expect(screen.getByTestId('datum-kalender-tag-31')).toBeTruthy()
    expect(screen.queryByTestId('datum-kalender-tag-32')).toBeNull()
    expect(screen.getByLabelText('01.05.2018')).toBeTruthy()
  })

  it('marks the typed day as selected and picks a day from another month', () => {
    const onChange = vi.fn()
    renderUi(<DateInput value="12.05.2018" onChange={onChange} calendarLabel="Kalender öffnen" testID="datum" />)
    open()
    fireEvent.click(screen.getByTestId('datum-kalender-next-month'))
    fireEvent.click(screen.getByTestId('datum-kalender-tag-3'))
    expect(onChange).toHaveBeenCalledWith('03.06.2018')
    expect(screen.queryByTestId('datum-kalender-dialog')).toBeNull()
  })

  it('does not offer days outside min and max', () => {
    const onChange = vi.fn()
    renderUi(
      <DateInput
        value="12.05.2018"
        onChange={onChange}
        calendarLabel="Kalender öffnen"
        testID="datum"
        min="2018-05-10"
        max="2018-05-20"
      />,
    )
    open()
    fireEvent.click(screen.getByTestId('datum-kalender-tag-9'))
    fireEvent.click(screen.getByTestId('datum-kalender-tag-21'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('datum-kalender-tag-10'))
    expect(onChange).toHaveBeenCalledWith('10.05.2018')
  })

  it('closes again when the calendar button is pressed a second time', () => {
    renderUi(<DateInput value="" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" />)
    open()
    expect(screen.getByTestId('datum-kalender-dialog')).toBeTruthy()
    expect(screen.getByLabelText('Kalender öffnen').getAttribute('aria-expanded')).toBe('true')
    open()
    expect(screen.queryByTestId('datum-kalender-dialog')).toBeNull()
  })

  it('starts on the latest allowed month while nothing is typed, and on the typed month after reopening', () => {
    const { rerender } = renderUi(
      <DateInput value="" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" max="2020-03-31" />,
    )
    open()
    expect(screen.getByTestId('datum-kalender-titel').textContent).toBe('März 2020')
    fireEvent.click(screen.getByTestId('datum-kalender-prev-year'))
    open()
    rerender(<DateInput value="01.09.2019" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" max="2020-03-31" />)
    open()
    expect(screen.getByTestId('datum-kalender-titel').textContent).toBe('September 2019')
  })

  it('opens on the current month when nothing is typed and no limit is given', () => {
    renderUi(<DateInput value="" onChange={() => {}} calendarLabel="Kalender öffnen" testID="datum" />)
    open()
    const now = new Date()
    expect(screen.getByTestId('datum-kalender-titel').textContent).toMatch(new RegExp(`${now.getUTCFullYear()}$`))
  })

  it('works without a testID: the dialog gets a default id and the days are still pickable by label', () => {
    const onChange = vi.fn()
    renderUi(<DateInput value="12.05.2018" onChange={onChange} calendarLabel="Kalender öffnen" accessibilityLabel="Geburtsdatum" />)
    expect(screen.getByLabelText('Geburtsdatum')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Kalender öffnen'))
    expect(screen.getByTestId('date-kalender-dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('20.05.2018'))
    expect(onChange).toHaveBeenCalledWith('20.05.2018')
  })

  it('ignores an incomplete value from the native date picker', () => {
    const onChange = vi.fn()
    renderUi(<DateInput value="" onChange={onChange} calendarLabel="Kalender öffnen" testID="datum" />)
    fireEvent.change(screen.getByTestId('datum-kalender'), { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('passes blur and submit through to the typed field and tells the browser what to autofill', () => {
    const onBlur = vi.fn()
    const onSubmit = vi.fn()
    renderUi(
      <DateInput
        value="12.05.2018"
        onChange={() => {}}
        calendarLabel="Kalender öffnen"
        testID="datum"
        autoComplete="bday"
        onBlur={onBlur}
        onSubmit={onSubmit}
      />,
    )
    const field = screen.getByTestId('datum')
    expect(field.getAttribute('autocomplete')).toBe('bday')
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)
    expect(onBlur).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
