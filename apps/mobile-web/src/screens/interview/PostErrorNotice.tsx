// The honest inline notice a rejected answer write produces — shown, never swallowed (#318 task
// 2). The kind distinguishes a client/server disagreement about the path (conflict) or the value
// (invalid) from a genuine network failure, each with its own copy.
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

export type PostErrorKind = 'conflict' | 'invalid' | 'network'

export function PostErrorNotice({ kind }: { readonly kind: PostErrorKind | null }) {
  const { t: tr } = useTranslation(APP_NS)
  const t = useTheme()
  if (kind === null) return null
  return (
    <Text style={{ color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s3 }} accessibilityRole="alert">
      {tr(`interview.postError.${kind}`)}
    </Text>
  )
}
