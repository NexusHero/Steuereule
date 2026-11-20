import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ConfirmationResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ConfirmationScreen } from './ConfirmationScreen'

const WITH_VALUES: ConfirmationResponseDto = {
  annexes: [
    {
      annex: 'anlageN',
      unconfirmed: 1,
      values: [
        {
          key: 'lstb.bruttoarbeitslohn',
          screen: 'lstb',
          instance: null,
          field: 'bruttoarbeitslohn',
          value: '4750',
          provenance: { kind: 'nutzer' },
          confirmed: true,
          proposal: { value: '4800', provenance: { kind: 'assistent', name: 'Claude' } },
        },
        {
          key: 'lstb.lohnsteuer',
          screen: 'lstb',
          instance: null,
          field: 'lohnsteuer',
          value: '700',
          provenance: { kind: 'uebernahme', lastYear: 2024 },
          confirmed: false,
          proposal: null,
        },
      ],
    },
  ],
  tasks: [],
}

const TASK = { id: 'task-1', kind: 'konfession', text: 'Bitte trage deine Konfession in den Stammdaten ein.', assistant: 'Claude', createdAt: '2026-01-05T10:00:00.000Z' } as const
const SECOND_TASK = { id: 'task-2', kind: 'beleg_nachreichen', text: '<b>Die Spendenquittung</b> fehlt noch.', assistant: 'Claude', createdAt: '2026-01-05T10:01:00.000Z' } as const

function renderScreen(locale: 'de' | 'en' = 'de') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onBack = vi.fn()
  const onOpenScreen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n(locale)}>
        <ThemeProvider mode="light">
          <ConfirmationScreen year={2025} onBack={onBack} onOpenScreen={onOpenScreen} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onBack, onMaskeOeffnen: onOpenScreen }
}

afterEach(() => server.resetHandlers())

