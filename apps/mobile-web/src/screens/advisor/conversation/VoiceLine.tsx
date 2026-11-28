import { useEffect, useRef, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { Svg, Path } from 'react-native-svg'
import { useReducedMotion, useTheme } from '@steuereule/ui'
import type { ConversationState } from '../../../lib/conversation/conversation'
import { amplitudeShare, linePath, pulsePath } from './voiceLineShape'

const HEIGHT = 120
const MAX_AMPLITUDE = 46
const FRAME_MS = 50

export interface VoiceLineProps {
  readonly state: ConversationState
  /** Loudness of whoever is speaking (RMS, 0 to 1). */
  readonly level: number
}

/**
 * The picture of a spoken conversation: one line in three greys. At rest it is straight. While the user
 * speaks the two lighter greys move with the microphone, while the owl speaks all three move with its
 * voice, and while it thinks one bump travels along the line. With reduced motion the line stands still;
 * the state is written under it either way.
 */
export function VoiceLine({ state, level }: VoiceLineProps) {
  const t = useTheme()
  const reducedMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const [time, setTime] = useState(0)
  const shown = useRef(0)
  const moving = !reducedMotion && (state === 'hearing' || state === 'listening' || state === 'thinking' || state === 'speaking')

  useEffect(() => {
    if (!moving) return
    const timer = setInterval(() => setTime((previous) => previous + FRAME_MS), FRAME_MS)
    return () => clearInterval(timer)
  }, [moving])

  // The line follows the loudness with a little inertia, so it swings instead of flickering.
  const target = state === 'hearing' || state === 'listening' || state === 'speaking' ? amplitudeShare(level) : 0
  shown.current = moving ? shown.current + (target - shown.current) * 0.35 : 0
  const share = shown.current
  const owlSpeaks = state === 'speaking'
  const box = { width, height: HEIGHT }
  const strong =
    state === 'thinking' && moving
      ? pulsePath({ ...box, amplitude: 14, at: ((time / 7) % (width + 160)) - 80 })
      : linePath({ ...box, amplitude: owlSpeaks ? share * MAX_AMPLITUDE : 0, waves: 4.3, phase: time * 0.006 })
  const middle = linePath({ ...box, amplitude: share * MAX_AMPLITUDE * (owlSpeaks ? 0.65 : 0.7), waves: 3.1, phase: time * 0.0045 + 1.7 })
  const light = linePath({ ...box, amplitude: share * MAX_AMPLITUDE * (owlSpeaks ? 0.4 : 0.45), waves: 5.5, phase: time * 0.0035 + 3.1 })

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{ width: '100%', height: HEIGHT }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="eule-gespraech-linie"
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Path d={light} stroke={t.color.linie} strokeWidth={1.5} fill="none" />
          <Path d={middle} stroke={t.color.tinte2} strokeWidth={1.5} fill="none" />
          <Path d={strong} stroke={t.color.tinte} strokeWidth={2} fill="none" />
        </Svg>
      ) : null}
    </View>
  )
}
