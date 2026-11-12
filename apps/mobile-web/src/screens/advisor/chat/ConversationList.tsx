import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { makeSidePanelStyles } from './sidePanelStyles'

export interface ConversationSummary {
  readonly id: string
  /** Null while nothing has been asked in it. */
  readonly title: string | null
  readonly createdAt: string
  readonly lastUsedAt: string
  /** An answer is being written in it right now, on this or another device. */
  readonly answering?: boolean | undefined
}

/** A tax year with its conversations: the year is the project (#503). */
export interface ConversationProject {
  readonly taxYear: number
  readonly conversations: readonly ConversationSummary[]
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
  /** The tax year that is open; its conversations are `conversations`. */
  readonly activeYear?: number | undefined
  /** Every tax year with conversations; the other years are listed below the open one (#503). */
  readonly projects?: readonly ConversationProject[] | undefined
  /** Opens a conversation of another tax year, which switches the app to that year. */
  readonly onSelectInYear?: ((taxYear: number, id: string) => void) | undefined
  /** The conversations this device is following an answer in; they answer side by side. */
  readonly answeringIds?: readonly string[] | undefined
  /** Searches titles and messages of the year; without it the list has no search field. */
  readonly onSearch?: ((query: string) => Promise<readonly ConversationSearchHit[]>) | undefined
}

type RowState = { kind: 'idle' } | { kind: 'renaming'; draft: string } | { kind: 'confirm-delete' } | { kind: 'failed' }

/**
 * The conversations of one tax year (#481). The return is the project and exists on its own; the
 * user only ever starts, opens, renames or deletes conversations.
 */
export function ConversationList({ conversations, activeId, canSwitch, onSelect, onNew, onRename, onDelete, onSearch, activeYear, projects = [], onSelectInYear, answeringIds = [] }: ConversationListProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const [rows, setRows] = useState<Readonly<Record<string, RowState>>>({})
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ readonly kind: 'idle' } | { readonly kind: 'searching' } | { readonly kind: 'done'; readonly hits: readonly ConversationSearchHit[] } | { readonly kind: 'failed' }>({ kind: 'idle' })
  const searching = query.trim().length >= SEARCH_MIN_CHARS
  const [openYears, setOpenYears] = useState<ReadonlySet<number>>(new Set())
  const otherYears = projects.filter((project) => project.taxYear !== activeYear && project.conversations.length > 0)
  const isAnswering = (conversation: ConversationSummary): boolean => conversation.answering === true || answeringIds.includes(conversation.id)

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
      <Text style={styles.heading} role="heading" aria-level={2} testID="eule-project-heading">
        {activeYear === undefined ? tr('advisor.chat.conversations.title') : tr('advisor.chat.conversations.project', { year: activeYear })}
      </Text>
      <Text style={styles.help}>{tr('advisor.chat.conversations.help')}</Text>
      {/* Quiet on purpose: the list sits at the side of the conversation and must not outshine it. */}
      <Button variant="leise" onPress={() => void onNew()} disabled={!canSwitch} testID="eule-conversation-new">
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
          style={styles.search}
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
                {isAnswering(conversation) ? (
                  <Text style={styles.answering} testID="eule-conversation-answering">
                    {tr('advisor.chat.conversations.answering')}
                  </Text>
                ) : null}
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
                  // A conversation is not deleted from under the answer that is being written in it.
                  disabled={!canSwitch || isAnswering(conversation)}
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

      {searching
        ? null
        : otherYears.map((project) => {
            const open = openYears.has(project.taxYear)
            return (
              <View key={project.taxYear} style={styles.wrap} testID="eule-project">
                <Pressable
                  accessibilityRole="button"
                  aria-expanded={open}
                  onPress={() => setOpenYears((prev) => { const next = new Set(prev); if (open) next.delete(project.taxYear); else next.add(project.taxYear); return next })}
                  style={styles.projectHeader}
                  testID="eule-project-toggle"
                >
                  <Text style={styles.projectTitle}>{`${open ? '▾' : '▸'} ${tr('advisor.chat.conversations.project', { year: project.taxYear })}`}</Text>
                  <Text style={styles.meta}>{tr('advisor.chat.conversations.count', { count: project.conversations.length })}</Text>
                </Pressable>
                {open
                  ? project.conversations.map((conversation) => (
                      <Pressable
                        key={conversation.id}
                        accessibilityRole="button"
                        disabled={!canSwitch || !onSelectInYear}
                        onPress={() => onSelectInYear?.(project.taxYear, conversation.id)}
                        style={styles.row}
                        testID="eule-project-conversation"
                      >
                        <Text style={styles.name} numberOfLines={2}>
                          {nameOf(conversation)}
                        </Text>
                        <Text style={styles.meta}>{dateOf(conversation.lastUsedAt)}</Text>
                        {isAnswering(conversation) ? <Text style={styles.answering}>{tr('advisor.chat.conversations.answering')}</Text> : null}
                      </Pressable>
                    ))
                  : null}
              </View>
            )
          })}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    ...makeSidePanelStyles(t),
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
    snippet: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    actions: { flexDirection: 'row', gap: t.space.s4 } as ViewStyle,
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
    // One line, full width: the rename field's flex-basis is a width there and would be a height here.
    search: {
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
    answering: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.xs, color: t.color.kiTinte } as TextStyle,
    projectHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s2 } as ViewStyle,
    projectTitle: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    confirm: { flexBasis: '100%', fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
  }
}
