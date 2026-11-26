// The live Vordruck: the page it shows with the values the printout prints, how it is paged and
// zoomed, what a click does (jump to the mask, or edit in place in expert mode) and what it says
// when a save is refused. The PDF itself is a fake loader — only the geometry matters here.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@steuereule/ui'
import { I18nextProvider } from 'react-i18next'
import { http, HttpResponse } from 'msw'
import { ApiError, type LiveFormDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../../test/test-msw-server'
import { AcroFormLiveViewer, type AcroAnnotationBox, type AcroFormPdfLoader } from './AcroFormLiveViewer'
import type { SaveAcroField } from './useAcroFieldSaver'

const ANNOTATIONS: readonly AcroAnnotationBox[] = [
  { fieldName: 'anlN.kz110', rect: [10, 700, 110, 720], textAlignment: 2 },
  { fieldName: 'est1a.wohnort', rect: [120, 700, 220, 720], textAlignment: 1 },
  { fieldName: 'anlN.kz320', rect: [10, 650, 110, 670] },
  { fieldName: 'est1a.religion', rect: [10, 600, 110, 620] },
  { fieldName: 'anlN.kz140', rect: [300, 600, 400, 620] },
  { fieldName: 'est1a.einzelveranlagung', rect: [300, 650, 312, 662] },
]

function loaderOf(pages = 2, annotations: readonly AcroAnnotationBox[] = ANNOTATIONS): AcroFormPdfLoader & { loadTemplate: ReturnType<typeof vi.fn> } {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale, convertToViewportRectangle: (r: readonly [number, number, number, number]) => r }),
    render: () => ({ promise: Promise.resolve() }),
    getAnnotations: async () => annotations,
  }
  return { loadTemplate: vi.fn(async () => ({ numPages: pages, getPage: async () => page })) }
}

const LIVE: readonly LiveFormDto[] = [
  { formular: 'est-1-a', instances: [{ person: 'A', entityId: null, values: { 'est1a.wohnort': 'Lörrach', 'est1a.einzelveranlagung': true } }] },
  { formular: 'anlage-n', instances: [{ person: 'A', entityId: null, values: { 'anlN.kz110': '58000', 'anlN.kz320': '420' } }] },
  {
    formular: 'anlage-kind',
    instances: [
      { person: 'A', entityId: 'k1', values: { 'anlKind.vorname': 'Lina' } },
      { person: 'A', entityId: 'k2', values: { 'anlKind.vorname': 'Noah' } },
    ],
  },
] as unknown as readonly LiveFormDto[]

function renderViewer(props: Partial<Parameters<typeof AcroFormLiveViewer>[0]> = {}) {
  const loader = (props.loader as ReturnType<typeof loaderOf> | undefined) ?? loaderOf()
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <AcroFormLiveViewer year={2025} initialForm="anlage-n" liveForms={LIVE} loader={loader} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return loader
}

afterEach(() => server.resetHandlers())

