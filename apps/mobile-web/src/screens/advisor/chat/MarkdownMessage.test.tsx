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

  it('opens a safe link and never a javascript: link', () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true)
    renderMd('[Gesetz](https://www.gesetze-im-internet.de/estg/) und [böse](javascript:alert(1))')
    fireEvent.click(screen.getByText('Gesetz'))
    expect(open).toHaveBeenCalledWith('https://www.gesetze-im-internet.de/estg/')
    open.mockClear()
    fireEvent.click(screen.getByText('böse'))
    expect(open).not.toHaveBeenCalled()
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
