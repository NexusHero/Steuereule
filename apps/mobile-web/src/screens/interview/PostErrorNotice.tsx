import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

export type PostErrorKind = 'conflict' | 'invalid' | 'network' | 'failed'

/** Why the last answer did not stick; `detail` is the shared reason for a `failed` one (401, 429, 500 …). */
export interface PostError {
  readonly kind: PostErrorKind
  readonly detail?: string
}

export function PostErrorNotice({ notice }: { readonly notice: PostError | null }) {
  const { t: tr } = useTranslation(APP_NS)
  const t = useTheme()
  if (notice === null) return null
  const text = notice.detail === undefined ? tr(`interview.postError.${notice.kind}`) : `${notice.detail} ${tr(`interview.postError.${notice.kind}`)}`
  return (
    <Text style={{ ...t.type.small, color: t.color.fehler, marginBottom: t.space.s3 }} accessibilityRole="alert" testID={`post-error-${notice.kind}`}>
      {text}
    </Text>
  )
}
