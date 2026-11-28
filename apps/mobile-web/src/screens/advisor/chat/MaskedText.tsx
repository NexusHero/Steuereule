import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { maskedSegments, type MaskedSpan } from '@steuereule/core'
import { APP_NS } from '../../../i18n/resources'

export interface MaskedTextProps {
  /** The message as the user wrote or said it. */
  readonly text: string
  /** Where the model read something else (ADR-0091); none draws the plain text. */
  readonly spans?: readonly MaskedSpan[] | null | undefined
  readonly style?: StyleProp<TextStyle>
}

/** A stand-in of the masking, e.g. `[IBAN-GESCHÜTZT]`: it says only that something was taken out. */
const STAND_IN = /^\[[^\]]+\]$/

const STRUCK: TextStyle = { textDecorationLine: 'line-through', opacity: 0.6 }

export const hasMasked = (spans: readonly MaskedSpan[] | null | undefined): boolean => (spans?.length ?? 0) > 0

/**
 * A user's message with what did not go to the model struck through where it stands. A range the model read
 * as something else that says more than "taken out" (a spouse as „Person B“, a birthdate as an age) shows
 * that too.
 */
export function MaskedText({ text, spans, style }: MaskedTextProps) {
  const { t: tr } = useTranslation(APP_NS)
  if (!hasMasked(spans)) return <Text style={style}>{text}</Text>
  return (
    <Text style={style}>
      {maskedSegments(text, spans).map((segment, index) =>
        segment.as === undefined ? (
          segment.text
        ) : (
          // eslint-disable-next-line react/no-array-index-key -- the pieces of one text never change order
          <Text key={index}>
            <Text style={STRUCK} accessibilityLabel={tr('advisor.chat.masked.aria', { text: segment.text })} testID="advisor-masked">
              {segment.text}
            </Text>
            {STAND_IN.test(segment.as) || segment.as === '' ? null : ` → ${segment.as}`}
          </Text>
        ),
      )}
    </Text>
  )
}

/** One line under such a message that says what the strike-through means; nothing where nothing was changed. */
export function MaskedNote({ spans, style, conversation = false }: { readonly spans?: readonly MaskedSpan[] | null | undefined; readonly style?: StyleProp<TextStyle>; readonly conversation?: boolean }) {
  const { t: tr } = useTranslation(APP_NS)
  if (!hasMasked(spans)) return null
  return (
    <Text style={style} testID="advisor-masked-note">
      {conversation ? tr('advisor.conversation.maskedNote') : tr('advisor.chat.masked.note')}
    </Text>
  )
}
