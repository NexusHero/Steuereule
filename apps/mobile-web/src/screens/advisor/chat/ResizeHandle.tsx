import { useMemo, useRef, useState } from 'react'
import { PanResponder, Platform, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface ResizeHandleProps {
  /** Width of the panel this handle resizes, in pixels. */
  readonly width: number
  readonly min: number
  readonly max: number
  /** Which side of the handle the panel is on: dragging away from the panel makes it wider. */
  readonly panel: 'left' | 'right'
  readonly onResize: (width: number) => void
  /** Called once when the drag ends, to remember the width. */
  readonly onCommit?: ((width: number) => void) | undefined
  readonly label: string
  readonly testID: string
}

const KEY_STEP = 24

/** The width a drag or a key press leads to, kept within the panel's limits. */
export function resizedWidth(start: number, delta: number, panel: 'left' | 'right', min: number, max: number): number {
  const next = start + (panel === 'left' ? delta : -delta)
  return Math.round(Math.min(Math.max(next, min), Math.max(min, max)))
}

/**
 * The line between two columns of the owl (#503): hover shows it, dragging it makes the panel next
 * to it narrower or wider, so the chat can have the room. Arrow keys do the same.
 */
export function ResizeHandle({ width, min, max, panel, onResize, onCommit, label, testID }: ResizeHandleProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [active, setActive] = useState(false)
  const [hovered, setHovered] = useState(false)
  const startRef = useRef(width)
  const latestRef = useRef(width)
  latestRef.current = width
  const limits = useRef({ min, max, panel, onResize, onCommit })
  limits.current = { min, max, panel, onResize, onCommit }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = latestRef.current
          setActive(true)
        },
        onPanResponderMove: (_event, gesture) => {
          const { min: lo, max: hi, panel: side, onResize: resize } = limits.current
          resize(resizedWidth(startRef.current, gesture.dx, side, lo, hi))
        },
        onPanResponderRelease: () => {
          setActive(false)
          limits.current.onCommit?.(latestRef.current)
        },
        onPanResponderTerminate: () => setActive(false),
      }),
    [],
  )

  const onKey = (key: string) => {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return
    const next = resizedWidth(width, key === 'ArrowRight' ? KEY_STEP : -KEY_STEP, panel, min, max)
    onResize(next)
    onCommit?.(next)
  }

  const webOnly =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
          onKeyDown: (event: { key: string }) => onKey(event.key),
          tabIndex: 0,
        } as object)
      : {}

  const style: ViewStyle = {
    width: 9,
    marginHorizontal: -4,
    zIndex: 2,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'col-resize', touchAction: 'none', userSelect: 'none' } as object) : {}),
  }
  const line: ViewStyle = { flex: 1, width: active || hovered ? 3 : 1, backgroundColor: active || hovered ? t.color.ki : t.color.linieWeich }

  return (
    <View
      {...responder.panHandlers}
      {...webOnly}
      role="separator"
      aria-orientation="vertical"
      aria-label={tr('eule.workspace.resize', { panel: label })}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      style={style}
      testID={testID}
    >
      <View style={line} />
    </View>
  )
}
