import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import { authErrorKey } from './authErrors'

export type SocialProvider = 'google' | 'apple'

/** Marks the sign-in page a failed provider sign-in returns to; better-auth appends `error=…` (WEB-33). */
export const SOCIAL_ERROR_MARKER = 'sozial'

/**
 * Where the provider sends the browser back (WEB-33). better-auth resolves a relative `callbackURL` against its
 * own host, so `'/'` landed on the API. Both addresses are absolute and on the web app's origin, which is a
 * trusted origin of better-auth. Outside a browser (native) the web origin is unknown and the relative root stays.
 */
export function socialCallbackUrls(returnTo?: string): { callbackURL: string; errorCallbackURL: string } {
  const origin = typeof window !== 'undefined' && typeof window.location?.origin === 'string' ? window.location.origin : ''
  if (origin === '') return { callbackURL: '/', errorCallbackURL: `/login?${SOCIAL_ERROR_MARKER}=1` }
  return {
    callbackURL: returnTo ?? `${origin}/`,
    errorCallbackURL: returnTo ?? `${origin}/login?${SOCIAL_ERROR_MARKER}=1`,
  }
}

export interface SocialSignInResult {
  /** Signs in with the provider; `returnTo` brings a re-authentication back to the page it started on (WEB-50). */
  readonly signIn: (provider: SocialProvider, returnTo?: string) => Promise<string | null>
  readonly isSubmitting: boolean
}

export function useSocialSignIn(): SocialSignInResult {
  const authClient = useAuthClient()
  const { t: tr } = useTranslation(APP_NS)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function signIn(provider: SocialProvider, returnTo?: string): Promise<string | null> {
    setIsSubmitting(true)
    try {
      const { error } = await authClient.signIn.social({ provider, ...socialCallbackUrls(returnTo) })
      if (error) return tr(`auth.${authErrorKey(error)}`)
      return null
    } catch {
      return tr('auth.errGeneric')
    } finally {
      setIsSubmitting(false)
    }
  }

  return { signIn, isSubmitting }
}
