import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import type { DictationEngine } from '../../../lib/dictation/engine'
import { ModelChecksumError } from '../../../lib/dictation/modelStore'
import { DICTATION_MODEL } from '../../../lib/dictation/modelLock'
import type { Recording } from '../../../lib/dictation/recorder'
import { ChatIcon } from '../../../icons/ChatIcon'
import { COMPOSER_BUTTON_SIZE } from './ChatComposer'

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'consent' }
  | { readonly kind: 'downloading'; readonly percent: number }
  | { readonly kind: 'recording' }
  | { readonly kind: 'transcribing' }
  | { readonly kind: 'error'; readonly message: string }

export interface DictationBarProps {
  readonly engine: DictationEngine
  /** The transcript goes into the input field; it is never sent automatically (decision 14). */
  readonly onTranscript: (text: string) => void
  readonly disabled?: boolean | undefined
  /**
   * Places the microphone button, e.g. inside the composer; status, consent and errors stay above.
   * Without it the button stands in its own row.
   */
  readonly children?: ((microphone: ReactNode) => ReactNode) | undefined
}

/**
 * Dictation step 2 (#451 slice 5, ADR-0061). The model loads only after consent, from the pinned
 * Hugging Face commit, and is checked before use; the sound never leaves the device.
 */
export function DictationBar({ engine, onTranscript, disabled = false, children }: DictationBarProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const recording = useRef<Recording | null>(null)

  useEffect(() => () => recording.current?.cancel(), [])

  async function record() {
    try {
      recording.current = await engine.record()
      setPhase({ kind: 'recording' })
    } catch {
      setPhase({ kind: 'error', message: tr('advisor.dictation.micDenied') })
    }
  }

  async function onMic() {
    if (phase.kind === 'recording') {
      const current = recording.current
      recording.current = null
      if (!current) return
      setPhase({ kind: 'transcribing' })
      try {
        const text = await engine.transcribe(await current.stop())
        if (text) onTranscript(text)
        setPhase({ kind: 'idle' })
      } catch {
        setPhase({ kind: 'error', message: tr('advisor.dictation.failed') })
      }
      return
    }
    if (await engine.isModelCached()) await record()
    else setPhase({ kind: 'consent' })
  }

  async function accept() {
    setPhase({ kind: 'downloading', percent: 0 })
    try {
      await engine.downloadModel((loaded, total) => setPhase({ kind: 'downloading', percent: Math.floor((loaded / total) * 100) }))
      await record()
    } catch (error) {
      setPhase({ kind: 'error', message: tr(error instanceof ModelChecksumError ? 'advisor.dictation.checksum' : 'advisor.dictation.downloadFailed') })
    }
  }

  const busy = phase.kind === 'downloading' || phase.kind === 'transcribing'
  const megabytes = Math.round(DICTATION_MODEL.totalBytes / 1_000_000)

  const isRecording = phase.kind === 'recording'
  const microphone = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr(isRecording ? 'advisor.dictation.stopAria' : 'advisor.dictation.startAria')}
      accessibilityState={{ disabled: disabled || busy }}
      aria-pressed={isRecording}
      disabled={disabled || busy}
      onPress={() => void onMic()}
      style={[styles.mic, isRecording && styles.micRecording, (disabled || busy) && styles.micDisabled]}
      testID="advisor-dictation-mic"
    >
      <ChatIcon name={isRecording ? 'stop' : 'microphone'} color={isRecording ? t.color.karte : t.color.tinte} />
    </Pressable>
  )
  const status =
    phase.kind === 'recording' ? (
      <Text style={styles.status} accessibilityLiveRegion="polite" testID="dictation-recording">
        {tr('advisor.dictation.recording')}
      </Text>
    ) : phase.kind === 'transcribing' ? (
      <Text style={styles.status} accessibilityLiveRegion="polite" testID="dictation-transcribing">
        {tr('advisor.dictation.transcribing')}
      </Text>
    ) : phase.kind === 'downloading' ? (
      <Text style={styles.status} accessibilityLiveRegion="polite" testID="dictation-progress">
        {tr('advisor.dictation.downloading', { percent: phase.percent })}
      </Text>
    ) : null

  return (
    <View style={styles.box}>
      {children ? (
        status
      ) : (
        <View style={styles.row}>
          {microphone}
          {status}
        </View>
      )}

      {phase.kind === 'consent' ? (
        <View style={styles.consent} testID="dictation-consent" accessibilityRole="alert">
          <Text style={styles.consentTitle}>{tr('advisor.dictation.consentTitle')}</Text>
          <Text style={styles.consentText}>{tr('advisor.dictation.consentBody', { megabytes })}</Text>
          <Text style={styles.consentText}>{tr('advisor.dictation.consentPrivacy')}</Text>
          <View style={styles.row}>
            <Button onPress={() => void accept()} style={styles.button} testID="dictation-consent-accept">
              {tr('advisor.dictation.consentAccept')}
            </Button>
            <Button variant="ghost" onPress={() => setPhase({ kind: 'idle' })} style={styles.button} testID="dictation-consent-decline">
              {tr('advisor.dictation.consentDecline')}
            </Button>
          </View>
        </View>
      ) : null}

      {phase.kind === 'error' ? (
        <Text style={styles.error} role="alert" testID="dictation-error">
          {phase.message}
        </Text>
      ) : null}
      {children ? children(microphone) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: { gap: t.space.s2 } as ViewStyle,
    row: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, flexWrap: 'wrap' } as ViewStyle,
    mic: {
      width: COMPOSER_BUTTON_SIZE,
      height: COMPOSER_BUTTON_SIZE,
      borderRadius: COMPOSER_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    micRecording: { backgroundColor: t.color.fehler } as ViewStyle,
    micDisabled: { opacity: 0.4 } as ViewStyle,
    status: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    consent: { gap: t.space.s2, padding: t.space.s3, borderRadius: t.radius.m, backgroundColor: t.color.kiWeich } as ViewStyle,
    consentTitle: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    consentText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    button: { width: 'auto', flexGrow: 1 } as ViewStyle,
    error: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler } as TextStyle,
  }
}
