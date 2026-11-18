// ADR-0096: the model picker and Max at the input — only what the model can do, each with its
// relative cost and wait, and Max only for the one message it was switched on for.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorModelsDto } from '@steuereule/api-client'
import { createAppI18n } from '../../../i18n/app-i18n'
import { MaxToggle, ModelPicker, activeModel, depthCostText } from './ModelControls'

const MODELS: AdvisorModelsDto = {
  standard: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  models: [
    {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      depths: [
        { depth: 'gruendlich', costFactor: 1, firstWordSeconds: 6, samples: 40 },
        { depth: 'max', costFactor: 3, firstWordSeconds: 15, samples: 8 },
      ],
    },
    { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5', depths: [{ depth: 'gruendlich', costFactor: 2.4, firstWordSeconds: 8, samples: 6 }, { depth: 'max', samples: 0 }] },
    { provider: 'openai', model: 'gpt-4o-mini', label: 'gpt-4o-mini', depths: [{ depth: 'gruendlich', firstWordSeconds: 3, samples: 5 }] },
  ],
}

function wrap(node: React.ReactNode) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">{node}</ThemeProvider>
    </I18nextProvider>,
  )
}

describe('model picker and Max (ADR-0096)', () => {
  it('says the cost relative to the standard, and honestly when nothing is measured', () => {
    const tr = createAppI18n('de').t
    expect(depthCostText({ depth: 'max', costFactor: 3, firstWordSeconds: 15, samples: 8 }, tr, 'de')).toBe('ca. 3× Kosten · erste Worte nach ca. 15 s')
    expect(depthCostText({ depth: 'gruendlich', costFactor: 0.4, firstWordSeconds: 4, samples: 8 }, tr, 'de')).toBe('ca. 0,4× Kosten · erste Worte nach ca. 4 s')
    expect(depthCostText({ depth: 'gruendlich', firstWordSeconds: 3, samples: 5 }, tr, 'de')).toBe('Kosten noch nicht bekannt · erste Worte nach ca. 3 s')
    expect(depthCostText({ depth: 'max', samples: 0 }, tr, 'de')).toBe('Kosten und Wartezeit noch nicht gemessen')
  })

  it('lists every model with its cost and picks one, or the standard as null', () => {
    const onPick = vi.fn()
    wrap(<ModelPicker models={MODELS} picked={null} onPick={onPick} />)
    expect(screen.getByTestId('advisor-model-picker').textContent).toContain('Claude Sonnet 5.5')
    fireEvent.click(screen.getByTestId('advisor-model-picker'))
    expect(screen.getByTestId('advisor-model-option-anthropic:claude-opus-5-5').textContent).toContain('ca. 2,4× Kosten')
    fireEvent.click(screen.getByTestId('advisor-model-option-anthropic:claude-opus-5-5'))
    expect(onPick).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-opus-5-5' })
    fireEvent.click(screen.getByTestId('advisor-model-picker'))
    fireEvent.click(screen.getByTestId('advisor-model-option-anthropic:claude-sonnet-5-5'))
    expect(onPick).toHaveBeenLastCalledWith(null)
  })

  it('offers Max only where the model can think deeper, with its cost once switched on', () => {
    const onChange = vi.fn()
    const { rerender } = wrap(<MaxToggle model={activeModel(MODELS, null)} on={false} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('advisor-depth-max'))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <MaxToggle model={activeModel(MODELS, null)} on onChange={onChange} />
        </ThemeProvider>
      </I18nextProvider>,
    )
    expect(screen.getByTestId('advisor-depth-hint').textContent).toBe('ca. 3× Kosten · erste Worte nach ca. 15 s')
    rerender(
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <MaxToggle model={activeModel(MODELS, { provider: 'openai', model: 'gpt-4o-mini' })} on={false} onChange={onChange} />
        </ThemeProvider>
      </I18nextProvider>,
    )
    expect(screen.queryByTestId('advisor-depth-max')).toBeNull()
  })

  it('answers with the standard when the picked model is no longer offered', () => {
    expect(activeModel(MODELS, { provider: 'google-genai', model: 'gemini-gone' })?.model).toBe('claude-sonnet-5-5')
  })
})
