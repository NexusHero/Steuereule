import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import { authErrorKey } from './authErrors'

export type SocialProvider = 'google' | 'apple'

const CALLBACK_URL = '/'

export interface SocialSignInResult {
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
      return null
    } catch {
      return tr('auth.errGeneric')
    } finally {
      setIsSubmitting(false)
    }
  }

  return { signIn, isSubmitting }
}
