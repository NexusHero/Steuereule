// A ready-to-use i18next instance carrying the `ui` namespace in both locales. The gallery and the
// component tests use it directly; a host app can either reuse it or merge uiResources into its own.
import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { uiResources, UI_NS, type UiLocale } from './resources'

export function createI18n(lng: UiLocale = 'de'): I18n {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    lng,
    fallbackLng: 'de',
    ns: [UI_NS],
    defaultNS: UI_NS,
    resources: uiResources,
    interpolation: { escapeValue: false },
  })
  return instance
}
