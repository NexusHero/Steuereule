// Shared social sign-in call (REQ-008). Login and Registrierung both offer the same
// provider buttons, so the better-auth call, its error mapping and the submitting flag
// live here once instead of being copied into each screen — when Apple lands (#45) or the
// callback target changes, there is a single place to change.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import { authErrorKey } from './authErrors'

/** Providers the app can actually sign in with today. Apple (#45) is deliberately absent. */
export type SocialProvider = 'google'

/** Where better-auth sends the browser back to once the provider round trip succeeds. */
const CALLBACK_URL = '/'

export interface SocialSignInResult {
  /** Runs the provider round trip. Resolves to an already-translated error, or null on success. */
  readonly signIn: (provider: SocialProvider) => Promise<string | null>
  readonly isSubmitting: boolean
}

export function useSocialSignIn(): SocialSignInResult {
  const authClient = useAuthClient()
  const { t: tr } = useTranslation(APP_NS)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function signIn(provider: SocialProvider): Promise<string | null> {
    setIsSubmitting(true)
    try {
      const { error } = await authClient.signIn.social({ provider, callbackURL: CALLBACK_URL })
      if (error) return tr(`auth.${authErrorKey(error)}`)
      // On the browser path better-auth navigates away to the provider, so nothing after this
      // runs. Reaching here means no redirect happened and no error was reported.
      return null
    } catch {
      return tr('auth.errGeneric')
    } finally {
      setIsSubmitting(false)
    }
  }

  return { signIn, isSubmitting }
}
