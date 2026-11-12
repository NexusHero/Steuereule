import { useState } from 'react'
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

export interface ConversationListProps {
  readonly conversations: readonly ConversationSummary[]
  readonly activeId: string | null
  /** False while an answer is being written: switching would leave it behind. */
  readonly canSwitch: boolean
  readonly onSelect: (id: string) => void
  readonly onNew: () => Promise<void> | void
  readonly onRename: (id: string, title: string) => Promise<void>
  readonly onDelete: (id: string) => Promise<void>
}

type RowState = { kind: 'idle' } | { kind: 'renaming'; draft: string } | { kind: 'confirm-delete' } | { kind: 'failed' }

/**
 * The conversations of one tax year (#481). The return is the project and exists on its own; the
 * user only ever starts, opens, renames or deletes conversations.
 */
export function ConversationList({ conversations, activeId, canSwitch, onSelect, onNew, onRename, onDelete }: ConversationListProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr, i18n } = useTranslation(APP_NS)
  const [rows, setRows] = useState<Readonly<Record<string, RowState>>>({})
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

      {conversations.map((conversation) => {
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
