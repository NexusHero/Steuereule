import type { ReactNode } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppI18n } from './i18n/app-i18n'

export interface RenderInAppOptions {
  readonly language?: 'de' | 'en'
  readonly mode?: 'light' | 'dark'
}

/** Renders a component the way the app shows it: with its language and its theme. For tests only. */
export function renderInApp(node: ReactNode, options: RenderInAppOptions = {}): RenderResult {
  return render(
    <I18nextProvider i18n={createAppI18n(options.language ?? 'de')}>
      <ThemeProvider mode={options.mode ?? 'light'}>{node}</ThemeProvider>
    </I18nextProvider>,
  )
}

/**
 * A query client for one test: a failed request fails at once instead of being retried, so a test of a
 * failure state sees it after the first answer.
 */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

export interface RenderWithQueryOptions extends RenderInAppOptions {
  /** The client to render with, when the test seeds or shares one; a fresh test client otherwise. */
  readonly client?: QueryClient
}

/**
 * Renders a screen that loads data: language, theme and a query client of its own. Returns the client next
 * to the render result, for a test that refetches or reads the cache. The providers are the render's
 * wrapper, so `rerender` keeps them.
 */
export function renderWithQuery(node: ReactNode, options: RenderWithQueryOptions = {}): RenderResult & { readonly client: QueryClient } {
  const client = options.client ?? makeTestQueryClient()
  const i18n = createAppI18n(options.language ?? 'de')
  const result = render(node, {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode={options.mode ?? 'light'}>{children}</ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    ),
  })
  return { ...result, client }
}
