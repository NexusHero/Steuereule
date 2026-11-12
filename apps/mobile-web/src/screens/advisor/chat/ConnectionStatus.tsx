import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { describeModelFailure, type AdvisorConnection } from '@steuereule/core'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

/**
 * What the status in the top bar says (#488), from the three things the chat can know: whether the
 * server answers, whether a stream is being restored, and whether the model is reachable.
 */
export type ConnectionView =
  | { readonly kind: 'checking' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'restoring' }
  | { readonly kind: 'model'; readonly connection: AdvisorConnection }

export type ConnectionTone = 'ok' | 'warn' | 'bad' | 'idle'

export function toneOf(view: ConnectionView): ConnectionTone {
  if (view.kind === 'offline') return 'bad'
  if (view.kind === 'restoring') return 'warn'
  if (view.kind === 'checking') return 'idle'
  switch (view.connection.state) {
    case 'connected':
      return 'ok'
    case 'degraded':
      return 'warn'
    case 'unavailable':
      return 'bad'
    case 'rules-only':
      return 'idle'
  }
}

/** The key under advisor.chat.connection.* of the short label. */
export function labelKeyOf(view: ConnectionView): string {
  if (view.kind === 'model') return view.connection.state
  return view.kind
}

const dot = (t: UiTheme, tone: ConnectionTone): ViewStyle => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: tone === 'ok' ? t.color.ok : tone === 'warn' ? t.color.warn : tone === 'bad' ? t.color.fehler : t.color.tinte2,
})

export function ConnectionChip({ view, compact, onPress }: { readonly view: ConnectionView; readonly compact: boolean; readonly onPress: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const tone = toneOf(view)
  const label = tr(`advisor.chat.connection.${labelKeyOf(view)}`, { provider: view.kind === 'model' ? (view.connection.provider ?? '') : '' })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('advisor.chat.connection.aria', { status: label })}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s2, minHeight: 44, paddingHorizontal: t.space.s3, justifyContent: 'center' }}
      testID="eule-connection-chip"
    >
      <View style={dot(t, tone)} testID={`eule-connection-dot-${tone}`} />
      {compact ? null : (
        <Text style={{ fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.xs, color: t.color.tinte }} testID="eule-connection-label">
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export function ConnectionDetails({ view, onRecheck, rechecking }: { readonly view: ConnectionView; readonly onRecheck: () => void; readonly rechecking: boolean }) {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const failure = view.kind === 'model' ? view.connection.failure : undefined
  const checkedAt = view.kind === 'model' ? new Date(view.connection.checkedAt).toLocaleTimeString(i18n.language.startsWith('de') ? 'de-DE' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : null
  const text = (style: object, key: string, id: string, values: Record<string, string> = {}) => (
    <Text style={style} testID={id}>
      {tr(key, values)}
    </Text>
  )
  const body = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  return (
    <View style={{ gap: t.space.s3 }} testID="eule-connection-details">
      <Text style={{ fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.l, color: t.color.tinte }} role="heading" aria-level={2}>
        {tr('advisor.chat.connection.title')}
      </Text>
      {text(body, `advisor.chat.connection.explain.${labelKeyOf(view)}`, 'eule-connection-explain', { provider: view.kind === 'model' ? (view.connection.provider ?? '') : '' })}
      {view.kind === 'model' && view.connection.provider ? (
        <Text style={body} testID="eule-connection-model">
          {tr('advisor.chat.connection.model', { provider: view.connection.provider, model: view.connection.model ?? '' })}
        </Text>
      ) : null}
      {failure ? (
        <Text style={body} testID="eule-connection-failure">
          {describeModelFailure(failure.reason).text}
          {failure.detail ? ` (${failure.detail})` : ''}
        </Text>
      ) : null}
      {checkedAt ? <Text style={{ ...body, color: t.color.tinte2 }}>{tr('advisor.chat.connection.checkedAt', { time: checkedAt })}</Text> : null}
      <Button variant="leise" onPress={onRecheck} disabled={rechecking} testID="eule-connection-recheck">
        {tr(rechecking ? 'advisor.chat.connection.rechecking' : 'advisor.chat.connection.recheck')}
      </Button>
    </View>
  )
}
