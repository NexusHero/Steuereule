import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CockpitScreen } from '../cockpit/CockpitScreen'
import { LstbScreen } from '../lstb/LstbScreen'
import { OwlModeScreen } from './OwlModeScreen'
import { AdvisorChatPanel } from './AdvisorChatPanel'
import { CopilotBridgeProvider, type CopilotMode, useCopilotBridge, useOptionalCopilotBridge } from './CopilotBridgeProvider'

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  setViewportWidth(0)
})

const PENDING_WORKDAYS_DRAFT: AdvisorActionProposal = {
  actionId: 'act-ho-1',
  status: 'pending',
  screen: 'interview',
  field: 'homeoffice',
  instance: null,
  label: 'Homeoffice-Tage (60 Tage)',
  previousValue: '0',
  expectedPreviousValue: '0',
  newValue: '60',
  beforeRefundEur: 480,
  afterRefundEur: 605,
  deltaEur: 125,
  reason: 'Homeoffice-Tagespauschale 6 €/Tag (§ 4 Abs. 5 Nr. 6c EStG)',
  sourceId: 'estg-4-5-6c',
  paragraph: '§ 4 Abs. 5 Nr. 6c EStG',
}

const PAUSCHBETRAG_ZERO_DELTA_DRAFT: AdvisorActionProposal = {
  actionId: 'act-zero-1',
  status: 'pending',
  screen: 'commute',
  field: 'oneWayKm',
  instance: null,
  label: 'Entfernungspauschale (12 km)',
  previousValue: '0',
  expectedPreviousValue: '0',
  newValue: '12',
  beforeRefundEur: 480,
  afterRefundEur: 480,
  deltaEur: 0,
  reason: 'Liegt insgesamt unter dem Arbeitnehmer-Pauschbetrag von 1.230 €.',
  sourceId: 'estg-9-1',
  paragraph: '§ 9 Abs. 1 EStG',
}

