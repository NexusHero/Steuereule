import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { ConversationSearch, type ConversationSearchProps } from './ConversationSearch'
import { renderInApp } from '../../../test-render'

const HITS = [
  { conversationId: 'c1', conversationTitle: null, messageId: 'm1', role: 'user' as const, snippet: 'Ich arbeite am Küchentisch', at: '2026-01-15T10:00:00.000Z' },
  { conversationId: 'c2', conversationTitle: 'Vermietung Musterweg', snippet: 'Vermietung Musterweg', at: '2026-03-05T10:00:00.000Z' },
]

function renderSearch(props: Partial<ConversationSearchProps> = {}) {
  const handlers = { onSearch: vi.fn().mockResolvedValue(HITS), onOpen: vi.fn() }
  renderInApp(<ConversationSearch canSwitch {...handlers} {...props} />)
  return { ...handlers, ...props }
}

describe('ConversationSearch (#476, chat-first)', () => {
  it('shows the hits with where each one was found', async () => {
    const { onSearch } = renderSearch()
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'küchen' } })
    const hits = await screen.findAllByTestId('eule-conversation-search-hit')
    expect(onSearch).toHaveBeenCalledWith('küchen')
    expect(hits[0]!.textContent).toContain('Ich arbeite am Küchentisch')
    expect(hits[0]!.textContent).toContain('deine Frage')
    expect(hits[1]!.textContent).toContain('Titel')
  })

  it('opens the conversation of a hit', async () => {
    const { onOpen } = renderSearch()
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'küchen' } })
    fireEvent.click((await screen.findAllByTestId('eule-conversation-search-hit'))[0]!)
    expect(onOpen).toHaveBeenCalledWith('c1')
  })

  it('does not search for a single letter', async () => {
    const onSearch = vi.fn().mockResolvedValue([])
    renderSearch({ onSearch })
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'k' } })
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('says so when nothing was found', async () => {
    renderSearch({ onSearch: vi.fn().mockResolvedValue([]) })
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'gewerbe' } })
    expect((await screen.findByTestId('eule-conversation-search-empty')).textContent).toContain('gewerbe')
  })

  it('reports a failed search', async () => {
    renderSearch({ onSearch: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'gewerbe' } })
    expect(await screen.findByTestId('eule-conversation-search-failed')).toBeTruthy()
  })
})
