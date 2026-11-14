import { useEffect, useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { browserDictationEngine, type DictationEngine } from '../../lib/dictation/engine'
import { DICTATION_MODEL } from '../../lib/dictation/modelLock'

/**
 * „Sprachmodell löschen“ (#451 slice 5, decision 13): the dictation model is the only thing the
 * app keeps in the browser cache. It appears here only while it is actually stored.
 */
export function ProfileDictationModelSection({ engine = browserDictationEngine }: { readonly engine?: DictationEngine }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [state, setState] = useState<'unknown' | 'stored' | 'absent' | 'deleting'>('unknown')

  useEffect(() => {
    let alive = true
    engine
      .isModelCached()
      .then((stored) => alive && setState(stored ? 'stored' : 'absent'))
      .catch(() => alive && setState('absent'))
    return () => {
      alive = false
    }
  }, [engine])

  if (state === 'unknown' || state === 'absent') return null

  async function remove() {
    setState('deleting')
    await engine.deleteModel().catch(() => {})
    setState((await engine.isModelCached().catch(() => false)) ? 'stored' : 'absent')
  }

  return (
    <Card style={styles.card} testID="profil-sprachmodell">
      <View style={styles.col}>
        <Text style={styles.title}>{tr('profil.sprachmodell.titel')}</Text>
        <Text style={styles.text}>{tr('profil.sprachmodell.beschreibung', { megabytes: Math.round(DICTATION_MODEL.totalBytes / 1_000_000) })}</Text>
        <Button variant="ghost" onPress={() => void remove()} disabled={state === 'deleting'} testID="profil-sprachmodell-loeschen">
          {tr('profil.sprachmodell.loeschen')}
        </Button>
      </View>
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  return {
    card: { marginTop: t.space.s4, padding: t.space.s4 } as ViewStyle,
    col: { gap: t.space.s2 } as ViewStyle,
    title: { ...t.type.cardTitle, color: t.color.tinte } as TextStyle,
    text: { ...t.type.small, color: t.color.tinte2 } as TextStyle,
  }
}
