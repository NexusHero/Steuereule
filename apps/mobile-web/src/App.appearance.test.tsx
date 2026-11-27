import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as RN from 'react-native'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse } from 'msw'
import { server } from '../test/test-msw-server'
import { APPEARANCE_STORAGE_KEY } from './lib/appearance'
import { AppleG } from './icons/AppleG'

describe('App appearance integration', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    localStorage.clear()
    document.body.style.backgroundColor = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('passes mode="dark" to ThemeProvider and syncs body background when system scheme is dark', async () => {
    vi.spyOn(RN, 'useColorScheme').mockReturnValue('dark')
    const { default: App } = await import('../App')
    render(<App />)

    fireEvent.click(screen.getByLabelText('Weiter zur App'))
    await screen.findByText('Einloggen')

    // theme.dark.color.grund === '#0f0f14' -> rgb(15, 15, 20)
    expect(document.body.style.backgroundColor).toBe('rgb(15, 15, 20)')
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull()
  })

  it('renders Profile Darstellung choices, applies immediately across reloads, and writes key', async () => {
    vi.spyOn(RN, 'useColorScheme').mockReturnValue('dark')
    server.use(
      http.get('*/api/auth/get-session', () =>
        HttpResponse.json({
          session: { id: 'sess_1', userId: 'u_1' },
          user: { id: 'u_1', email: 'dark@beispiel.de', emailVerified: true, name: '' },
        }),
      ),
      http.get('*/v1/profile', () =>
        HttpResponse.json({ firstName: 'Lena', lastName: 'Hoffmann', steuerId: null, steuernummer: null }),
      ),
    )

    window.history.pushState({}, '', '/app/profil')
    const { default: App } = await import('../App')
    render(<App />)

    await screen.findByText('Lena Hoffmann')
    expect(document.body.style.backgroundColor).toBe('rgb(15, 15, 20)')

    fireEvent.click(screen.getByTestId('profil-darstellung-hell'))
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light')
    // theme.light.color.grund === '#f4f2e9' -> rgb(255, 255, 255)
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)')
  })

  it('AppleG inherits theme.color.tinte in dark mode and honors explicit color prop', async () => {
    const svgMod = await import('react-native-svg')
    const pathSpy = vi.spyOn(svgMod, 'Path')

    render(
      <ThemeProvider mode="dark">
        <AppleG />
        <AppleG color="#123456" />
      </ThemeProvider>,
    )

    expect(pathSpy).toHaveBeenCalledTimes(2)
    expect(pathSpy.mock.calls[0]?.[0]).toMatchObject({ fill: '#ededf3' })
    expect(pathSpy.mock.calls[0]?.[0]).not.toMatchObject({ fill: '#1d1d1f' })
    expect(pathSpy.mock.calls[1]?.[0]).toMatchObject({ fill: '#123456' })
  })
})
