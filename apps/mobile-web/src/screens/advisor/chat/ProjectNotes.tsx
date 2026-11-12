import { useState } from 'react'
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export const NOTE_MAX_CHARS = 200

export interface ProjectNote {
  readonly id: string
  readonly text: string
  readonly author: 'owl' | 'user'
}

export interface ProjectNotesProps {
  readonly notes: readonly ProjectNote[]
  readonly onAdd: (text: string) => Promise<void>
  readonly onEdit: (id: string, text: string) => Promise<void>
  readonly onDelete: (id: string) => Promise<void>
}

/**
 * The project notes of a tax year (#481): what the owl knows in every conversation of that year
 * beyond the values of the return. The owl writes them itself; here the user sees them all and
 * can correct, remove or add one.
 */
export function ProjectNotes({ notes, onAdd, onEdit, onDelete }: ProjectNotesProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [editing, setEditing] = useState<{ readonly id: string | 'new'; readonly draft: string } | null>(null)
  const [failed, setFailed] = useState(false)

  async function attempt(work: () => Promise<void>) {
    setFailed(false)
    try {
      await work()
      setEditing(null)
    } catch {
      setFailed(true)
    }
  }

  const editor = (onSave: (text: string) => Promise<void>) =>
    editing ? (
      <View style={styles.editor}>
        <TextInput
          accessibilityLabel={tr('advisor.chat.notes.inputAria')}
          value={editing.draft}
          onChangeText={(draft) => setEditing({ id: editing.id, draft })}
          maxLength={NOTE_MAX_CHARS}
          multiline
          style={styles.input}
          testID="eule-note-input"
        />
        <View style={styles.actions}>
          <Button variant="leise" disabled={editing.draft.trim() === ''} onPress={() => void attempt(() => onSave(editing.draft.trim()))} testID="eule-note-save">
            {tr('advisor.chat.notes.save')}
          </Button>
          <Button variant="ghost" onPress={() => setEditing(null)} testID="eule-note-cancel">
            {tr('advisor.chat.notes.cancel')}
          </Button>
        </View>
      </View>
    ) : null

  return (
    <View style={styles.wrap} testID="eule-notes">
      <Text style={styles.heading} role="heading" aria-level={2}>
        {tr('advisor.chat.notes.title')}
      </Text>
      <Text style={styles.help}>{tr('advisor.chat.notes.help')}</Text>

      {notes.length === 0 ? (
        <Text style={styles.empty} testID="eule-notes-empty">
          {tr('advisor.chat.notes.empty')}
        </Text>
      ) : null}

      {notes.map((note) => (
        <View key={note.id} style={styles.row} testID="eule-note-row">
          {editing?.id === note.id ? (
            editor((text) => onEdit(note.id, text))
          ) : (
            <>
              <Text style={styles.text}>{note.text}</Text>
              <View style={styles.actions}>
                <Text style={styles.meta}>{tr(note.author === 'owl' ? 'advisor.chat.notes.byOwl' : 'advisor.chat.notes.byUser')}</Text>
                <Pressable accessibilityRole="button" onPress={() => setEditing({ id: note.id, draft: note.text })} style={styles.link} testID="eule-note-edit">
                  <Text style={styles.linkText}>{tr('advisor.chat.notes.edit')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => void attempt(() => onDelete(note.id))} style={styles.link} testID="eule-note-delete">
                  <Text style={styles.linkText}>{tr('advisor.chat.notes.delete')}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ))}

      {editing?.id === 'new' ? (
        editor((text) => onAdd(text))
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setEditing({ id: 'new', draft: '' })} style={styles.link} testID="eule-note-add">
          <Text style={styles.linkText}>{tr('advisor.chat.notes.add')}</Text>
        </Pressable>
      )}

      {failed ? (
        <Text style={styles.failed} role="alert" testID="eule-note-failed">
          {tr('advisor.chat.notes.failed')}
        </Text>
      ) : null}
    </View>
  )
}

export interface NoteChangeView {
  readonly kind: 'added' | 'replaced' | 'removed'
  readonly text: string
  readonly previousText?: string | undefined
  readonly undone?: true | undefined
}

export interface NoteChangeHintsProps {
  readonly changes: readonly NoteChangeView[]
  /** Takes the change at this position back; rejects when it could not. */
  readonly onUndo?: ((index: number) => Promise<void>) | undefined
}

/** Under an answer: what the owl just noted, replaced or forgot, each with a way back. */
export function NoteChangeHints({ changes, onUndo }: NoteChangeHintsProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [failedAt, setFailedAt] = useState<number | null>(null)

  async function undo(index: number) {
    setFailedAt(null)
    try {
      await onUndo?.(index)
    } catch {
      setFailedAt(index)
    }
  }

  return (
    <View style={styles.hints} testID="advisor-note-changes">
      {changes.map((change, index) => (
        <View key={`${change.kind}-${index}`} style={styles.hint} testID="advisor-note-change">
          <Text style={[styles.hintText, change.undone && styles.hintUndone]}>
            {tr(`advisor.chat.notes.change.${change.kind}`)}: {change.text}
          </Text>
          {change.undone ? (
            <Text style={styles.meta} testID="advisor-note-change-undone">
              {tr('advisor.chat.notes.undone')}
            </Text>
          ) : onUndo ? (
            <Pressable accessibilityRole="button" onPress={() => void undo(index)} style={styles.link} testID="advisor-note-change-undo">
              <Text style={styles.linkText}>{tr('advisor.chat.notes.undo')}</Text>
            </Pressable>
          ) : null}
          {failedAt === index ? (
            <Text style={styles.failed} role="alert" testID="advisor-note-change-failed">
              {tr('advisor.chat.notes.failed')}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    wrap: { gap: t.space.s3 } as ViewStyle,
    heading: { fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.l, color: t.color.tinte } as TextStyle,
    help: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    empty: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, fontStyle: 'italic' } as TextStyle,
    row: { padding: t.space.s3, borderRadius: t.radius.m, borderWidth: 1, borderColor: t.color.linie, backgroundColor: t.color.karte, gap: t.space.s2 } as ViewStyle,
    text: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    meta: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.s3 } as ViewStyle,
    link: { minHeight: 44, justifyContent: 'center' } as ViewStyle,
    linkText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.kiTinte, textDecorationLine: 'underline' } as TextStyle,
    editor: { gap: t.space.s2 } as ViewStyle,
    input: {
      minHeight: 72,
      padding: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.grund,
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    failed: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler } as TextStyle,
    hints: { marginTop: t.space.s3, gap: t.space.s2 } as ViewStyle,
    hint: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: t.space.s3,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      backgroundColor: t.color.grund,
      borderLeftWidth: 3,
      borderLeftColor: t.color.ki,
    } as ViewStyle,
    hintText: { flexShrink: 1, fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte, paddingVertical: t.space.s2 } as TextStyle,
    hintUndone: { textDecorationLine: 'line-through', color: t.color.tinte2 } as TextStyle,
  }
}
