import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import type { APP_NS } from '../../i18n/resources'
import { stromStepTitle } from './stromTitles'
import type { StromStep } from './stromPlan'

// Echoes the key and the name it was given, so the test pins which text each step asks for.
const tr = ((key: string, opts?: { name?: string }) => (opts?.name ? `${key}|${opts.name}` : key)) as unknown as TFunction<typeof APP_NS>

describe('stromStepTitle', () => {
  it.each<[StromStep, string]>([
    [{ kind: 'basis' }, 'strom.basis.titel'],
    [{ kind: 'partner' }, 'strom.partnerSchritt.kurz'],
    [{ kind: 'maske', id: 'lstb' }, 'strom.maske.lstb'],
    [{ kind: 'auswahl' }, 'strom.auswahl.kurz'],
    [{ kind: 'alleinerziehend' }, 'strom.alleinerziehend.titel'],
    [{ kind: 'fertig' }, 'cockpit.abgabe.titel'],
  ])('names %j', (step, key) => {
    expect(stromStepTitle(step, tr, 'Sam')).toBe(key)
  })

  it('names Person B’s masks with the partner’s name', () => {
    expect(stromStepTitle({ kind: 'maske', id: 'lstb', person: 'B' }, tr, 'Sam')).toBe('strom.maskePartner.lstb|Sam')
  })

  it('names a topic by its id', () => {
    expect(stromStepTitle({ kind: 'thema', id: 'spenden' as never }, tr, 'Sam')).toBe('strom.thema.spenden')
  })
})
