import type { TFunction } from 'i18next'
import type { APP_NS } from '../../i18n/resources'
import type { StromStep } from './stromPlan'

/** What a step is called in the cockpit's „Nächster Schritt“ and the summary; B's masks name B. */
export function stromStepTitle(step: StromStep, tr: TFunction<typeof APP_NS>, partnerName: string): string {
  switch (step.kind) {
    case 'basis':
      return tr('strom.basis.titel')
    case 'partner':
      return tr('strom.partnerSchritt.kurz')
    case 'maske':
      return step.person === 'B' ? tr(`strom.maskePartner.${step.id}`, { name: partnerName }) : tr(`strom.maske.${step.id}`)
    case 'auswahl':
      return tr('strom.auswahl.kurz')
    case 'thema':
      return tr(`strom.thema.${step.id}`)
    case 'alleinerziehend':
      return tr('strom.alleinerziehend.titel')
    case 'fertig':
      return tr('cockpit.abgabe.titel')
  }
}
