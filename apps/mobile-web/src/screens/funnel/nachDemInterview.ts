import type { AccountSessionState } from '../../auth/useAccountSession'
import type { FunnelPath } from './KontoWandScreen'

export type ViewAfterInterview = 'konto-wand' | 'rente' | 'ch' | 'lstb'

/** Only a definite sign-out earns the account wall; while the session is still loading nothing is decided yet (null), and a briefly unreachable API must not log a signed-in user out of their path. */
export function viewAfterInterview(path: FunnelPath, sessionStatus: AccountSessionState['status']): ViewAfterInterview | null {
  if (sessionStatus === 'loading') return null
  if (sessionStatus === 'signed-out') return 'konto-wand'
  if (path === 'rente') return 'rente'
  if (path === 'ch') return 'ch'
  return 'lstb'
}