function makeSseStreamResponse(events: Array<{ event: string; data: unknown }>): Response {
  const payload = events.map((ev) => `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`).join('')
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

function BridgeHarness({
  initialMode = 'eulen-modus',
  isAuthenticated = true,
  lng = 'de',
  dark = false,
  children,
}: {
  readonly initialMode?: CopilotMode
  readonly isAuthenticated?: boolean
  readonly lng?: 'de' | 'en'
  readonly dark?: boolean
  readonly children?: React.ReactNode
}) {
  const [mode, setMode] = useState<CopilotMode>(initialMode)
  const i18n = createAppI18n(lng)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode={dark ? 'dark' : 'light'}>
          <CopilotBridgeProvider
            mode={mode}
            onModeChange={setMode}
            taxYear={2025}
            isAuthenticated={isAuthenticated}
          >
            {children}
          </CopilotBridgeProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function CockpitAndOwlFlow() {
  const bridge = useCopilotBridge()
  return bridge.mode === 'cockpit' ? (
    <CockpitScreen
      taxYear={2025}
      onOpenOwlMode={() => bridge.setMode('eulen-modus')}
    />
  ) : (
    <OwlModeScreen taxYear={2025} onDone={() => bridge.setMode('cockpit')} />
  )
}

function BridgeProbe() {
  const bridge = useCopilotBridge()
  return (
    <div>
      <span data-testid="probe-mode">{bridge.mode}</span>
      <span data-testid="probe-inside">{String(bridge.insideOwlWorkspace)}</span>
      <span data-testid="probe-steps">{bridge.streamSteps.join('|')}</span>
      <span data-testid="probe-tokens">{bridge.streamedText}</span>
      <span data-testid="probe-prov">{bridge.bestTileProvenance(['interview', 'commute']) ?? 'none'}</span>
      <span data-testid="probe-banner">{bridge.cockpitBanner ? String(bridge.cockpitBanner.appliedCount) : 'none'}</span>
      <button onClick={() => void bridge.sendStreamingMessage('Homeoffice prüfen', 'interview')}>send-stream</button>
      <button onClick={() => void bridge.applyAllPending([PENDING_WORKDAYS_DRAFT])}>apply-batch</button>
      <button onClick={() => void bridge.applyAllPending([PENDING_WORKDAYS_DRAFT], { ignoreBaseline: true })}>force-apply</button>
      <button onClick={() => void bridge.undoSingleAction('act-ho-1')}>undo-single</button>
      <button
        onClick={() =>
          void bridge.parseReceipt({
            fileName: 'rechnung-laptop.pdf',
            rawText: 'Monitor 349 EUR beruflich',
            stageDraft: true,
          })
        }
      >
        parse-receipt
      </button>
      <button onClick={() => bridge.dismissCockpitBanner()}>dismiss-banner</button>
      <button onClick={() => bridge.setMode('eulen-modus')}>open-owl</button>
    </div>
  )
}

describe('Slice 4: CopilotBridgeProvider & 3-Breakpoint OwlMode Workspace', () => {
  it('throws outside provider on useCopilotBridge and returns null on useOptionalCopilotBridge', () => {
    function OutsideReader() {
      const opt = useOptionalCopilotBridge()
      return <span data-testid="opt-val">{String(opt)}</span>
    }
    render(<OutsideReader />)
    expect(screen.getByTestId('opt-val').textContent).toBe('null')

    function StrictReader() {
      useCopilotBridge()
      return null
    }
    expect(() => render(<StrictReader />)).toThrow(/CopilotBridgeProvider/)
  })

  it('streams SSE events (status, tool, token, done), applies batch with expectedPreviousValue, updates Cockpit banner & provenance, and handles undo', async () => {
    setViewportWidth(1280)
    const appliedPayloads: unknown[] = []
    server.use(
      http.get('*/v1/eulen-modus/einstellung', () => HttpResponse.json({ enabled: true, enabledAt: null })),
      http.get('*/v1/steuerjahre/2025/eulen-karten', () =>
        HttpResponse.json({ enabled: true, cards: [], legalStatus: '01.01.2025' }),
      ),
      http.get('*/v1/steuerjahre/2025/cockpit', () =>
        HttpResponse.json({ taxYear: 2025, status: { kind: 'bestimmt', value: 62000 }, openItems: 0 }),
      ),
      http.get('*/v1/steuerjahre/2025/steuerschaetzung', () =>
        HttpResponse.json({ kind: 'spanne', result: { from: 450, to: 520 }, churchTaxOpen: false }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        makeSseStreamResponse([
          { event: 'status', data: { text: 'Prüfe Akte' } },
          { event: 'tool', data: { name: 'calc', label: 'Werbungskosten gerechnet' } },
          { event: 'token', data: { text: '60 Homeoffice-Tage ' } },
          { event: 'token', data: { text: 'ergeben +125 €.' } },
          { event: 'action', data: PENDING_WORKDAYS_DRAFT },
          {
            event: 'done',
            data: {
              userMessage: { id: 'm1', role: 'user', content: 'Homeoffice prüfen', meta: null, createdAt: '2026-01-01T00:00:00Z' },
              assistantMessage: {
                id: 'm2',
                role: 'assistant',
                content: '60 Homeoffice-Tage ergeben +125 €.',
                meta: { action: PENDING_WORKDAYS_DRAFT },
                createdAt: '2026-01-01T00:00:00Z',
              },
            },
          },
        ]),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/actions/apply-batch', async ({ request }) => {
        appliedPayloads.push(await request.json())
        return HttpResponse.json({
          actions: [{ ...PENDING_WORKDAYS_DRAFT, status: 'applied' }],
          messages: [],
        })
      }),
      http.post('*/v1/steuerjahre/2025/advisor/actions/act-ho-1/undo', () =>
        HttpResponse.json({
          action: { ...PENDING_WORKDAYS_DRAFT, status: 'undone' },
          message: { id: 'm2', role: 'assistant', content: 'Undone', meta: null, createdAt: '2026-01-01T00:00:00Z' },
        }),
      ),
    )

    render(
      <BridgeHarness initialMode="cockpit">
        <BridgeProbe />
        <CockpitAndOwlFlow />
      </BridgeHarness>,
    )

    // Initially in Cockpit: calm, no banner, no provenance, no chat sidebar
    expect(await screen.findByText('Erfasstes Einkommen')).toBeTruthy()
    expect(screen.queryByTestId('cockpit-eule-banner')).toBeNull()
    expect(screen.queryByTestId('advisor-chat-panel')).toBeNull()

    fireEvent.click(screen.getByText('open-owl'))
    await screen.findByTestId('eulen-modus-screen')
    expect(screen.getByTestId('probe-inside').textContent).toBe('true')

    fireEvent.click(screen.getByText('send-stream'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-steps').textContent).toContain('Prüfe Akte')
      expect(screen.getByTestId('probe-steps').textContent).toContain('Werbungskosten gerechnet')
      expect(screen.getByTestId('probe-tokens').textContent).toContain('ergeben +125 €')
    })

    fireEvent.click(screen.getByText('apply-batch'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-mode').textContent).toBe('cockpit')
      expect(screen.getByTestId('probe-prov').textContent).toBe('eule')
      expect(screen.getByTestId('probe-banner').textContent).toBe('1')
    })
    expect(appliedPayloads).toEqual([{ drafts: [{ actionId: 'act-ho-1', expectedPreviousValue: '0' }] }])

    // Confirmed banner + provenance chip shown cleanly in Cockpit, then dismissible
    const banner = await screen.findByTestId('cockpit-eule-banner')
    expect(banner.textContent).toContain('125')
    expect(screen.getByTestId('cockpit-provenance-chip')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cockpit-eule-banner-dismiss'))
    expect(screen.queryByTestId('cockpit-eule-banner')).toBeNull()

    fireEvent.click(screen.getByText('undo-single'))
  })

  it('keeps Eulen-Modus open on HTTP 409 stale conflict and supports force-override without stale baseline', async () => {
    const payloads: unknown[] = []
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/actions/apply-batch', async ({ request }) => {
        const body = (await request.json()) as { drafts: Array<{ expectedPreviousValue?: string | null }> }
        payloads.push(body)
        if (body.drafts[0]?.expectedPreviousValue !== undefined) {
          return HttpResponse.json(
            { code: 'ADVISOR_ACTION_STALE_CONFLICT', message: 'Das Feld wurde zwischenzeitlich manuell geändert.' },
            { status: 409 },
          )
        }
        return HttpResponse.json({
          actions: [{ ...PENDING_WORKDAYS_DRAFT, status: 'applied' }],
          messages: [],
        })
      }),
    )

    render(
      <BridgeHarness initialMode="eulen-modus">
        <BridgeProbe />
      </BridgeHarness>,
    )

    fireEvent.click(screen.getByText('apply-batch'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-mode').textContent).toBe('eulen-modus')
    })

    fireEvent.click(screen.getByText('force-apply'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-mode').textContent).toBe('cockpit')
    })
    expect(payloads[1]).toEqual({ drafts: [{ actionId: 'act-ho-1' }] })
  })

  it('upgrades provenance from eule to beleg+eule when receipt-staged draft is applied', async () => {
    const receiptDraft: AdvisorActionProposal = {
      ...PENDING_WORKDAYS_DRAFT,
      actionId: 'act-receipt-1',
      screen: 'interview',
      field: 'fortbildung',
    }
    server.use(
      http.post('*/v1/belege/parse', () =>
        HttpResponse.json({
          mode: 'vision_ocr',
          securityBlocked: false,
          parsed: {
            vendorCategory: 'arbeitsmittel',
            receiptDate: '2025-05-12',
            amountEur: 349,
            suggestedScreen: 'interview',
            suggestedField: 'fortbildung',
            suggestedValue: 'Ja',
            summary: 'Monitor 349 € für Homeoffice erkannt.',
            taxYear: 2025,
          },
          stagedAction: receiptDraft,
          assistantMessage: null,
        }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/actions/apply-batch', () =>
        HttpResponse.json({ actions: [{ ...receiptDraft, status: 'applied' }], messages: [] }),
      ),
    )

    function ReceiptProbe() {
      const bridge = useCopilotBridge()
      return (
        <div>
          <span data-testid="rec-prov">{bridge.bestTileProvenance(['interview']) ?? 'none'}</span>
          <button
            onClick={() =>
              void bridge.parseReceipt({
                fileName: 'monitor.jpg',
                rawText: 'Monitor 349',
                stageDraft: true,
              })
            }
          >
            run-parse
          </button>
          <button onClick={() => void bridge.applyAllPending([receiptDraft])}>apply-receipt-draft</button>
        </div>
      )
    }

    render(
      <BridgeHarness initialMode="eulen-modus">
        <ReceiptProbe />
      </BridgeHarness>,
    )

    fireEvent.click(screen.getByText('run-parse'))
    await waitFor(() => expect(screen.getByTestId('rec-prov').textContent).toBe('none'))

    fireEvent.click(screen.getByText('apply-receipt-draft'))
    await waitFor(() => expect(screen.getByTestId('rec-prov').textContent).toBe('beleg+eule'))
  })

  it('blocks all protected LLM & receipt parse requests for guests and shows Konto-Wand gate inside eulen-modus-screen', async () => {
    const streamSpy = vi.fn()
    const parseSpy = vi.fn()
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => {
        streamSpy()
        return HttpResponse.json({}, { status: 401 })
      }),
      http.post('*/v1/belege/parse', () => {
        parseSpy()
        return HttpResponse.json({}, { status: 401 })
      }),
    )

    const onRegister = vi.fn()
    const onLogin = vi.fn()
    const onDone = vi.fn()
    render(
      <BridgeHarness initialMode="eulen-modus" isAuthenticated={false}>
        <BridgeProbe />
        <OwlModeScreen taxYear={2025} isGuest onRegister={onRegister} onLogin={onLogin} onDone={onDone} />
      </BridgeHarness>,
    )

    expect(screen.getByTestId('eulen-modus-screen')).toBeTruthy()
    expect(screen.getByTestId('eule-guest-konto-wand')).toBeTruthy()
    fireEvent.click(screen.getByText('send-stream'))
    fireEvent.click(screen.getByText('parse-receipt'))
    await new Promise((r) => setTimeout(r, 30))

    expect(streamSpy).not.toHaveBeenCalled()
    expect(parseSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('eule-guest-register-btn'))
    fireEvent.click(screen.getByTestId('eule-guest-login-btn'))
    fireEvent.click(screen.getByTestId('eule-guest-back-btn'))
    expect(onRegister).toHaveBeenCalledTimes(1)
    expect(onLogin).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('renders 3 responsive breakpoints: Desktop (1280px split 62/38 + collapse), Tablet (820px + drawer), Mobile (390px 80/20 dock + maximize)', async () => {
    const session = {
      enabled: true,
      greeting: 'Hallo!',
      openCards: [],
      messages: [
        {
          id: 'm-draft',
          role: 'assistant',
          content: 'Entwurf bereit nach [estg-4-5-6c].',
          meta: { action: PENDING_WORKDAYS_DRAFT },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      quickChips: ['Endprüfung'],
      legalSources: [],
    }
    server.use(
      http.get('*/v1/eulen-modus/einstellung', () => HttpResponse.json({ enabled: true, enabledAt: null })),
      http.get('*/v1/steuerjahre/2025/eulen-karten', () =>
        HttpResponse.json({ enabled: true, cards: [], legalStatus: '01.01.2025' }),
      ),
      http.get('*/v1/steuerjahre/2025/advisor/session', () => HttpResponse.json(session)),
    )

    // 1. Desktop (l = 1280px)
    setViewportWidth(1280)
    const { unmount } = render(
      <BridgeHarness initialMode="eulen-modus">
        <OwlModeScreen taxYear={2025} />
      </BridgeHarness>,
    )

    await screen.findByTestId('eule-desktop-split')
    expect(screen.getByTestId('eule-desktop-workbench')).toBeTruthy()
    expect(screen.getByTestId('eule-desktop-chat-pane')).toBeTruthy()
    expect(screen.getByTestId('eule-draft-stage')).toBeTruthy()

    fireEvent.click(screen.getByTestId('eule-desktop-chat-toggle'))
    expect(screen.queryByTestId('eule-desktop-chat-pane')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-desktop-chat-toggle'))
    expect(screen.getByTestId('eule-desktop-chat-pane')).toBeTruthy()
    unmount()

    // 2. Tablet (m = 820px)
    setViewportWidth(820)
    const tablet = render(
      <BridgeHarness initialMode="eulen-modus">
        <OwlModeScreen taxYear={2025} />
      </BridgeHarness>,
    )
    await screen.findByTestId('eule-tablet-workspace')
    expect(screen.queryByTestId('eule-tablet-drawer')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-tablet-chat-toggle'))
    expect(await screen.findByTestId('eule-tablet-drawer')).toBeTruthy()
    fireEvent.click(screen.getByTestId('eule-tablet-drawer-close'))
    expect(screen.queryByTestId('eule-tablet-drawer')).toBeNull()
    tablet.unmount()

    // 3. Mobile (s = 390px) — 80/20 bottom dock, NEVER auto-maximized!
    setViewportWidth(390)
    render(
      <BridgeHarness initialMode="eulen-modus">
        <OwlModeScreen taxYear={2025} />
      </BridgeHarness>,
    )
    await screen.findByTestId('eule-mobile-dock')
    expect(screen.queryByTestId('eule-mobile-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-mobile-maximize-btn'))
    expect(await screen.findByTestId('eule-mobile-sheet')).toBeTruthy()
    fireEvent.click(screen.getByTestId('eule-mobile-minimize-btn'))
    expect(screen.queryByTestId('eule-mobile-sheet')).toBeNull()
    expect(screen.getByTestId('eule-mobile-dock')).toBeTruthy()
  })

  it('opens inline Maske ansehen inside left workbench, suppresses InMaskAdvisorCompanion (#443/#446), and shows honest Pauschbetrag & conflict UI', async () => {
    setViewportWidth(1280)
    const lstbDraft: AdvisorActionProposal = {
      ...PENDING_WORKDAYS_DRAFT,
      actionId: 'act-lstb-1',
      screen: 'lstb',
      field: 'bruttoarbeitslohn',
      label: 'Bruttoarbeitslohn prüfen',
    }
    const supersededDraft: AdvisorActionProposal = {
      ...PENDING_WORKDAYS_DRAFT,
      actionId: 'act-sup-1',
      status: 'superseded',
      label: 'Alter Entwurf',
    }
    const messages: AdvisorChatMessageView[] = [
      {
        id: 'm-lstb',
        role: 'assistant',
        content: 'Prüfen wir die LStB nach [estg-9-1].',
        meta: { action: lstbDraft },
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'm-zero',
        role: 'assistant',
        content: 'Hinweis zum Pauschbetrag [estg-9-1].',
        meta: { action: PAUSCHBETRAG_ZERO_DELTA_DRAFT },
        createdAt: '2026-01-01T00:00:01Z',
      },
      {
        id: 'm-sup',
        role: 'assistant',
        content: 'Ersetzter Entwurf.',
        meta: { action: supersededDraft },
        createdAt: '2026-01-01T00:00:02Z',
      },
    ]

    render(
      <BridgeHarness initialMode="eulen-modus" dark lng="en">
        <OwlModeScreen taxYear={2025} initialCards={[]} initialMessages={messages} />
      </BridgeHarness>,
    )

    // Honest Pauschbetrag badge when deltaEur === 0 & superseded badge
    expect(await screen.findByTestId('advisor-action-pauschbetrag-badge')).toBeTruthy()
    expect(screen.getByTestId('advisor-action-superseded-badge')).toBeTruthy()

    // Click "Maske ansehen ->" on the LStB draft -> inline LstbScreen inside left workbench!
    fireEvent.click(screen.getByTestId('draft-inspect-act-lstb-1'))
    expect(await screen.findByTestId('eule-inline-mask-view')).toBeTruthy()
    expect(screen.getByTestId('eule-inline-mask-focus-banner')).toBeTruthy()
    // #443/#446 AC 5: InMaskAdvisorCompanion MUST return null inside Eulen-Modus!
    expect(screen.queryByTestId('in-mask-advisor-trigger')).toBeNull()

    fireEvent.click(screen.getByTestId('eule-back-to-stage-btn'))
    expect(screen.queryByTestId('eule-inline-mask-view')).toBeNull()

    // Outside Eulen-Modus (in Cockpit/standalone LstbScreen), InMaskAdvisorCompanion remains active
    render(
      <BridgeHarness initialMode="cockpit">
        <LstbScreen taxYear={2025} />
      </BridgeHarness>,
    )
    expect(await screen.findByTestId('in-mask-advisor-trigger')).toBeTruthy()
  })

  it('supports AdvisorChatPanel receipt upload button and live stream fallback JSON response', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const onAttach = vi.fn().mockResolvedValue(undefined)
    render(
      <BridgeHarness initialMode="eulen-modus">
        <AdvisorChatPanel
          messages={[]}
          streamSteps={['Schritt 1']}
          streamedText="Live Antwort..."
          isSending
          chatError="Kurze Unterbrechung"
          onSendMessage={onSend}
          onAttachReceipt={onAttach}
        />
      </BridgeHarness>,
    )

    expect(screen.getByTestId('advisor-thinking')).toBeTruthy()
    expect(screen.getByTestId('advisor-stream-step').textContent).toContain('Schritt 1')
    expect(screen.getByTestId('advisor-stream-token-preview').textContent).toContain('Live Antwort...')
    expect(screen.getByTestId('advisor-chat-error').textContent).toContain('Kurze Unterbrechung')

    fireEvent.click(screen.getByTestId('advisor-receipt-attach-btn'))
    expect(screen.getByTestId('advisor-receipt-panel')).toBeTruthy()
    fireEvent.change(screen.getByTestId('advisor-receipt-filename'), { target: { value: 'fachbuch.pdf' } })
    fireEvent.change(screen.getByTestId('advisor-receipt-rawtext'), { target: { value: 'Fachbuch 89 EUR' } })
    fireEvent.click(screen.getByTestId('advisor-receipt-submit-btn'))
    await waitFor(() =>
      expect(onAttach).toHaveBeenCalledWith({ fileName: 'fachbuch.pdf', rawText: 'Fachbuch 89 EUR' }),
    )

    // Cancel receipt panel + verify send button is disabled while isSending=true, then sends when isSending=false
    fireEvent.click(screen.getByTestId('advisor-receipt-attach-btn'))
    expect(screen.getByTestId('advisor-receipt-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('advisor-receipt-cancel-btn'))
    expect(screen.queryByTestId('advisor-receipt-panel')).toBeNull()

    const panelView = render(
      <BridgeHarness initialMode="eulen-modus">
        <AdvisorChatPanel messages={[]} isSending={false} onSendMessage={onSend} onAttachReceipt={onAttach} />
      </BridgeHarness>,
    )
    const inputs = screen.getAllByTestId('advisor-chat-input')
    const sends = screen.getAllByTestId('advisor-chat-send')
    fireEvent.change(inputs[inputs.length - 1]!, { target: { value: 'Laptop absetzen?' } })
    fireEvent.click(sends[sends.length - 1]!)
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Laptop absetzen?'))
    panelView.unmount()
  })

  it('handles SSE error responses, JSON fallback, single apply/undo errors, and parseReceipt failures cleanly', async () => {
    const modeChanges: CopilotMode[] = []
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        HttpResponse.json({ message: 'KI-Limit erreicht' }, { status: 429 }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/actions/apply-batch', () =>
        HttpResponse.json({ message: 'Validierung fehlgeschlagen' }, { status: 422 }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/actions/act-ho-1/apply', () =>
        HttpResponse.json({ message: 'Manuell geändert' }, { status: 409 }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/actions/act-ho-1/undo', () =>
        HttpResponse.json({ message: 'Nicht rückgängig' }, { status: 500 }),
      ),
      http.post('*/v1/belege/parse', () => HttpResponse.json({ message: 'Kaputt' }, { status: 500 })),
    )

    function EdgeProbe() {
      const bridge = useCopilotBridge()
      const [singleResult, setSingleResult] = useState<string>('init')
      const [undoResult, setUndoResult] = useState<string>('init')
      return (
        <div>
          <span data-testid="edge-err">{bridge.chatError ?? 'none'}</span>
          <span data-testid="edge-conflict">{bridge.staleConflict?.message ?? 'none'}</span>
          <span data-testid="edge-single">{singleResult}</span>
          <span data-testid="edge-undo">{undoResult}</span>
          <span data-testid="edge-tokens">{bridge.streamedText}</span>
          <button onClick={() => void bridge.sendStreamingMessage('Test', 'lstb')}>edge-stream</button>
          <button onClick={() => void bridge.applyAllPending([PENDING_WORKDAYS_DRAFT])}>edge-batch</button>
          <button onClick={() => void bridge.applySingleAction('act-ho-1').then((ok) => setSingleResult(String(ok)))}>
            edge-single-apply
          </button>
          <button onClick={() => void bridge.undoSingleAction('act-ho-1').then((ok) => setUndoResult(String(ok)))}>
            edge-single-undo
          </button>
          <button onClick={() => void bridge.parseReceipt({ fileName: 'x.pdf', rawText: 'Text' })}>edge-parse</button>
          <button onClick={() => bridge.clearChatError()}>clear-err</button>
        </div>
      )
    }

    const i18n = createAppI18n('de')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <CopilotBridgeProvider mode="eulen-modus" onModeChange={(m) => modeChanges.push(m)} taxYear={2025}>
              <EdgeProbe />
            </CopilotBridgeProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    // 1. Stream 429 JSON error
    fireEvent.click(screen.getByText('edge-stream'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).toBe('KI-Limit erreicht'))
    fireEvent.click(screen.getByText('clear-err'))
    expect(screen.getByTestId('edge-err').textContent).toBe('none')

    // 2. Application/json response fallback on stream + 200 single apply
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        HttpResponse.json({
          userMessage: { id: 'u-json', role: 'user', content: 'Hi', meta: null, createdAt: '2026-01-01T00:00:00Z' },
          assistantMessage: { id: 'a-json', role: 'assistant', content: 'JSON Antwort', meta: null, createdAt: '2026-01-01T00:00:00Z' },
        }),
      ),
    )
    fireEvent.click(screen.getByText('edge-stream'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).toBe('none'))

    // 3. Batch 422 error
    fireEvent.click(screen.getByText('edge-batch'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).toBe('Validierung fehlgeschlagen'))

    // 4. Single apply 409 conflict & undo 500 false
    fireEvent.click(screen.getByText('edge-single-apply'))
    await waitFor(() => expect(screen.getByTestId('edge-conflict').textContent).toBe('Manuell geändert'))
    await waitFor(() => expect(screen.getByTestId('edge-single').textContent).toBe('false'))

    fireEvent.click(screen.getByText('edge-single-undo'))
    await waitFor(() => expect(screen.getByTestId('edge-undo').textContent).toBe('false'))

    // 5. Parse receipt HTTP 500 & network throws
    fireEvent.click(screen.getByText('edge-parse'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).toContain('HTTP 500'))

    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => HttpResponse.error()),
      http.post('*/v1/steuerjahre/2025/advisor/actions/apply-batch', () => HttpResponse.error()),
      http.post('*/v1/steuerjahre/2025/advisor/actions/act-ho-1/apply', () => HttpResponse.error()),
      http.post('*/v1/steuerjahre/2025/advisor/actions/act-ho-1/undo', () => HttpResponse.error()),
      http.post('*/v1/belege/parse', () => HttpResponse.error()),
    )
    fireEvent.click(screen.getByText('edge-stream'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).not.toBe('none'))
    fireEvent.click(screen.getByText('edge-batch'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).not.toBe('none'))
    fireEvent.click(screen.getByText('edge-single-apply'))
    await waitFor(() => expect(screen.getByTestId('edge-single').textContent).toBe('false'))
    fireEvent.click(screen.getByText('edge-single-undo'))
    await waitFor(() => expect(screen.getByTestId('edge-undo').textContent).toBe('false'))
    fireEvent.click(screen.getByText('edge-parse'))
    await waitFor(() => expect(screen.getByTestId('edge-err').textContent).not.toBe('none'))

    // 6. SSE stream response without body.getReader() fallback
    const origFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: null,
      text: async () => 'event: token\ndata: {"text":"Text-Fallback"}\n\nevent: done\ndata: {"userMessage":null,"assistantMessage":null}\n\n',
    } as Response)
    fireEvent.click(screen.getByText('edge-stream'))
    await waitFor(() => expect(screen.getByTestId('edge-tokens').textContent).toContain('Text-Fallback'))
    vi.restoreAllMocks()
    expect(globalThis.fetch).toBe(origFetch)
  })

  it('supports UI batch apply, 409 conflict banner dismiss & force override, receipt result banner, mobile dock send, and all inline mask screens', async () => {
    setViewportWidth(1280)
    const session = {
      enabled: true,
      greeting: 'Hallo!',
      openCards: [],
      messages: [
        {
          id: 'm-ho',
          role: 'assistant',
          content: 'Homeoffice Entwurf.',
          meta: { action: PENDING_WORKDAYS_DRAFT },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      quickChips: ['Check'],
      legalSources: [],
    }
    let attempt = 0
    server.use(
      http.get('*/v1/eulen-modus/einstellung', () => HttpResponse.json({ enabled: true, enabledAt: null })),
      http.get('*/v1/steuerjahre/2025/eulen-karten', () =>
        HttpResponse.json({ enabled: true, cards: [], legalStatus: '01.01.2025' }),
      ),
      http.get('*/v1/steuerjahre/2025/advisor/session', () => HttpResponse.json(session)),
      http.post('*/v1/belege/parse', () =>
        HttpResponse.json({
          mode: 'vision_ocr',
          securityBlocked: true,
          parsed: {
            vendorCategory: 'arbeitsmittel',
            receiptDate: '2025-05-12',
            amountEur: 199,
            suggestedScreen: 'interview',
            suggestedField: 'fortbildung',
            suggestedValue: 'Ja',
            summary: 'Tastatur 199 € erkannt.',
            taxYear: 2025,
          },
          stagedAction: { ...PENDING_WORKDAYS_DRAFT, actionId: 'act-ho-1' },
          assistantMessage: null,
        }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/actions/apply-batch', async ({ request }) => {
        attempt += 1
        const body = (await request.json()) as { drafts: Array<{ expectedPreviousValue?: string | null }> }
        if (attempt <= 2 && body.drafts[0]?.expectedPreviousValue !== undefined) {
          return HttpResponse.json(
            { code: 'ADVISOR_ACTION_STALE_CONFLICT', message: 'Manuell geaendert' },
            { status: 409 },
          )
        }
        return HttpResponse.json({ actions: [{ ...PENDING_WORKDAYS_DRAFT, status: 'applied' }], messages: [] })
      }),
    )

    render(
      <BridgeHarness initialMode="eulen-modus">
        <CockpitAndOwlFlow />
      </BridgeHarness>,
    )

    await screen.findByTestId('eule-draft-stage')

    // Attach receipt from inside OwlModeScreen chat panel -> shows eule-receipt-result & securityBlocked warning
    fireEvent.click(screen.getByTestId('advisor-receipt-attach-btn'))
    fireEvent.change(screen.getByTestId('advisor-receipt-rawtext'), { target: { value: 'Tastatur 199 EUR' } })
    fireEvent.click(screen.getByTestId('advisor-receipt-submit-btn'))
    expect(await screen.findByTestId('eule-receipt-result')).toBeTruthy()
    expect(screen.getByText(/Sensibler Inhalt geschwärzt/)).toBeTruthy()

    // Click Batch Apply -> hits 409 -> Dismiss -> Click Batch Apply -> hits 409 -> Force Apply -> returns to Cockpit
    fireEvent.click(screen.getByTestId('eule-batch-apply-btn'))
    expect(await screen.findByTestId('eule-stale-conflict-banner')).toBeTruthy()
    fireEvent.click(screen.getByTestId('eule-conflict-dismiss-btn'))
    expect(screen.queryByTestId('eule-stale-conflict-banner')).toBeNull()

    fireEvent.click(screen.getByTestId('eule-batch-apply-btn'))
    expect(await screen.findByTestId('eule-stale-conflict-banner')).toBeTruthy()
    fireEvent.click(screen.getByTestId('eule-force-apply-btn'))
    const banner = await screen.findByTestId('cockpit-eule-banner')
    expect(banner).toBeTruthy()
    expect(screen.getByTestId('cockpit-provenance-chip').textContent).toContain('Beleg + Eule')
  })

  it('exercises mobile dock input/send/receipt buttons and all InlineMaskView screens without crashes', async () => {
    setViewportWidth(390)
    const masksToTest: Array<{ screen: AdvisorActionProposal['screen']; expectedTestId?: string; expectedText?: RegExp }> = [
      { screen: 'commute' },
      { screen: 'chLohnausweis' },
      { screen: 'rente' },
      { screen: 'kapital' },
      { screen: 'vermietung' },
      { screen: 'kind' },
      { screen: 'assessment' },
      { screen: 'interview' },
      { screen: 'stammdaten', expectedTestId: 'eule-manual-only-notice' },
      { screen: 'profil', expectedTestId: 'eule-manual-only-notice' },
    ]
    const messages: AdvisorChatMessageView[] = masksToTest.map((m, i) => ({
      id: `m-${m.screen}-${i}`,
      role: 'assistant',
      content: `Check ${m.screen}`,
      meta: {
        action: {
          ...PENDING_WORKDAYS_DRAFT,
          actionId: `act-${m.screen}`,
          screen: m.screen,
          field: `field_${m.screen}`,
          label: `Maske ${m.screen}`,
        },
      },
      createdAt: '2026-01-01T00:00:00Z',
    }))

    server.use(
      http.get('*/v1/steuerjahre/2025/bescheid', () => HttpResponse.json(null)),
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        makeSseStreamResponse([{ event: 'done', data: { userMessage: null, assistantMessage: null } }]),
      ),
    )

    render(
      <BridgeHarness initialMode="eulen-modus">
        <OwlModeScreen taxYear={2025} initialCards={[]} initialMessages={messages} />
      </BridgeHarness>,
    )

    // Inspect each mask screen inline and return to stage
    for (const m of masksToTest) {
      fireEvent.click(await screen.findByTestId(`draft-inspect-act-${m.screen}`))
      expect(await screen.findByTestId('eule-inline-mask-view')).toBeTruthy()
      if (m.expectedTestId) {
        expect(screen.getByTestId(m.expectedTestId)).toBeTruthy()
      }
      fireEvent.click(screen.getByTestId('eule-back-to-stage-btn'))
      expect(screen.queryByTestId('eule-inline-mask-view')).toBeNull()
    }

    // Mobile dock: receipt button maximizes sheet; minimize returns to dock; dock input + send opens sheet and streams
    fireEvent.click(screen.getByTestId('eule-mobile-dock-receipt-btn'))
    expect(await screen.findByTestId('eule-mobile-sheet')).toBeTruthy()
    fireEvent.click(screen.getByTestId('eule-mobile-minimize-btn'))
    expect(await screen.findByTestId('eule-mobile-dock')).toBeTruthy()

    fireEvent.change(screen.getByTestId('eule-mobile-dock-input'), { target: { value: 'Kurze Frage' } })
    fireEvent.click(screen.getByTestId('eule-mobile-dock-send-btn'))
    expect(await screen.findByTestId('eule-mobile-sheet')).toBeTruthy()
  })
})
