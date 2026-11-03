import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('SteuerEule Marketing Website', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8')

  it('renders landing page with correct title and Funke branding', () => {
    expect(html).toContain('<title>SteuerEule — Steuern? Zack, erledigt.</title>')
    expect(html).toContain('Steuer<b>Eule</b>')
    expect(html).toContain('Zack,')
    expect(html).toContain('Voraussichtliche Erstattung')
  })

  it('contains the three-step explanation including purple AI advisor step', () => {
    expect(html).toContain('Drei Schritte. Keine Formulare aus 1998.')
    expect(html).toContain('Reinwerfen')
    expect(html).toContain('Prüfen')
    expect(html).toContain('Übertragen')
    expect(html).toContain('Der Berater schlägt vor und sagt immer, <b>weil</b>')
  })

  it('transparently explains the AI boundary and privacy commitments', () => {
    expect(html).toContain('KI, die sich zu erkennen gibt.')
    expect(html).toContain('Violett = Meinung')
    expect(html).toContain('Immer mit „weil"')
    expect(html).toContain('Herkunft an jeder Zahl')
    expect(html).toContain('Server in Deutschland')
    expect(html).toContain('AES-256')
  })

  it('contains pricing plans and FAQs with honest scope boundaries', () => {
    expect(html).toContain('34,99 €')
    expect(html).toContain('Basis')
    expect(html).toContain('Ersetzt SteuerEule einen Steuerberater?')
    expect(html).toContain('Für wen ist SteuerEule (noch) nichts?')
  })

  it('links to app and legal notices', () => {
    expect(html).toContain('href="/app"')
    expect(html).toContain('href="/legal/agb"')
    expect(html).toContain('href="/legal/datenschutz"')
    expect(html).toContain('href="/legal/impressum"')
  })
})
