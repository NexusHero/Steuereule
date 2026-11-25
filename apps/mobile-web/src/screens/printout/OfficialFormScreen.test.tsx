import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { readExpertMode, writeExpertMode } from '../../lib/expertModePreference'
import { server } from '../../test-msw-server'
import type { AcroFormPdfLoader } from './AcroFormLiveViewer'
import { OfficialFormScreen } from './OfficialFormScreen'
import { renderWithQuery } from '../../test-render'

const loader: AcroFormPdfLoader = {
  loadTemplate: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({ width: 595, height: 842, convertToViewportRectangle: (r: readonly [number, number, number, number]) => r }),
      render: () => ({ promise: Promise.resolve() }),
      getAnnotations: async () => [{ fieldName: 'anlN.kz110', rect: [233.9, 575, 350.4, 591], textAlignment: 2 }],
    }),
  }),
}

function renderScreen(onBack = vi.fn()) {
  server.use(
    http.get('*/v1/steuerjahre/2025/ausdruck/werte', () =>
      HttpResponse.json({ forms: [{ formular: 'anlage-n', instances: [{ person: 'A', entityId: null, values: { 'anlN.kz110': '64000' } }] }] }),
    ),
  )
  renderWithQuery(<OfficialFormScreen taxYear={2025} initialForm="anlage-n" onBack={onBack} acroFormLoader={loader} />)
  return onBack
}

afterEach(() => {
  server.resetHandlers()
  writeExpertMode(false)
})

describe('OfficialFormScreen', () => {
  it('opens the requested Vordruck with its values on a screen of its own', async () => {
    const onBack = renderScreen()

    expect(screen.getByText('Amtliches Formular 2025')).toBeTruthy()
    expect(await screen.findByLabelText(/Kz 110 Bruttoarbeitslohn\): 64000/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalled()
  })

  it('switches the expert mode right there and then marks the editable fields', async () => {
    renderScreen()
    await screen.findByLabelText(/Kz 110 Bruttoarbeitslohn\): 64000/)
    expect(screen.queryByTestId('acro-legend')).toBeNull()

    fireEvent.click(screen.getByTestId('formular-expertenmodus').querySelector('input[type="checkbox"]') as HTMLInputElement)

    expect(readExpertMode()).toBe(true)
    expect(await screen.findByTestId('acro-legend')).toBeTruthy()
    expect(screen.getByTestId('acro-field-editable-anlN.kz110')).toBeTruthy()
  })
})
