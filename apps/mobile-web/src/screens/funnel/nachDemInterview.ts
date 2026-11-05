import type { AccountSessionState } from '../../auth/useAccountSession'
import type { FunnelPfad } from './KontoWandScreen'

export type AnsichtNachDemInterview = 'konto-wand' | 'rente' | 'ch' | 'lstb'

/** Only a definite sign-out earns the account wall; while the session is still loading nothing is decided yet (null), and a briefly unreachable API must not log a signed-in user out of their path. */
export function ansichtNachDemInterview(pfad: FunnelPfad, sessionStatus: AccountSessionState['status']): AnsichtNachDemInterview | null {
  if (sessionStatus === 'loading') return null
  if (sessionStatus === 'signed-out') return 'konto-wand'
  if (pfad === 'rente') return 'rente'
  if (pfad === 'ch') return 'ch'
  return 'lstb'
}
