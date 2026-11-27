import { useEffect, useRef } from 'react'
import { Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../../i18n/resources'
import { readAloud, stopReadingAloud, useCanReadAloud, useSpeakingId } from '../../../lib/readAloud/readAloud'
import { speechChunks, speechText } from '../../../lib/readAloud/speechText'

export interface ReadAloudButtonProps {
  readonly id: string
  readonly content: string
  readonly style?: StyleProp<ViewStyle>
  readonly textStyle?: StyleProp<TextStyle>
}

/** Under an answer: the device reads it aloud; a second press stops. Absent where the device has no voice for the language. */
export function ReadAloudButton({ id, content, style, textStyle }: ReadAloudButtonProps) {
  const { t: tr, i18n } = useTranslation(APP_NS)
  const can = useCanReadAloud(i18n.language)
  const speaking = useSpeakingId() === id
  // An answer that leaves the screen (another conversation, another tab) stops talking.
  const speakingNow = useRef(speaking)
  speakingNow.current = speaking
  useEffect(() => () => {
    if (speakingNow.current) stopReadingAloud()
  }, [])
  if (!can) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr(speaking ? 'advisor.chat.readAloudStopAria' : 'advisor.chat.readAloudAria')}
      onPress={() => (speaking ? stopReadingAloud() : readAloud(id, speechChunks(speechText(content, i18n.language)), i18n.language))}
      style={style}
      testID="advisor-message-read-aloud"
    >
      <Text style={textStyle}>{tr(speaking ? 'advisor.chat.readAloudStop' : 'advisor.chat.readAloud')}</Text>
    </Pressable>
  )
}
