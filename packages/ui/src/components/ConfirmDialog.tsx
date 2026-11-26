import { useEffect, useId, useRef } from 'react'
import { Modal, Platform, Pressable, Text, View, type TextStyle, type ViewInstance, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/useTheme'
import { NARROW_CONTENT_MAX_WIDTH } from '../responsive/contentWidth'
import { UI_NS } from '../i18n/resources'
import { Button } from './Button'

/**
 * `destructive`: something is lost (a child, a link, a draft). `final`: something cannot be taken back
 * (a Storno, a Festschreibung, a transmission). Both ask; the tone only sets the confirm button's weight.
 */
export type ConfirmTone = 'destructive' | 'final'

export interface ConfirmDialogProps {
  /** The question, e.g. „Kind löschen?“. */
  readonly title: string
  /** What is lost or what becomes final — the sentence the user decides on. */
  readonly body: string
  /** The verb on the confirm button, e.g. „Löschen“. */
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly tone?: ConfirmTone
  readonly onConfirm: () => void
  readonly onCancel: () => void
  /** Every dialog names its action (`rueckfrage-<id>`), so a gate and a reader can tell two dialogs apart. */
  readonly testID: string
}

/**
 * The one confirmation before a destructive or final action (WEB-37, WEB-38). A modal alert dialog on top
 * of the page: the focus starts on „Abbrechen“ (the safe choice), stays inside while it is open (the
 * platform modal traps it), Escape cancels, and the focus returns to the opener when it closes.
 */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, tone = 'destructive', onConfirm, onCancel, testID }: ConfirmDialogProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(UI_NS)
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<ViewInstance | null>(null)

  useEffect(() => {
    const focusable = cancelRef.current as unknown as { focus?: () => void } | null
    focusable?.focus?.()
  }, [])

  const overlay: ViewStyle = { flex: 1, justifyContent: 'center', alignItems: 'center', padding: t.space.s4 }
  const backdrop: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: t.color.nacht, opacity: 0.5 }
  const panel: ViewStyle = {
    width: '100%',
    maxWidth: NARROW_CONTENT_MAX_WIDTH,
    backgroundColor: t.color.grund,
    borderWidth: t.space.kontur,
    borderColor: t.color.linieWeich,
    borderRadius: t.radius.m,
    padding: t.space.s5,
    gap: t.space.s3,
  }
  const heading: TextStyle = { ...t.type.subhead, color: t.color.tinte }
  const text: TextStyle = { ...t.type.body, color: t.color.tinte }

  return (
    <Modal transparent animationType="none" visible onRequestClose={onCancel}>
      <View style={overlay}>
        <Pressable testID={`${testID}-backdrop`} accessible={false} onPress={onCancel} style={backdrop} />
        <View
          testID={testID}
          role="alertdialog"
          aria-modal={true}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          accessibilityViewIsModal
          style={panel}
        >
          <Text nativeID={titleId} {...(Platform.OS === 'web' ? ({ id: titleId } as Record<string, unknown>) : {})} role="heading" style={heading}>
            {title}
          </Text>
          <Text nativeID={bodyId} {...(Platform.OS === 'web' ? ({ id: bodyId } as Record<string, unknown>) : {})} style={text} testID={`${testID}-body`}>
            {body}
          </Text>
          <Button variant={tone === 'final' ? 'primaer' : 'nacht'} onPress={onConfirm} testID={`${testID}-confirm`}>
            {confirmLabel}
          </Button>
          <Pressable
            ref={cancelRef}
            testID={`${testID}-cancel`}
            accessibilityRole="button"
            onPress={onCancel}
            style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }}>{cancelLabel ?? tr('confirm.abbrechen')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