describe('AcroFormLiveViewer — reading', () => {
  it('shows the printed values on their fields and counts the filled ones', async () => {
    renderViewer()
    expect(await screen.findByText(/6 AcroForm-Felder auf dieser Seite \(2 befüllt\)/)).toBeTruthy()
    expect(screen.getByLabelText(/Anlage N · Zeile 6.*: 58000/)).toBeTruthy()
  })

  it('shows a ticked checkbox as a cross', async () => {
    renderViewer({ initialForm: 'est-1-a' })
    expect(await screen.findByLabelText(/einzelveranlagung: ✕/)).toBeTruthy()
  })

  it('pages through the form and stops at both ends', async () => {
    const loader = renderViewer()
    await screen.findByText('1 / 2')
    fireEvent.click(screen.getByText('◀ Seite'))
    expect(screen.getByText('1 / 2')).toBeTruthy()
    fireEvent.click(screen.getByText('Seite ▶'))
    expect(await screen.findByText('2 / 2')).toBeTruthy()
    fireEvent.click(screen.getByText('Seite ▶'))
    expect(screen.getByText('2 / 2')).toBeTruthy()
    fireEvent.click(screen.getByText('◀ Seite'))
    expect(await screen.findByText('1 / 2')).toBeTruthy()
    expect(loader.loadTemplate).toHaveBeenCalledWith(2025, 'anlage-n')
  })

  it('cycles the zoom and wraps around after the largest', async () => {
    renderViewer()
    const zoom = await screen.findByText(/🔍 \d+ %/)
    const read = () => Number(/(\d+) %/.exec(screen.getByText(/🔍/).textContent ?? '')?.[1])
    fireEvent.click(zoom)
    const first = read()
    for (let i = 0; i < 8 && read() !== 100; i += 1) fireEvent.click(screen.getByText(/🔍/))
    expect(first).toBeGreaterThanOrEqual(100)
    expect(read()).toBe(100)
  })

  it('switches to another Vordruck and starts on its first page', async () => {
    const loader = renderViewer()
    await screen.findByText('1 / 2')
    fireEvent.click(screen.getByText('Seite ▶'))
    await screen.findByText('2 / 2')
    fireEvent.click(screen.getByText('Anlage Kind'))
    await waitFor(() => expect(loader.loadTemplate).toHaveBeenCalledWith(2025, 'anlage-kind'))
    expect(await screen.findByText('1 / 2')).toBeTruthy()
  })

  it('offers the copies of a Vordruck that is printed more than once and switches between them', async () => {
    renderViewer({
      initialForm: 'anlage-kind',
      liveForms: [
        { formular: 'anlage-kind', instances: [{ person: 'A', entityId: 'k1', values: { 'anlKind.vorname': 'Lina' } }, { person: 'B', entityId: null, values: { 'anlKind.vorname': 'Noah' } }] },
      ] as unknown as readonly LiveFormDto[],
      loader: loaderOf(1, [{ fieldName: 'anlKind.vorname', rect: [10, 700, 110, 720] }]),
    })
    const copies = await screen.findByTestId('acro-copies')
    expect(copies.querySelectorAll('[role="button"], button').length).toBe(2)
    expect(await screen.findByLabelText(/: Lina/)).toBeTruthy()
    fireEvent.click(copies.querySelectorAll('[role="button"], button')[1]!)
    expect(await screen.findByLabelText(/: Noah/)).toBeTruthy()
  })

  it('says why the Vordruck could not be loaded in the shared wording, never „HTTP 503“, and loads again on retry (NC-12)', async () => {
    const loadTemplate = vi.fn(async () => Promise.reject(new ApiError(503, null)))
    renderViewer({ loader: { loadTemplate } })
    expect(await screen.findByText('Der Vordruck konnte nicht geladen werden. Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
    expect(screen.queryByText(/HTTP/)).toBeNull()
    const calls = loadTemplate.mock.calls.length
    fireEvent.click(screen.getByTestId('acro-vorlage-erneut'))
    await waitFor(() => expect(loadTemplate.mock.calls.length).toBeGreaterThan(calls))
  })

  it('falls back to a generic message for an error without text', async () => {
    renderViewer({ loader: { loadTemplate: vi.fn(async () => Promise.reject('boom')) } })
    expect(await screen.findByText('Der Vordruck konnte nicht geladen werden.')).toBeTruthy()
  })

  it('asks the API for the template when no loader is given and reports a refusal', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck/vorlage/anlage-n', () => new HttpResponse(null, { status: 404 })))
    render(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AcroFormLiveViewer year={2025} initialForm="anlage-n" liveForms={LIVE} />
        </ThemeProvider>
      </I18nextProvider>,
    )
    expect(await screen.findByText('Der Vordruck konnte nicht geladen werden. Diesen Vordruck gibt es für dieses Jahr nicht.')).toBeTruthy()
  })
})

describe('AcroFormLiveViewer — clicking a field', () => {
  it('jumps to the mask that owns the field', async () => {
    const onInspectField = vi.fn()
    renderViewer({ onInspectField })
    fireEvent.click(await screen.findByLabelText(/Anlage N · Zeile 6.*: 58000/))
    expect(onInspectField).toHaveBeenCalledWith('lstb', 'bruttoarbeitslohn', 'A')
  })

  it('shows the focused field with its value and offers the jump to its mask', async () => {
    const onInspectField = vi.fn()
    renderViewer({ onInspectField, highlightedFieldId: 'anlN.kz110' })
    expect(await screen.findByText(/Aktives AcroForm-Feld: anlN\.kz110/)).toBeTruthy()
    expect(screen.getByText('Eingetragener Wert: 58000')).toBeTruthy()
    fireEvent.click(screen.getByText('Ins Eingabefeld springen →'))
    expect(onInspectField).toHaveBeenCalledWith('lstb', 'bruttoarbeitslohn', 'A')
  })

  it('says that a focused field is empty in the official form', async () => {
    renderViewer({ highlightedFieldId: 'anlN.kz140' })
    expect(await screen.findByText('Derzeit leer im amtlichen Formular')).toBeTruthy()
  })

  it('shows a ticked checkbox in the inspector as ticked', async () => {
    renderViewer({ initialForm: 'est-1-a', highlightedFieldId: 'est1a.einzelveranlagung' })
    expect(await screen.findByText('Eingetragener Wert: ✕ (Angekreuzt)')).toBeTruthy()
  })

  it('follows a new highlighted field', async () => {
    const view = render(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AcroFormLiveViewer year={2025} initialForm="anlage-n" liveForms={LIVE} loader={loaderOf()} highlightedFieldId="anlN.kz110" />
        </ThemeProvider>
      </I18nextProvider>,
    )
    await screen.findByText(/Aktives AcroForm-Feld: anlN\.kz110/)
    view.rerender(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AcroFormLiveViewer year={2025} initialForm="anlage-n" liveForms={LIVE} loader={loaderOf()} highlightedFieldId="anlN.kz140" />
        </ThemeProvider>
      </I18nextProvider>,
    )
    expect(await screen.findByText(/Aktives AcroForm-Feld: anlN\.kz140/)).toBeTruthy()
  })
})

describe('AcroFormLiveViewer — expert mode: editing in place', () => {
  function expert(save: SaveAcroField, props: Partial<Parameters<typeof AcroFormLiveViewer>[0]> = {}) {
    return renderViewer({ onSaveAcroField: save, ...props })
  }

  it('marks what can be changed here, what is computed and what stays in its mask', async () => {
    expert(vi.fn())
    expect(await screen.findByTestId('acro-field-editable-anlN.kz110')).toBeTruthy()
    expect(screen.getByTestId('acro-field-computed-anlN.kz320')).toBeTruthy()
    expect(screen.getByTestId('acro-legend')).toBeTruthy()
  })

  it('only selects a field on click and does not leave for the mask', async () => {
    const onInspectField = vi.fn()
    expert(vi.fn(), { onInspectField })
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlN.kz110'))
    expect(await screen.findByText(/Aktives AcroForm-Feld: anlN\.kz110/)).toBeTruthy()
    expect(onInspectField).not.toHaveBeenCalled()
  })

  it('saves an amount typed in the inspector with Enter, as entered, for the copy of the field', async () => {
    const save = vi.fn<SaveAcroField>().mockResolvedValue({ kind: 'saved' })
    expert(save)
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlN.kz110'))
    const input = await screen.findByLabelText('Direkteingabe Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)')
    fireEvent.change(input, { target: { value: '60.000' } })
    fireEvent.keyPress(input, { key: 'Enter', charCode: 13 })
    fireEvent.click(screen.getByText('✓ Direkt speichern'))
    await waitFor(() => expect(save).toHaveBeenCalledWith('anlN.kz110', '60.000', { person: 'A', entityId: null, copies: 1 }))
    expect(await screen.findByTestId('acro-save-feedback')).toBeTruthy()
    expect(screen.getByTestId('acro-save-feedback').textContent).toBe('Gespeichert.')
  })

  it('keeps an invalid entry for correcting and names the reason', async () => {
    const save = vi.fn<SaveAcroField>().mockResolvedValue({ kind: 'invalid', reason: 'amount' })
    expert(save)
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlN.kz110'))
    const input = await screen.findByLabelText('Direkteingabe Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)')
    fireEvent.change(input, { target: { value: '1,5' } })
    fireEvent.click(screen.getByText('✓ Direkt speichern'))
    expect((await screen.findByTestId('acro-save-feedback')).textContent).toBe('Bitte einen ganzen Betrag eingeben, z. B. 68500 oder 68.500.')
    expect((screen.getByLabelText('Direkteingabe Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)') as HTMLInputElement).value).toBe('1,5')
  })

  it('says so when the save fails and returns to the stored value', async () => {
    const save = vi.fn<SaveAcroField>().mockRejectedValue(new Error('offline'))
    expert(save)
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlN.kz110'))
    const input = await screen.findByLabelText('Direkteingabe Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)')
    fireEvent.change(input, { target: { value: '61000' } })
    fireEvent.click(screen.getByText('✓ Direkt speichern'))
    expect((await screen.findByTestId('acro-save-feedback')).textContent).toBe('Konnte nicht gespeichert werden. Der vorherige Wert bleibt bestehen.')
    expect((screen.getByLabelText('Direkteingabe Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)') as HTMLInputElement).value).toBe('58000')
  })

  it('does not save an entry that equals the stored value', async () => {
    const save = vi.fn<SaveAcroField>().mockResolvedValue({ kind: 'saved' })
    expert(save)
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlN.kz110'))
    const input = await screen.findByLabelText('Direkteingabe Anlage N · Zeile 6 (Kz 110 Bruttoarbeitslohn)')
    fireEvent.change(input, { target: { value: ' 58000 ' } })
    fireEvent.click(screen.getByText('✓ Direkt speichern'))
    await new Promise((r) => setTimeout(r, 30))
    expect(save).not.toHaveBeenCalled()
  })

  it('edits inside the field on the page and saves when it loses focus', async () => {
    const save = vi.fn<SaveAcroField>().mockResolvedValue({ kind: 'cleared' })
    expert(save)
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlN.kz110'))
    const inline = await screen.findByLabelText('Formularfeld anlN.kz110 bearbeiten')
    fireEvent.change(inline, { target: { value: '' } })
    fireEvent.blur(inline)
    await waitFor(() => expect(save).toHaveBeenCalledWith('anlN.kz110', '', expect.anything()))
    expect((await screen.findByTestId('acro-save-feedback')).textContent).toBe('Wert entfernt, das Feld ist wieder offen.')
  })

  it('names the sources of a computed field and offers no input for it', async () => {
    expert(vi.fn())
    fireEvent.click(await screen.findByTestId('acro-field-computed-anlN.kz320'))
    expect((await screen.findByTestId('acro-derived-hint')).textContent).toBe('Wird berechnet aus: Arbeitsmittel (Einzelposten). Ändere die Einzelposten in der Eingabemaske.')
    expect(screen.queryByText('✓ Direkt speichern')).toBeNull()
  })

  it('says that a field outside the allow-list is changed in its mask', async () => {
    expert(vi.fn())
    fireEvent.click(await screen.findByLabelText(/Hauptvordruck ESt 1 A · religion/))
    expect(await screen.findByText('Dieses Feld änderst du in der Eingabemaske.')).toBeTruthy()
  })

  it('edits a text field with a text keyboard and a text placeholder', async () => {
    expert(vi.fn(), { initialForm: 'est-1-a' })
    fireEvent.click(await screen.findByTestId('acro-field-editable-est1a.wohnort'))
    const input = (await screen.findByLabelText('Direkteingabe Hauptvordruck ESt 1 A · wohnort')) as HTMLInputElement
    expect(input.placeholder).toBe('Text eingeben')
    expect(input.getAttribute('inputmode')).toBe('text')
  })

  it('drops a draft when the user switches to another copy', async () => {
    const save = vi.fn<SaveAcroField>()
    renderViewer({
      onSaveAcroField: save,
      initialForm: 'anlage-kind',
      liveForms: LIVE,
      loader: loaderOf(1, [{ fieldName: 'anlKind.vorname', rect: [10, 700, 110, 720] }]),
    })
    fireEvent.click(await screen.findByTestId('acro-field-editable-anlKind.vorname'))
    const input = await screen.findByLabelText(/^Direkteingabe .*Kind/)
    fireEvent.change(input, { target: { value: 'Geändert' } })
    expect(screen.getAllByDisplayValue('Geändert').length).toBeGreaterThan(0)
    const copies = screen.getByTestId('acro-copies').querySelectorAll('[role="button"], button')
    fireEvent.click(copies[1]!)
    await waitFor(() => expect(screen.queryByDisplayValue('Geändert')).toBeNull())
    expect(save).not.toHaveBeenCalled()
  })
})
