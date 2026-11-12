import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface ConversationSummary {
  readonly id: string
  /** Null while nothing has been asked in it. */
  readonly title: string | null
  readonly createdAt: string
  readonly lastUsedAt: string
}

/** One place where the search text occurs: in a message, or in the title of a conversation. */
export interface ConversationSearchHit {
  readonly conversationId: string
  readonly conversationTitle: string | null
  readonly messageId?: string | undefined
  readonly role?: 'user' | 'assistant' | undefined
  readonly snippet: string
  readonly at: string
}

const SEARCH_MIN_CHARS = 2
const SEARCH_DELAY_MS = 250

export interface ConversationListProps {
  readonly conversations: readonly ConversationSummary[]
  readonly activeId: string | null
  /** False while an answer is being written: switching would leave it behind. */
  readonly canSwitch: boolean
  readonly onSelect: (id: string) => void
  readonly onNew: () => Promise<void> | void
  readonly onRename: (id: string, title: string) => Promise<void>
  readonly onDelete: (id: string) => Promise<void>
  /** Searches titles and messages of the year; without it the list has no search field. */
  readonly onSearch?: ((query: string) => Promise<readonly ConversationSearchHit[]>) | undefined
}

type RowState = { kind: 'idle' } | { kind: 'renaming'; draft: string } | { kind: 'confirm-delete' } | { kind: 'failed' }

/**
 * The conversations of one tax year (#481). The return is the project and exists on its own; the
 * user only ever starts, opens, renames or deletes conversations.
 */
