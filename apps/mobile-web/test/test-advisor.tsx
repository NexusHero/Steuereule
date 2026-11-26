import { useState, type ReactNode } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from '../src/screens/advisor/AdvisorChatPanel'
import { CopilotBridgeProvider, type CopilotMode } from '../src/screens/advisor/CopilotBridgeProvider'
import { makeTestQueryClient, renderInApp, TestAppProviders } from './test-render'

/** The providers a `useCopilotBridge` consumer needs, for tax year 2025 in Eulen-Modus. For tests only. */
export function CopilotBridgeHarness({ children }: { readonly children: ReactNode }) {
  const [mode, setMode] = useState<CopilotMode>('eulen-modus')
  const [queryClient] = useState(makeTestQueryClient)
  return (
    <TestAppProviders client={queryClient}>
      <CopilotBridgeProvider mode={mode} onModeChange={setMode} taxYear={2025}>
        {children}
      </CopilotBridgeProvider>
    </TestAppProviders>
  )
}

/** Renders the chat panel on its own and hands back the spy its messages go out through. For tests only. */
export function renderAdvisorChatPanel(messages: AdvisorChatMessageView[] = [], props: Partial<AdvisorChatPanelProps> = {}) {
  const onSendMessage = vi.fn()
  renderInApp(<AdvisorChatPanel messages={messages} onSendMessage={onSendMessage} {...props} />)
  return { onSendMessage }
}

/** Types a message into the chat input and sends it. For tests only. */
export function sendChatMessage(text: string) {
  fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('advisor-chat-send'))
}
