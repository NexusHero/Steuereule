import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAuthClient } from '../../auth/AuthClientProvider'

/**
 * A sign-out of its own (WEB-8), not only the chip in the device list, which disappears when that list fails to
 * load. A failed sign-out says so and leaves the person signed in.
 */
export function SignOutSection({ onSignedOut }: { readonly onSignedOut: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function signOut() {
    setBusy(true)
    setFailed(false)
    try {
      const { error } = await authClient.signOut()
      if (error) {
        setFailed(true)
        return
      }
      onSignedOut()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginTop: t.space.s4 }}>
      <Button variant="ghost" onPress={() => void signOut()} disabled={busy} testID="profil-abmelden">
        {busy ? tr('profil.signOut.busy') : tr('profil.signOut.button')}
      </Button>
      {failed ? (
        <Text style={{ ...t.type.small, color: t.color.fehler, marginTop: t.space.s2 }} accessibilityRole="alert">
          {tr('profil.signOut.failed')}
        </Text>
      ) : null}
    </Card>
  )
}
