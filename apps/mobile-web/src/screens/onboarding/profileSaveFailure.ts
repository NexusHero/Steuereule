import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../i18n/resources'
import { classifyApiFailure, useApiFailureMessage } from '../../net/apiFailure'

/**
 * The German sentence for a failed `PUT /v1/profile` (NR-22): only a 400 that names the Steuer-ID asks the user
 * to check it; a 5xx, a 429 or a lapsed session says what really happened, in the shared wording.
 */
export function useProfileSaveFailureMessage(
  section: 'profil.saveError' | 'onboarding.summary.submitError',
): (error: unknown) => string {
  const { t: tr } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
  return (error) => {
    const failure = classifyApiFailure(error)
    const taxIdRejected = failure.fieldErrors.some((f) => f.field === 'steuerId')
    return failureMessage(error, {
      ...(taxIdRejected ? { validation: tr(`${section}.validation`) } : {}),
      offline: tr(`${section}.network`),
    })
  }
}
