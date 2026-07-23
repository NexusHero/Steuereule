// One i18next instance for the app, merging the design-system `ui` namespace with the `app`
// namespace. German base, English switchable at runtime (ADR-0006).
import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { uiResources, UI_NS } from '@steuereule/ui'
import { appResources, APP_NS, type AppLocale } from './resources'

export function createAppI18n(lng: AppLocale = 'de'): I18n {
  const instance = i18next.createInstance()
  const resources = {
    de: { ...uiResources.de, ...appResources.de },
    en: { ...uiResources.en, ...appResources.en },
  }
  void instance.use(initReactI18next).init({
    lng,
    fallbackLng: 'de',
    ns: [APP_NS, UI_NS],
    defaultNS: APP_NS,
    resources,
    interpolation: { escapeValue: false },
  })
  return instance
}
