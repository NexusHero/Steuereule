import { render, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { type ReactNode } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
import { createI18n } from './i18n/createI18n'
import { type ThemeMode } from '@steuereule/tokens'
import { type UiLocale } from './i18n/resources'

export interface RenderUiOptions {
  readonly mode?: ThemeMode
  readonly lng?: UiLocale
}

/** Render a component through the theme + i18n providers (RN primitives via RN-Web to jsdom). */
export function renderUi(ui: ReactNode, opts: RenderUiOptions = {}): RenderResult & { i18n: ReturnType<typeof createI18n> } {
  const i18n = createI18n(opts.lng ?? 'de')
  const result = render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode={opts.mode ?? 'light'}>{ui}</ThemeProvider>
    </I18nextProvider>,
  )
  return { ...result, i18n }
}
