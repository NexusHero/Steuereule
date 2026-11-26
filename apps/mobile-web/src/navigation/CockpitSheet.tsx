import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Sheet } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { blurActiveInput } from '../lib/blurActiveInput'
import type { CockpitStackParamList } from './routes'

export interface CockpitSheetProps {
  readonly navigation: NativeStackNavigationProp<CockpitStackParamList>
  readonly children: ReactNode
}

export function CockpitSheet({ navigation, children }: CockpitSheetProps) {
  const { t: tr } = useTranslation(APP_NS)
  // WEB-40 / NM-05: the X, the backdrop, Escape and the browser's back wait for the mask's pending saves; the
  // stack's guardedStackRoute holds the guard of this route.

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
      {children}
    </Sheet>
  )
}
