import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Sheet } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { blurActiveInput } from '../lib/blurActiveInput'
import { LeaveGuardProvider, useLeaveGuardHost } from '../screens/shared/leaveGuard'
import type { CockpitStackParamList } from './routes'

export interface CockpitSheetProps {
  readonly navigation: NativeStackNavigationProp<CockpitStackParamList>
  readonly children: ReactNode
}

export function CockpitSheet({ navigation, children }: CockpitSheetProps) {
  const { t: tr } = useTranslation(APP_NS)
  const host = useLeaveGuardHost()
  const leaving = useRef(false)

  // WEB-40 / NM-05: every way out of the sheet — X, backdrop, Escape, the browser's back, the mask's own
  // „Weiter“ — removes this route; the removal waits for the mask's pending saves and stays once when one failed.
  const { guardedLeave, hasGuards } = host
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current || !hasGuards()) return
        event.preventDefault()
        // A focused field saves on blur; that save must be one of the pending ones.
        blurActiveInput()
        guardedLeave(() => {
          leaving.current = true
          try {
            navigation.dispatch(event.data.action)
          } finally {
            leaving.current = false
          }
        })
      }),
    [navigation, guardedLeave, hasGuards],
  )

  function close() {
    blurActiveInput()
    const hasHome = navigation.getState().routes.some((r) => r.name === 'CockpitHome')
    if (hasHome) {
      navigation.navigate('CockpitHome', undefined, { pop: true })
    } else {
      navigation.replace('CockpitHome')
    }
  }

  return (
    // Every cockpit sheet holds a mask (LStB, Kapital, Kinder …): a reading column, not a wide panel.
    <Sheet onClose={close} closeLabel={tr('sheet.schliessen')} width="flow">
      <LeaveGuardProvider host={host}>{children}</LeaveGuardProvider>
    </Sheet>
  )
}
