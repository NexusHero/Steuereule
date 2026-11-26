import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Linking } from 'react-native'
import { ThemeProvider } from '@steuereule/ui'
import { MarkdownMessage } from './MarkdownMessage'

function renderMd(content: string, onSelectSource = vi.fn()) {
  render(
    <ThemeProvider mode="light">
      <MarkdownMessage content={content} onSelectSource={onSelectSource} testID="md" />
    </ThemeProvider>,
  )
  return { onSelectSource, root: screen.getByTestId('md') }
}

describe('MarkdownMessage (#451 slice 1b)', () => {
  it('renders bold, italics, inline code and lists instead of raw Markdown', () => {
    const { root } = renderMd('**Wichtig:** _bitte_ `Anlage N`\n\n- Fahrtkosten\n- Arbeitsmittel')
    expect(root.textContent).toContain('Wichtig:')
    expect(root.textContent).not.toContain('**')
    expect(root.textContent).not.toContain('`')
    expect(root.textContent).toContain('Fahrtkosten')
    expect(root.textContent).toContain('Arbeitsmittel')
  })

  it('renders headings and tables', () => {
    const { root } = renderMd('## Übersicht\n\n| Posten | Betrag |\n| --- | --- |\n| Spenden | 300 € |')
    expect(root.textContent).toContain('Übersicht')
    expect(root.textContent).not.toContain('##')
    expect(root.textContent).toContain('Spenden')
    expect(root.textContent).not.toContain('| ---')
  })

  it('keeps citations as clickable law chips', () => {
    const { onSelectSource } = renderMd('Das regelt [estg-9-1].')
    fireEvent.click(screen.getByTestId('law-chip-estg-9-1'))
    expect(onSelectSource).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'estg-9-1' }))
  })

  it('opens an official source on tap and never a javascript: link', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    renderMd('[Gesetz](https://www.gesetze-im-internet.de/estg/) und [böse](javascript:alert(1))')
    fireEvent.click(screen.getByText('Gesetz'))
    expect(open).toHaveBeenCalledWith('https://www.gesetze-im-internet.de/estg/')
    open.mockClear()
    fireEvent.click(screen.getByText('böse'))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByTestId('md-link-confirm')).toBeNull()
    open.mockRestore()
  })

  it('shows the host of any other link and opens it only after the user confirms', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    renderMd('[Hier](https://sammler.example/pfad?a=1)')
    fireEvent.click(screen.getByText('Hier'))
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByTestId('md-link-host').textContent).toBe('sammler.example')
    fireEvent.click(screen.getByTestId('md-link-open'))
    expect(open).toHaveBeenCalledWith('https://sammler.example/pfad?a=1')
    expect(screen.queryByTestId('md-link-confirm')).toBeNull()
    open.mockRestore()
  })

  it('opens nothing when the user cancels', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    renderMd('[Hier](https://sammler.example/)')
    fireEvent.click(screen.getByText('Hier'))
    fireEvent.click(screen.getByTestId('md-link-cancel'))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByTestId('md-link-confirm')).toBeNull()
    open.mockRestore()
  })

  it('renders a link with a long query as text that does nothing', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    renderMd(`[Daten](https://sammler.example/?d=${'x'.repeat(300)})`)
    fireEvent.click(screen.getByText('Daten'))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByTestId('md-link-confirm')).toBeNull()
    open.mockRestore()
  })

  it('never loads a remote image, it shows the alt text', () => {
    const { root } = renderMd('![Tracking-Pixel](https://tracker.example/p.png)')
    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent).toContain('[Tracking-Pixel]')
  })

  it('renders half-streamed Markdown without breaking', () => {
    const { root } = renderMd('**Du kannst bis zu')
    expect(root.textContent).toContain('Du kannst bis zu')
  })
})
