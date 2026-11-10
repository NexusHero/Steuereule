import { useMemo, useState } from 'react'
import { Platform, Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { detectChatInputPlatform, type ChatInputPlatform } from './chatKeys'
import { readDictationHintDismissed, writeDictationHintDismissed } from './dictationHintStorage'

export function DictationHint({ platform: override }: { readonly platform?: ChatInputPlatform | undefined }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const platform = useMemo(() => override ?? detectChatInputPlatform(Platform.OS), [override])
  const [dismissed, setDismissed] = useState(readDictationHintDismissed)
  if (dismissed) return null

  return (
    <View style={styles.box} testID="advisor-dictation-hint">
      <Text style={styles.text}>{tr(platform === 'touch' ? 'advisor.chat.dictationHintTouch' : 'advisor.chat.dictationHintDesktop')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('advisor.chat.dictationHintDismiss')}
        onPress={() => {
          writeDictationHintDismissed()
          setDismissed(true)
        }}
        style={styles.close}
        testID="advisor-dictation-hint-dismiss"
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.space.s2,
      padding: t.space.s2,
      borderRadius: t.radius.s,
      backgroundColor: t.color.kiWeich,
      marginBottom: t.space.s2,
    } as ViewStyle,
    text: { flex: 1, fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    close: { paddingHorizontal: t.space.s1 } as ViewStyle,
    closeText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
  }
}
