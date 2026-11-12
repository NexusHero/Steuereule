import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputKeyPressEventData,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { inkOnFunke, useTheme, type UiTheme } from '@steuereule/ui'
import { ChatIcon } from '../../../icons/ChatIcon'
import { APP_NS } from '../../../i18n/resources'
import { chatKeyAction, clampComposerHeight, detectChatInputPlatform, type ChatInputPlatform } from './chatKeys'

const LINE_HEIGHT = 20

export interface ChatComposerProps {
  readonly value: string
  readonly onChangeText: (next: string) => void
  /** Called with the trimmed text; the parent clears `value`. */
  readonly onSend: (text: string) => void
  /** Present while an answer can be stopped: the send button turns into ■ Stop, Escape stops. */
  readonly onStop?: (() => void) | undefined
  readonly sending: boolean
  readonly placeholder: string
  readonly inputTestID: string
  readonly sendTestID: string
  readonly stopTestID?: string | undefined
  readonly leading?: ReactNode
  /** Sits between the text and the send button, e.g. the dictation microphone. */
  readonly trailing?: ReactNode
  readonly variant?: 'panel' | 'dock' | undefined
  /** Test seam; detected from the device otherwise. */
  readonly platform?: ChatInputPlatform | undefined
}

/**
 * The one chat input of the app (#451 slice 1): desktop, tablet drawer, mobile dock and the
 * in-mask companion all use it, so Enter, Stop and the five-line growth behave the same everywhere.
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  sending,
  placeholder,
  inputTestID,
  sendTestID,
  stopTestID = 'advisor-chat-stop',
  leading,
  trailing,
  variant = 'panel',
  platform: platformOverride,
}: ChatComposerProps) {
  const t = useTheme()
  const styles = makeStyles(t, variant)
  const { t: tr } = useTranslation(APP_NS)
  const platform = useMemo(() => platformOverride ?? detectChatInputPlatform(Platform.OS), [platformOverride])
  const [height, setHeight] = useState(LINE_HEIGHT)
  const inputRef = useRef<TextInput>(null)
  const canStop = sending && onStop !== undefined
  const onWeb = Platform.OS === 'web'

  // In a browser the reported content size is the textarea's scrollHeight: it includes the padding
  // and is never smaller than the box itself, so feeding it back made the input grow to its
  // maximum and stay there. Measure the text with the box collapsed instead.
  useLayoutEffect(() => {
    if (!onWeb) return
    const element = inputRef.current as unknown as HTMLTextAreaElement | null
    if (!element || typeof element.scrollHeight !== 'number' || !element.style) return
    // An empty input is one line; a long placeholder that wraps must not make it taller.
    if (value.length === 0) {
      setHeight(LINE_HEIGHT)
      return
    }
    const previous = element.style.height
    element.style.height = '0px'
    const contentHeight = element.scrollHeight - styles.inputPadding
    element.style.height = previous
    setHeight(clampComposerHeight(contentHeight, LINE_HEIGHT))
  }, [onWeb, value, styles.inputPadding])

  function submit() {
    const text = value.trim()
    if (!text || sending) return
    onSend(text)
    setHeight(LINE_HEIGHT)
  }

  function handleKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const native = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean }
    const action = chatKeyAction({ key: native.key, shiftKey: native.shiftKey, isComposing: native.isComposing }, platform)
    if (action === 'send') {
      event.preventDefault()
      submit()
    } else if (action === 'stop' && canStop) {
      event.preventDefault()
      onStop()
    }
  }

  // Escape stops the answer even when the focus is no longer in the input.
  useEffect(() => {
    if (!canStop || typeof document === 'undefined') return
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onStop()
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [canStop, onStop])

  const input = (
    <TextInput
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.color.tinte2}
      multiline
      blurOnSubmit={false}
      onKeyPress={handleKeyPress}
      ref={inputRef}
      {...(onWeb
        ? {}
        : { onContentSizeChange: (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => setHeight(clampComposerHeight(e.nativeEvent.contentSize.height, LINE_HEIGHT)) })}
      enterKeyHint={platform === 'desktop' ? 'send' : 'enter'}
      returnKeyType="default"
      autoComplete="off"
      style={[styles.input, { height: height + styles.inputPadding }]}
      testID={inputTestID}
    />
  )

  if (variant === 'dock') {
    return (
      <View style={styles.row}>
        {leading}
        {input}
        {canStop ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('advisor.chat.stopAria')} onPress={onStop} style={styles.dockSend} testID={stopTestID}>
            <Text style={styles.dockSendText}>{tr('advisor.chat.stopButton')}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" disabled={sending || value.trim().length === 0} onPress={submit} style={styles.dockSend} testID={sendTestID}>
            <Text style={styles.dockSendText}>{tr('advisor.chat.sendButton', 'Fragen')}</Text>
          </Pressable>
        )}
      </View>
    )
  }

  // One box, one line: attachment, text, microphone and send sit together and the box grows with
  // the text (#476). Send and Stop are the same round button.
  const cannotSend = sending || value.trim().length === 0
  return (
    <View style={styles.box}>
      {leading}
      {input}
      {trailing}
      {canStop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.chat.stopAria')}
          onPress={onStop}
          style={[styles.round, styles.roundStop]}
          testID={stopTestID}
        >
          <ChatIcon name="stop" color={t.color.karte} size={18} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.chat.sendButton', 'Fragen')}
          accessibilityState={{ disabled: cannotSend }}
          disabled={cannotSend}
          onPress={submit}
          style={[styles.round, styles.roundSend, cannotSend && styles.roundDisabled]}
          testID={sendTestID}
        >
          <ChatIcon name="send" color={inkOnFunke(t)} />
        </Pressable>
      )}
    </View>
  )
}

/** Diameter of the round buttons inside the composer; the box is this plus its padding at one line. */
export const COMPOSER_BUTTON_SIZE = 36

function makeStyles(t: UiTheme, variant: 'panel' | 'dock') {
  const dock = variant === 'dock'
  // Inside the box the text carries only enough padding to centre one line next to the buttons.
  const padding = dock ? t.space.s2 : (COMPOSER_BUTTON_SIZE - LINE_HEIGHT) / 2
  return {
    inputPadding: padding * 2,
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.s2 } as ViewStyle,
    box: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: t.space.s2,
      padding: t.space.s2,
      borderRadius: t.radius.lg,
      borderWidth: 1.5,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    input: {
      flex: 1,
      ...(dock
        ? { backgroundColor: t.color.grund, borderWidth: 1, borderColor: t.color.linieWeich, borderRadius: t.radius.s, paddingHorizontal: t.space.s3 }
        : { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: t.space.s1, outlineStyle: 'none' }),
      paddingVertical: padding,
      fontFamily: t.font.text,
      fontSize: dock ? t.size.s : t.size.m,
      lineHeight: LINE_HEIGHT,
      color: t.color.tinte,
    } as TextStyle,
    round: {
      width: COMPOSER_BUTTON_SIZE,
      height: COMPOSER_BUTTON_SIZE,
      borderRadius: COMPOSER_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    roundSend: { backgroundColor: t.color.funke, borderWidth: 1.5, borderColor: t.color.tinte } as ViewStyle,
    roundStop: { backgroundColor: t.color.tinte } as ViewStyle,
    roundDisabled: { opacity: 0.4 } as ViewStyle,
    dockSend: {
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.funke,
      borderWidth: 1.5,
      borderColor: t.color.tinte,
    } as ViewStyle,
    dockSendText: { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: inkOnFunke(t) } as TextStyle,
  }
}
