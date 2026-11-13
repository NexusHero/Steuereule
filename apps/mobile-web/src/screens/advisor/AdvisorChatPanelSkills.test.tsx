import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { AdvisorChatPanel, sendOptionsToDto } from './AdvisorChatPanel'
import { renderInApp } from '../../test-render'

const ROUND = {
  questions: [
    { text: 'Zusammen oder einzeln veranlagen?', options: ['Ja', 'Nein'], kind: 'decision' as const, recommended: 'Ja', reason: 'Spart euch 340 €.' },
    { text: 'Gab es einen Umzug?', options: ['Ja', 'Nein', 'Teils'], kind: 'fact' as const },
  ],
}

const ASKED: AdvisorChatMessageView[] = [
  { id: 'u1', role: 'user', content: 'Fang an', meta: null, createdAt: '2026-11-12T10:00:00Z' },
  { id: 'a1', role: 'assistant', content: 'Erste Runde:', meta: { questionRound: ROUND }, createdAt: '2026-11-12T10:00:01Z' },
]

function renderPanel(messages: AdvisorChatMessageView[] = []) {
  const onSendMessage = vi.fn()
  renderInApp(<AdvisorChatPanel messages={messages} onSendMessage={onSendMessage} />)
  return { onSendMessage }
}

function send(text: string) {
  fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('advisor-chat-send'))
}

describe('skills (#495)', () => {
  it('starts without a skill: a message goes out as before', () => {
    const { onSendMessage } = renderPanel()
    send('Hallo')
    expect(onSendMessage).toHaveBeenCalledWith('Hallo')
  })

  it('lists the skills, turns one on, sends it with every message and turns it off again', () => {
    const { onSendMessage } = renderPanel()
    fireEvent.click(screen.getByTestId('advisor-skills-toggle'))
    expect(screen.getByTestId('advisor-skills-panel').textContent).toContain('Berater-Interview')
    fireEvent.click(screen.getByTestId('advisor-skill-berater-interview'))
    expect(screen.getByTestId('advisor-skills-toggle').textContent).toBe('Berater-Interview')
    send('Fang an')
    expect(onSendMessage).toHaveBeenLastCalledWith('Fang an', { skill: 'berater-interview' })

    fireEvent.click(screen.getByTestId('advisor-skills-toggle'))
    fireEvent.click(screen.getByTestId('advisor-skill-berater-interview'))
    send('Danke')
    expect(onSendMessage).toHaveBeenLastCalledWith('Danke')
  })

  it('puts the skill into the request fields only when set', () => {
    expect(sendOptionsToDto({ skill: 'berater-interview' })).toEqual({ skill: 'berater-interview' })
    expect(sendOptionsToDto(undefined)).toEqual({})
  })
})

describe('/grill-me (#495)', () => {
  it('typed and sent, switches the interview on and starts it', () => {
    const { onSendMessage } = renderPanel()
    send('/grill-me')
    expect(onSendMessage).toHaveBeenCalledWith('Starte das Berater-Interview und frag mich durch meine Erklärung.', { skill: 'berater-interview' })
    expect(screen.getByTestId('advisor-skills-toggle').textContent).toBe('Berater-Interview')
    // The skill stays on for what follows.
    send('Ja')
    expect(onSendMessage).toHaveBeenLastCalledWith('Ja', { skill: 'berater-interview' })
  })

  it('sends what follows the command as the first message', () => {
    const { onSendMessage } = renderPanel()
    send('/grill-me fang bei den Kindern an')
    expect(onSendMessage).toHaveBeenCalledWith('fang bei den Kindern an', { skill: 'berater-interview' })
  })

  it('offers the command while it is being typed, and runs it on a tap', () => {
    const { onSendMessage } = renderPanel()
    fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: '/gr' } })
    expect(screen.getByTestId('advisor-slash-item').textContent).toContain('/grill-me')
    fireEvent.click(screen.getByTestId('advisor-slash-item'))
    expect(onSendMessage).toHaveBeenCalledWith(expect.stringContaining('Berater-Interview'), { skill: 'berater-interview' })
    expect(screen.queryByTestId('advisor-slash-menu')).toBeNull()
  })

  it('carries Turbo along when both are on', () => {
    const { onSendMessage } = renderPanel()
    fireEvent.click(screen.getByTestId('advisor-turbo-toggle'))
    send('/grill-me')
    expect(onSendMessage).toHaveBeenLastCalledWith(expect.any(String), { skill: 'berater-interview', turbo: true })
    send('Ja')
    expect(onSendMessage).toHaveBeenLastCalledWith('Ja', { skill: 'berater-interview', turbo: true })
  })

  it('names an unknown command and sends nothing to the owl', () => {
    const { onSendMessage } = renderPanel()
    send('/zauber')
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(screen.getByTestId('advisor-slash-unknown').textContent).toContain('/grill-me')
  })
})