export function ConversationList({ conversations, activeId, canSwitch, onSelect, onNew, onRename, onDelete, onSearch }: ConversationListProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const [rows, setRows] = useState<Readonly<Record<string, RowState>>>({})
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ readonly kind: 'idle' } | { readonly kind: 'searching' } | { readonly kind: 'done'; readonly hits: readonly ConversationSearchHit[] } | { readonly kind: 'failed' }>({ kind: 'idle' })
  const searching = query.trim().length >= SEARCH_MIN_CHARS

  // Search as the user types, a moment after the last keystroke; a slower earlier answer never
  // overwrites a newer one.
  useEffect(() => {
    if (!onSearch || !searching) {
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

  const stateOf = (id: string): RowState => rows[id] ?? { kind: 'idle' }
  const setState = (id: string, state: RowState) => setRows((prev) => ({ ...prev, [id]: state }))

  const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(i18n.language.startsWith('de') ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const nameOf = (conversation: ConversationSummary): string => conversation.title ?? tr('advisor.chat.conversations.untitled', { date: dateOf(conversation.createdAt) })

  async function attempt(id: string, work: () => Promise<void>) {
    try {
      await work()
      setState(id, { kind: 'idle' })
    } catch {
      setState(id, { kind: 'failed' })
    }
  }

  return (
    <View style={styles.wrap} testID="eule-conversations">
      <Text style={styles.heading} role="heading" aria-level={2}>
        {tr('advisor.chat.conversations.title')}
      </Text>
      <Text style={styles.help}>{tr('advisor.chat.conversations.help')}</Text>
      <Button onPress={() => void onNew()} disabled={!canSwitch} testID="eule-conversation-new">
        {tr('advisor.chat.conversations.new')}
      </Button>

      {onSearch ? (
        <TextInput
          accessibilityLabel={tr('advisor.chat.conversations.searchAria')}
          placeholder={tr('advisor.chat.conversations.searchPlaceholder')}
          placeholderTextColor={t.color.tinte2}
          value={query}
          onChangeText={setQuery}
          maxLength={100}
          style={styles.input}
          testID="eule-conversation-search"
        />
      ) : null}

      {searching ? (
        <View style={styles.wrap} testID="eule-conversation-search-results">
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
                  onPress={() => {
                    setQuery('')
                    if (hit.conversationId !== activeId) onSelect(hit.conversationId)
                  }}
                  style={styles.row}
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

      {searching ? null : conversations.map((conversation) => {
        const state = stateOf(conversation.id)
        const active = conversation.id === activeId
        return (
          <View key={conversation.id} style={[styles.row, active && styles.rowActive]} testID="eule-conversation-row">
            {state.kind === 'renaming' ? (
              <View style={styles.editLine}>
                <TextInput
                  accessibilityLabel={tr('advisor.chat.conversations.renameAria')}
                  value={state.draft}
                  onChangeText={(draft) => setState(conversation.id, { kind: 'renaming', draft })}
                  maxLength={120}
                  style={styles.input}
                  testID="eule-conversation-rename-input"
                />
                <Button
                  variant="leise"
                  disabled={state.draft.trim() === ''}
                  onPress={() => void attempt(conversation.id, () => onRename(conversation.id, state.draft.trim()))}
                  testID="eule-conversation-rename-save"
                >
                  {tr('advisor.chat.conversations.save')}
                </Button>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                aria-current={active ? 'true' : undefined}
                disabled={!canSwitch || active}
                onPress={() => onSelect(conversation.id)}
                style={styles.open}
                testID="eule-conversation-open"
              >
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>
                  {nameOf(conversation)}
                </Text>
                <Text style={styles.meta}>
                  {active ? `${tr('advisor.chat.conversations.current')} · ` : ''}
                  {dateOf(conversation.lastUsedAt)}
                </Text>
              </Pressable>
            )}

            {state.kind === 'confirm-delete' ? (
              <View style={styles.editLine}>
                <Text style={styles.confirm}>{tr('advisor.chat.conversations.deleteConfirm')}</Text>
                <Button onPress={() => void attempt(conversation.id, () => onDelete(conversation.id))} testID="eule-conversation-delete-confirm">
                  {tr('advisor.chat.conversations.delete')}
                </Button>
                <Button variant="ghost" onPress={() => setState(conversation.id, { kind: 'idle' })} testID="eule-conversation-delete-cancel">
                  {tr('advisor.chat.conversations.cancel')}
                </Button>
              </View>
            ) : state.kind !== 'renaming' ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setState(conversation.id, { kind: 'renaming', draft: conversation.title ?? '' })}
                  style={styles.link}
                  testID="eule-conversation-rename"
                >
                  <Text style={styles.linkText}>{tr('advisor.chat.conversations.rename')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSwitch}
                  onPress={() => setState(conversation.id, { kind: 'confirm-delete' })}
                  style={styles.link}
                  testID="eule-conversation-delete"
                >
                  <Text style={styles.linkText}>{tr('advisor.chat.conversations.delete')}</Text>
                </Pressable>
              </View>
            ) : null}

            {state.kind === 'failed' ? (
              <Text style={styles.failed} role="alert" testID="eule-conversation-failed">
                {tr('advisor.chat.conversations.failed')}
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    wrap: { gap: t.space.s3 } as ViewStyle,
    heading: { fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.l, color: t.color.tinte } as TextStyle,
    help: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    row: {
      padding: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
      gap: t.space.s2,
    } as ViewStyle,
    rowActive: { borderColor: t.color.ki, backgroundColor: t.color.kiWeich } as ViewStyle,
    open: { gap: t.space.s1, minHeight: 44, justifyContent: 'center' } as ViewStyle,
    name: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    nameActive: { color: t.color.kiTinte } as TextStyle,
    meta: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    snippet: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    actions: { flexDirection: 'row', gap: t.space.s4 } as ViewStyle,
    link: { minHeight: 44, justifyContent: 'center' } as ViewStyle,
    linkText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.kiTinte, textDecorationLine: 'underline' } as TextStyle,
    editLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s2 } as ViewStyle,
    input: {
      flexGrow: 1,
      flexBasis: 180,
      minHeight: 44,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.grund,
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    confirm: { flexBasis: '100%', fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    failed: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler } as TextStyle,
  }
}
