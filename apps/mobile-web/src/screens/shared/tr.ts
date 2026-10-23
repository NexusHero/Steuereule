// The app's real `t` function type (with interpolation support), shared by every sub-component
// that takes `tr` as a prop — so a component that needs `tr(key, { … })` (e.g. the QR countdown's
// `{{time}}`, the verify banner's `{{email}}`) does not hand-roll its own narrower signature.
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../i18n/resources'

export type Tr = ReturnType<typeof useTranslation<typeof APP_NS>>['t']
