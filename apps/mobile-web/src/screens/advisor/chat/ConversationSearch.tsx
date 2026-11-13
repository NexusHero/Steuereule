import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { StrokeIcon } from '../../../icons/StrokeIcon'
import { makeSidePanelStyles } from './sidePanelStyles'
import type { ConversationSearchHit } from './ConversationList'

const SEARCH_MIN_CHARS = 2
const SEARCH_DELAY_MS = 250

export interface ConversationSearchProps {
  /** Searches titles and messages of the open tax year on the server. */
  readonly onSearch: (query: string) => Promise<readonly ConversationSearchHit[]>
  /** Opens the conversation of a hit; the dialog closes. */
  readonly onOpen: (conversationId: string) => void
  /** False while an answer is being written: switching would leave it behind. */
  readonly canSwitch: boolean
}

/**
 * The search behind the magnifier (#476, chat-first): a field and the places the text occurs, like
 * Claude's. It searches as the user types, a moment after the last keystroke; a slower earlier
 * answer never overwrites a newer one.
 */
export function ConversationSearch({ onSearch, onOpen, canSwitch }: ConversationSearchProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ readonly kind: 'idle' } | { readonly kind: 'searching' } | { readonly kind: 'done'; readonly hits: readonly ConversationSearchHit[] } | { readonly kind: 'failed' }>({ kind: 'idle' })
  const searching = query.trim().length >= SEARCH_MIN_CHARS

  useEffect(() => {
    if (!searching) {
      setSearch({ kind: 'idle' })
      return
    }
    let current = true
    setSearch({ kind: 'searching' })
    const timer = setTimeout(() => {
      onSearch(query.trim()).then(
        (hits) => current && setSearch({ kind: 'done', hits }),
        () => current && setSearch({ kind: 'failed' }),
      )
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [onSearch, query, searching])

  const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(i18n.language.startsWith('de') ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <View style={styles.wrap} testID="eule-conversation-search-dialog">
      <Text style={styles.heading} role="heading" aria-level={2}>
        {tr('advisor.chat.conversations.searchTitle')}
      </Text>
      <View style={styles.field}>
        <StrokeIcon name="search" size={18} color={t.color.tinte2} />
        <TextInput
          accessibilityLabel={tr('advisor.chat.conversations.searchAria')}
          placeholder={tr('advisor.chat.conversations.searchPlaceholder')}
          placeholderTextColor={t.color.tinte2}
          value={query}
          onChangeText={setQuery}
          maxLength={100}
          autoFocus
          style={styles.input}
          testID="eule-conversation-search"
        />
      </View>

      {searching ? (
        <View style={styles.results} testID="eule-conversation-search-results">
          {search.kind === 'searching' ? <Text style={styles.help}>{tr('advisor.chat.conversations.searching')}</Text> : null}
          {search.kind === 'failed' ? (
            <Text style={styles.failed} role="alert" testID="eule-conversation-search-failed">
              {tr('advisor.chat.conversations.failed')}
            </Text>
          ) : null}
          {search.kind === 'done' && search.hits.length === 0 ? (
            <Text style={styles.help} testID="eule-conversation-search-empty">
              {tr('advisor.chat.conversations.searchEmpty', { query: query.trim() })}
            </Text>
          ) : null}
          {search.kind === 'done'
            ? search.hits.map((hit, index) => (
                <Pressable
                  key={`${hit.conversationId}-${hit.messageId ?? 'title'}-${index}`}
                  accessibilityRole="button"
                  disabled={!canSwitch}
                  onPress={() => onOpen(hit.conversationId)}
                  style={(state) => [styles.hit, (state as { hovered?: boolean }).hovered ? styles.hitHover : null]}
                  testID="eule-conversation-search-hit"
                >
                  <Text style={styles.meta}>
                    {hit.conversationTitle ?? tr('advisor.chat.conversations.untitled', { date: dateOf(hit.at) })}
                    {hit.role ? ` · ${tr(hit.role === 'user' ? 'advisor.chat.conversations.hitUser' : 'advisor.chat.conversations.hitOwl')}` : ` · ${tr('advisor.chat.conversations.hitTitle')}`}
                  </Text>
                  <Text style={styles.snippet}>{hit.snippet}</Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    ...makeSidePanelStyles(t),
    wrap: { gap: t.space.s3, padding: t.space.s4, paddingTop: 0 } as ViewStyle,
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s2,
      minHeight: 48,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 2,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    input: { flex: 1, minHeight: 44, fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    results: { gap: t.space.s1 } as ViewStyle,
    hit: { gap: 2, paddingVertical: t.space.s2, paddingHorizontal: t.space.s3, borderRadius: t.radius.s } as ViewStyle,
    hitHover: { backgroundColor: t.color.linieWeich } as ViewStyle,
    snippet: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
  }
}