describe('BestaetigungScreen (REQ-032, ADR-0052 §6/§7)', () => {
  it('shows every new value per Anlage with its Herkunft, and a proposal as "X statt Y"', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)))
    renderScreen()

    expect(await screen.findByText('Anlage N')).toBeTruthy()
    expect(screen.getByText('1 Wert unbestätigt')).toBeTruthy()
    expect(screen.getByText('Einbehaltene Lohnsteuer (Zeile 4)')).toBeTruthy()
    expect(screen.getByText('700 €')).toBeTruthy()
    expect(screen.getByText('Übernahme aus 2024')).toBeTruthy()
    expect(screen.getByText('Assistent: Claude schlägt 4.800 € statt 4.750 € vor.')).toBeTruthy()
  })

  it('confirming the Anlage calls the endpoint and shows the honest empty state afterwards', async () => {
    let confirmed = false
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(confirmed ? { annexes: [] } : WITH_VALUES)),
      http.put('*/v1/steuerjahre/2025/bestaetigung/anlagen/anlageN', () => {
        confirmed = true
        return HttpResponse.json({ annexes: [] })
      }),
    )
    renderScreen()

    fireEvent.click(await screen.findByTestId('bestaetige-anlageN'))

    expect(await screen.findByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeTruthy()
    expect(confirmed).toBe(true)
  })

  it('accepting or discarding a proposal sends the decision for exactly that field', async () => {
    const decisions: { key: string; body: unknown }[] = []
    server.use(
      http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)),
      http.put('*/v1/steuerjahre/2025/bestaetigung/vorschlaege/:key', async ({ params, request }) => {
        decisions.push({ key: String(params.key), body: await request.json() })
        return HttpResponse.json(WITH_VALUES)
      }),
    )
    renderScreen()

    fireEvent.click(await screen.findByTestId('vorschlag-annehmen-lstb.bruttoarbeitslohn'))
    await waitFor(() => expect(decisions).toEqual([{ key: 'lstb.bruttoarbeitslohn', body: { decision: 'annehmen' } }]))
    fireEvent.click(screen.getByTestId('vorschlag-verwerfen-lstb.bruttoarbeitslohn'))
    await waitFor(() => expect(decisions[1]).toEqual({ key: 'lstb.bruttoarbeitslohn', body: { decision: 'verwerfen' } }))
  })

  it('"einzeln ändern" opens the mask the value belongs to', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)))
    const { onMaskeOeffnen: onOpenScreen } = renderScreen()

    fireEvent.click(await screen.findByTestId('aendern-anlageN'))
    expect(onOpenScreen).toHaveBeenCalledWith('lstb')
  })

  it('speaks English too', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json(WITH_VALUES)))
    renderScreen('en')

    expect(await screen.findByText('1 value unconfirmed')).toBeTruthy()
    expect(screen.getByText('Carried over from 2024')).toBeTruthy()
    expect(screen.getByText('Assistant: Claude suggests 4.800 € instead of 4.750 €.')).toBeTruthy()
  })

  describe('tasks the assistant left (#547)', () => {
    it('lists the open tasks with their kind, text and assistant, the text as plain text', async () => {
      server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json({ annexes: [], tasks: [TASK, SECOND_TASK] })))
      renderScreen()

      expect(await screen.findByText('Aufgaben von deinem Assistenten')).toBeTruthy()
      expect(screen.getByText('Konfession eintragen')).toBeTruthy()
      expect(screen.getByText('Bitte trage deine Konfession in den Stammdaten ein.')).toBeTruthy()
      expect(screen.getByText('Beleg nachreichen')).toBeTruthy()
      // Markup an assistant wrote stays text: no element is made of it.
      expect(screen.getByText('<b>Die Spendenquittung</b> fehlt noch.')).toBeTruthy()
      expect(screen.getByTestId('aufgabe-task-2').querySelector('b')).toBeNull()
      expect(screen.getAllByText('Von Claude')).toHaveLength(2)
      // Tasks are open: the screen does not claim there is nothing left.
      expect(screen.queryByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeNull()
    })

    it('settling a task sends „erledigt“ for exactly that task and shows what is left', async () => {
      const decisions: { id: string; body: unknown }[] = []
      let tasks: unknown[] = [TASK, SECOND_TASK]
      server.use(
        http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json({ annexes: [], tasks })),
        http.put('*/v1/steuerjahre/2025/bestaetigung/aufgaben/:id', async ({ params, request }) => {
          decisions.push({ id: String(params.id), body: await request.json() })
          tasks = [SECOND_TASK]
          return HttpResponse.json({ annexes: [], tasks })
        }),
      )
      renderScreen()

      fireEvent.click(await screen.findByTestId('aufgabe-erledigt-task-1'))

      await waitFor(() => expect(decisions).toEqual([{ id: 'task-1', body: { decision: 'erledigt' } }]))
      await waitFor(() => expect(screen.queryByTestId('aufgabe-task-1')).toBeNull())
      expect(screen.getByTestId('aufgabe-task-2')).toBeTruthy()
    })

    it('discarding the last task sends „verworfen“ and leaves the honest empty state', async () => {
      const decisions: unknown[] = []
      let tasks: unknown[] = [TASK]
      server.use(
        http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json({ annexes: [], tasks })),
        http.put('*/v1/steuerjahre/2025/bestaetigung/aufgaben/task-1', async ({ request }) => {
          decisions.push(await request.json())
          tasks = []
          return HttpResponse.json({ annexes: [], tasks })
        }),
      )
      renderScreen()

      fireEvent.click(await screen.findByTestId('aufgabe-verwerfen-task-1'))

      expect(await screen.findByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeTruthy()
      expect(decisions).toEqual([{ decision: 'verworfen' }])
    })

    it('shows the tasks next to the values to confirm, and none when the answer carries none', async () => {
      server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json({ ...WITH_VALUES, tasks: [TASK] })))
      renderScreen('en')

      expect(await screen.findByText('Tasks from your assistant')).toBeTruthy()
      expect(screen.getByText('1 value unconfirmed')).toBeTruthy()
    })

    it('an answer of an older API without tasks still renders', async () => {
      server.use(http.get('*/v1/steuerjahre/2025/bestaetigung', () => HttpResponse.json({ annexes: [] })))
      renderScreen()

      expect(await screen.findByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeTruthy()
      expect(screen.queryByText('Aufgaben von deinem Assistenten')).toBeNull()
    })
  })
})
