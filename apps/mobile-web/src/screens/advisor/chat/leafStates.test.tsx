// The quieter states of the small parts of the chat: a full context, an English reader, a search that
// finds the title, a drawer that is closed with the keyboard.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Text } from 'react-native'
import { renderInApp } from '../../../../test/test-render'
import { ContextRing } from './ContextRing'
import { ConversationSearch } from './ConversationSearch'
import { OwlDrawer } from './OwlDrawer'
import { ThoughtBlock } from './ThoughtBlock'

describe('the context ring when it is full', () => {
  it('says the conversation is full, and only shows without a way to summarise', () => {
    renderInApp(<ContextRing context={{ percent: 100, level: 'full', canSummarize: true }} />)
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    expect(screen.getByTestId('advisor-context-percent').textContent).toContain('100 %')
    expect(screen.queryByTestId('advisor-context-summarize')).toBeNull()
  })

  it('says so when the summary could not be made and keeps the popover open', async () => {
    const onSummarize = vi.fn().mockRejectedValue(new Error('down'))
    renderInApp(<ContextRing context={{ percent: 95, level: 'warn', canSummarize: true }} onSummarize={onSummarize} />)
    fireEvent.click(screen.getByTestId('advisor-context-ring'))
    fireEvent.click(screen.getByTestId('advisor-context-summarize'))
    expect(await screen.findByTestId('advisor-context-failed')).toBeDefined()
    expect(screen.getByTestId('advisor-context-popover')).toBeDefined()
  })
})

describe('the search over conversations, in English and with every kind of hit', () => {
  it('labels a hit in the user\'s words, in the owl\'s words and in a title, and dates an untitled conversation', async () => {
    const onSearch = vi.fn().mockResolvedValue([
      { conversationId: 'c1', conversationTitle: 'Fortbildung', messageId: 'm1', role: 'user', snippet: 'Kurs', at: '2026-03-05T10:00:00.000Z' },
      { conversationId: 'c2', conversationTitle: null, messageId: 'm2', role: 'assistant', snippet: 'Antwort', at: '2026-03-06T10:00:00.000Z' },
      { conversationId: 'c3', conversationTitle: 'Titel', snippet: 'Titel', at: '2026-03-07T10:00:00.000Z' },
    ])
    renderInApp(<ConversationSearch onSearch={onSearch} onOpen={vi.fn()} canSwitch />, { language: 'en' })
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'Kurs' } })
    const hits = await screen.findAllByTestId('eule-conversation-search-hit')
    expect(hits).toHaveLength(3)
    expect(hits[1]!.textContent).toMatch(/06\/03\/2026|2026/)
    expect(new Set(hits.map((hit) => hit.textContent)).size).toBe(3)
  })

  it('cannot open a hit while the user may not switch conversations', async () => {
    const onOpen = vi.fn()
    renderInApp(
      <ConversationSearch
        onSearch={vi.fn().mockResolvedValue([{ conversationId: 'c1', conversationTitle: 'Fortbildung', snippet: 'x', at: '2026-03-05T10:00:00.000Z' }])}
        onOpen={onOpen}
        canSwitch={false}
      />,
    )
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'Fort' } })
    fireEvent.click(await screen.findByTestId('eule-conversation-search-hit'))
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('the conversation drawer', () => {
  it('closes with Escape, but not while the user is composing text', () => {
    const onClose = vi.fn()
    renderInApp(
      <OwlDrawer onClose={onClose} closeLabel="Gespräche schließen" testID="drawer">
        <Text>Gespräche</Text>
      </OwlDrawer>,
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes from its button and its backdrop, also when no test id was given', () => {
    const onClose = vi.fn()
    renderInApp(
      <OwlDrawer onClose={onClose} closeLabel="Gespräche schließen">
        <Text>Gespräche</Text>
      </OwlDrawer>,
    )
    for (const control of screen.getAllByLabelText('Gespräche schließen')) fireEvent.click(control)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('the line of thought, the last quiet corners', () => {
  it('writes reasoning headings apart from the reasoning text', () => {
    renderInApp(<ThoughtBlock reasoning={'**Erst prüfen**\\n\\nDann rechnen.'} durationMs={2000} />)
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toContain('Dann rechnen.')
  })

  it('forgets the current step when a live answer starts over without steps', async () => {
    const view = renderInApp(<ThoughtBlock live steps={[{ kind: 'status', label: 'Prüfe …' }]} />)
    expect(screen.getByTestId('advisor-thinking-status').textContent).toBe('Prüfe …')
    view.unmount()
    renderInApp(<ThoughtBlock live steps={[]} />)
    await waitFor(() => expect(screen.getByTestId('advisor-thinking-status').textContent).not.toBe(''))
  })
})
