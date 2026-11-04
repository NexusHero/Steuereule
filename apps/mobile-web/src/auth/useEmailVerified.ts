import { useAccountSession } from './useAccountSession'

export function useEmailVerified(email: string | undefined): boolean {
  const { state } = useAccountSession()
  if (!email || state.status !== 'signed-in') return false
  return state.session.user.emailVerified === true && state.session.user.email === email
}
