import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../i18n/resources'

/**
 * A Bescheid position's name in the app's language: the core catalogue's ids (`homeofficeA`,
 * `zuVersteuerndesEinkommen`) have their own copy; an id the app does not know keeps the API's label.
 */
export function usePositionLabel(): (position: string, fallback: string) => string {
  const { t: tr } = useTranslation(APP_NS)
  return (position, fallback) => tr(`verlauf.position.${position}`, { defaultValue: fallback })
}
