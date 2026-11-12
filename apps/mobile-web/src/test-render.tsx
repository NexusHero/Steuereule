import type { ReactNode } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from './i18n/app-i18n'

/** Renders a component the way the app shows it: with its language and its theme. For tests only. */
export function renderInApp(node: ReactNode, options: { readonly language?: 'de' | 'en'; readonly mode?: 'light' | 'dark' } = {}): RenderResult {
  return render(
    <I18nextProvider i18n={createAppI18n(options.language ?? 'de')}>
      <ThemeProvider mode={options.mode ?? 'light'}>{node}</ThemeProvider>
    </I18nextProvider>,
  )
}
