import { useState, type ReactNode } from 'react'
import { render, renderHook, type RenderHookResult, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppI18n } from './i18n/app-i18n'

export interface RenderInAppOptions {
  readonly language?: 'de' | 'en' | undefined
  readonly mode?: 'light' | 'dark' | undefined
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
  readonly client?: QueryClient | undefined
}

export interface TestAppProvidersProps extends RenderInAppOptions {
  readonly client: QueryClient
  readonly children: ReactNode
}

/**
 * The provider stack a screen that loads data runs in: a query client, the language and the theme. For a test
 * harness that renders its own tree; a test renders with `renderWithQuery` or `renderHookWithQuery`.
 */
export function TestAppProviders({ client, language, mode, children }: TestAppProvidersProps) {
  const [i18n] = useState(() => createAppI18n(language ?? 'de'))
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode={mode ?? 'light'}>{children}</ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function testWrapper(client: QueryClient, options: RenderInAppOptions) {
  return function TestWrapper({ children }: { readonly children: ReactNode }) {
    return (
      <TestAppProviders client={client} language={options.language} mode={options.mode}>
        {children}
      </TestAppProviders>
    )
  }
}

/**
 * Renders a screen that loads data: language, theme and a query client of its own. Returns the client next
 * to the render result, for a test that refetches or reads the cache. The providers are the render's
 * wrapper, so `rerender` keeps them.
 */
export function renderWithQuery(node: ReactNode, options: RenderWithQueryOptions = {}): RenderResult & { readonly client: QueryClient } {
  const client = options.client ?? makeTestQueryClient()
  const result = render(node, { wrapper: testWrapper(client, options) })
  return { ...result, client }
}

export interface RenderHookWithQueryOptions<Props> extends RenderWithQueryOptions {
  readonly initialProps?: Props | undefined
}

/** Renders a hook inside the same providers as `renderWithQuery`, and returns the client next to the result. */
export function renderHookWithQuery<Result, Props>(
  hook: (props: Props) => Result,
  options: RenderHookWithQueryOptions<Props> = {},
): RenderHookResult<Result, Props> & { readonly client: QueryClient } {
  const client = options.client ?? makeTestQueryClient()
  const result = renderHook(hook, { wrapper: testWrapper(client, options), initialProps: options.initialProps })
  return { ...result, client }
}
