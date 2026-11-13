import { useState } from 'react'
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, inkOnFunke, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { StrokeIcon } from '../../../icons/StrokeIcon'
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
  /** Every tax year with conversations; the year menu offers them (#503). */
  readonly projects?: readonly ConversationProject[] | undefined
  /** Opens a conversation of another tax year, which switches the app to that year. */
  readonly onSelectInYear?: ((taxYear: number, id: string) => void) | undefined
  /** The conversations this device is following an answer in; they answer side by side. */
  readonly answeringIds?: readonly string[] | undefined
  /** Opens the search dialog; without it the list offers no search. */
  readonly onOpenSearch?: (() => void) | undefined
}

type RowState = { kind: 'idle' } | { kind: 'menu' } | { kind: 'renaming'; draft: string } | { kind: 'confirm-delete' } | { kind: 'failed' }

/**
 * The conversations of one tax year (#481), slim like Claude's sidebar (#476, chat-first): a new
 * conversation, the search behind a magnifier, the year as a menu, then one line per conversation.
 * Renaming and deleting sit behind each line's "…". The return is the project and exists on its
 * own; the user only ever starts, opens, renames or deletes conversations.
 */
export function ConversationList({ conversations, activeId, canSwitch, onSelect, onNew, onRename, onDelete, onOpenSearch, activeYear, projects = [], onSelectInYear, answeringIds = [] }: ConversationListProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const [rows, setRows] = useState<Readonly<Record<string, RowState>>>({})
  const [yearMenu, setYearMenu] = useState(false)
  const otherYears = projects.filter((project) => project.taxYear !== activeYear && project.conversations.length > 0)
  const isAnswering = (conversation: ConversationSummary): boolean => conversation.answering === true || answeringIds.includes(conversation.id)

  const stateOf = (id: string): RowState => rows[id] ?? { kind: 'idle' }
  const setState = (id: string, state: RowState) => setRows((prev) => ({ ...prev, [id]: state }))

  const dateOf = (iso: string): string => new Date(iso).toLocaleDateString(i18n.language.startsWith('de') ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const nameOf = (conversation: ConversationSummary): string => conversation.title ?? tr('advisor.chat.conversations.untitled', { date: dateOf(conversation.createdAt) })
  const hover = (base: ViewStyle) => (state: unknown) => [base, (state as { hovered?: boolean }).hovered ? styles.hover : null]

  /** Another year opens at its most recent conversation. */
  function openYear(project: ConversationProject) {
    const latest = [...project.conversations].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]
    setYearMenu(false)
    if (latest) onSelectInYear?.(project.taxYear, latest.id)
  }

  async function attempt(id: string, work: () => Promise<void>) {
    try {
      await work()
      setState(id, { kind: 'idle' })
    } catch {
      setState(id, { kind: 'failed' })
    }
  }

  const yearHeading = activeYear === undefined ? tr('advisor.chat.conversations.title') : tr('advisor.chat.conversations.project', { year: activeYear })
  return (
    <View style={styles.list} testID="eule-conversations">
      <Pressable accessibilityRole="button" onPress={() => void onNew()} disabled={!canSwitch} style={hover(styles.action)} testID="eule-conversation-new">
        <View style={styles.newIcon}>
          <StrokeIcon name="plus" size={14} color={inkOnFunke(t)} strokeWidth={3} />
        </View>
        <Text style={styles.actionText}>{tr('advisor.chat.conversations.new')}</Text>
      </Pressable>
      {onOpenSearch ? (
        <Pressable accessibilityRole="button" onPress={onOpenSearch} style={hover(styles.action)} testID="eule-conversation-search-open">
          <View style={styles.iconSlot}>
            <StrokeIcon name="search" size={18} color={t.color.tinte} />
          </View>
          <Text style={styles.actionLabel}>{tr('advisor.chat.conversations.search')}</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        // The visible heading leads the name, so speech and voice control match what is on screen (WCAG 2.5.3).
        accessibilityLabel={tr('advisor.chat.conversations.yearMenuAria', { heading: yearHeading })}
        aria-expanded={otherYears.length > 0 ? yearMenu : undefined}
        disabled={otherYears.length === 0}
        onPress={() => setYearMenu((prev) => !prev)}
        style={styles.year}
        testID="eule-year-menu-toggle"
      >
        <Text style={styles.yearText} role="heading" aria-level={2} testID="eule-project-heading">
          {yearHeading}
        </Text>
        {otherYears.length > 0 ? <StrokeIcon name="chevronDown" size={14} color={t.color.tinte2} strokeWidth={2.5} /> : null}
      </Pressable>
      {yearMenu ? (
        <View style={styles.yearMenu} testID="eule-year-menu">
          {otherYears.map((project) => (
            <Pressable
              key={project.taxYear}
              accessibilityRole="button"
              disabled={!canSwitch || !onSelectInYear}
              onPress={() => openYear(project)}
              style={hover(styles.yearOption)}
              testID="eule-year-option"
            >
              <Text style={styles.name}>{tr('advisor.chat.conversations.project', { year: project.taxYear })}</Text>
              <Text style={styles.meta}>{tr('advisor.chat.conversations.count', { count: project.conversations.length })}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {conversations.map((conversation) => {
        const state = stateOf(conversation.id)
        const active = conversation.id === activeId
        return (
          <View key={conversation.id} style={styles.item} testID="eule-conversation-row">
            {state.kind === 'renaming' ? (
              <View style={styles.editLine}>
                <TextInput
                  accessibilityLabel={tr('advisor.chat.conversations.renameAria')}
                  value={state.draft}
                  onChangeText={(draft) => setState(conversation.id, { kind: 'renaming', draft })}
                  maxLength={120}
                  autoFocus
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
              <View style={[styles.line, active && styles.lineActive]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  aria-current={active ? 'true' : undefined}
                  disabled={!canSwitch || active}
                  onPress={() => onSelect(conversation.id)}
                  style={styles.open}
                  testID="eule-conversation-open"
                >
                  <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                    {nameOf(conversation)}
                  </Text>
                  {isAnswering(conversation) ? (
                    <Text style={styles.answering} testID="eule-conversation-answering">
                      {tr('advisor.chat.conversations.answering')}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('advisor.chat.conversations.menuAria', { title: nameOf(conversation) })}
                  aria-expanded={state.kind === 'menu'}
                  onPress={() => setState(conversation.id, state.kind === 'menu' ? { kind: 'idle' } : { kind: 'menu' })}
                  style={hover(styles.more)}
                  testID="eule-conversation-menu"
                >
                  <Text style={styles.moreText}>…</Text>
                </Pressable>
              </View>
            )}

            {state.kind === 'menu' ? (
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
    ...makeSidePanelStyles(t),
    list: { gap: 2 } as ViewStyle,
    hover: { backgroundColor: t.color.linieWeich } as ViewStyle,
    action: { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, minHeight: 44, paddingHorizontal: t.space.s3, borderRadius: t.radius.s } as ViewStyle,
    actionText: { fontFamily: t.font.text, fontWeight: t.weight.halb, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    actionLabel: { fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    newIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: t.color.linie,
      backgroundColor: t.color.funke,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    iconSlot: { width: 26, alignItems: 'center' } as ViewStyle,
    year: { flexDirection: 'row', alignItems: 'center', gap: t.space.s1, minHeight: 36, marginTop: t.space.s4, paddingHorizontal: t.space.s3, alignSelf: 'flex-start' } as ViewStyle,
    yearText: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.xs, letterSpacing: 0.9, textTransform: 'uppercase', color: t.color.tinte2 } as TextStyle,
    yearMenu: { marginBottom: t.space.s2, padding: t.space.s1, borderRadius: t.radius.s, borderWidth: 1, borderColor: t.color.linieWeich, backgroundColor: t.color.karte } as ViewStyle,
    yearOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: t.space.s3, borderRadius: t.radius.s } as ViewStyle,
    item: { gap: t.space.s1 } as ViewStyle,
    line: { flexDirection: 'row', alignItems: 'center', borderRadius: t.radius.s } as ViewStyle,
    lineActive: { backgroundColor: t.color.linieWeich } as ViewStyle,
    open: { flex: 1, minHeight: 40, justifyContent: 'center', paddingLeft: t.space.s3 } as ViewStyle,
    name: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    nameActive: { fontWeight: t.weight.halb } as TextStyle,
    more: { width: 36, height: 36, borderRadius: t.radius.s, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
    moreText: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte2 } as TextStyle,
    actions: { flexDirection: 'row', gap: t.space.s4, paddingHorizontal: t.space.s3 } as ViewStyle,
    editLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s2 } as ViewStyle,
    input: {
      flexGrow: 1,
      flexBasis: 160,
      minHeight: 44,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.s,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    answering: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.xs, color: t.color.kiTinte } as TextStyle,
    confirm: { flexBasis: '100%', fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
  }
}