describe('question round (#495)', () => {
  it('needs every question answered before it can be sent, and sends one line per question', () => {
    const { onSendMessage } = renderPanel(ASKED)
    const options = screen.getAllByTestId('advisor-question-option')
    expect((screen.getByTestId('advisor-question-submit') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(options[0]!) // 1: Ja
    expect((screen.getByTestId('advisor-question-submit') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(options[3]!) // 2: Nein
    fireEvent.click(screen.getByTestId('advisor-question-submit'))
    expect(onSendMessage).toHaveBeenCalledWith('1: Ja\n2: Nein')
  })

  it('marks the owl’s pick and takes all picks at once', () => {
    renderPanel(ASKED)
    expect(screen.getByTestId('advisor-question-round').textContent).toContain('Empfohlen')
    fireEvent.click(screen.getByTestId('advisor-question-take-recommended'))
    // The second question has no pick: it stays open.
    expect((screen.getByTestId('advisor-question-submit') as HTMLButtonElement).disabled).toBe(true)
  })

  it('is history once the conversation has moved on: no buttons to send', () => {
    renderPanel([...ASKED, { id: 'u2', role: 'user', content: '1: Ja\n2: Nein', meta: null, createdAt: '2026-11-12T10:01:00Z' }])
    expect(screen.queryByTestId('advisor-question-submit')).toBeNull()
  })

  it('shows why the owl recommends a decision', () => {
    renderPanel(ASKED)
    expect(screen.getByTestId('advisor-question-reason').textContent).toBe('Spart euch 340 €.')
  })

  it('never recommends an answer to a fact, also on a round stored before facts had a kind', () => {
    const old = { questions: [{ text: 'Hattest du Fortbildungskosten?', options: ['Ja', 'Nein'], recommended: 'Ja' }] }
    renderPanel([ASKED[0]!, { ...ASKED[1]!, meta: { questionRound: old } }])
    expect(screen.getByTestId('advisor-question-round').textContent).not.toContain('Empfohlen')
    expect(screen.queryByTestId('advisor-question-take-recommended')).toBeNull()
  })

  it('lets several answers be ticked and sends them on one line', () => {
    const multi = { questions: [{ text: 'Was davon hattest du?', options: ['Handwerker', 'Putzhilfe', 'Nichts davon'], kind: 'fact' as const, multiple: true }] }
    const { onSendMessage } = renderPanel([ASKED[0]!, { ...ASKED[1]!, meta: { questionRound: multi } }])
    const options = screen.getAllByTestId('advisor-question-option')
    fireEvent.click(options[0]!)
    fireEvent.click(options[1]!)
    fireEvent.click(options[1]!)
    fireEvent.click(options[1]!)
    expect(options[0]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByTestId('advisor-question-submit'))
    expect(onSendMessage).toHaveBeenCalledWith('1: Handwerker, Putzhilfe')
  })
})
