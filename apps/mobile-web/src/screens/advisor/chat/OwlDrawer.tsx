import { useEffect, useRef, type ReactNode } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { StrokeIcon } from '../../../icons/StrokeIcon'

export interface OwlDrawerProps {
  readonly onClose: () => void
  readonly closeLabel: string
  readonly children: ReactNode
  readonly testID?: string | undefined
}

/**
 * The conversations below desktop width (#476, chat-first): a drawer from the left over the chat,
 * like Claude on a phone. A tap beside it or Escape closes it.
 */
export function OwlDrawer({ onClose, closeLabel, children, testID }: OwlDrawerProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  return (
    <View style={styles.overlay} testID={testID}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.backdrop} testID={testID ? `${testID}-backdrop` : undefined} />
      <View style={styles.panel} role="dialog" aria-modal>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.close} testID={testID ? `${testID}-close` : undefined}>
            <StrokeIcon name="sidebar" color={t.color.tinte} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, flexDirection: 'row' } as ViewStyle,
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: t.color.nacht, opacity: 0.4 } as ViewStyle,
    panel: {
      width: '86%',
      maxWidth: 320,
      height: '100%',
      backgroundColor: t.color.grund,
      borderRightWidth: 1,
      borderRightColor: t.color.linieWeich,
    } as ViewStyle,
    header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.s2 } as ViewStyle,
    close: { width: 44, height: 44, borderRadius: t.radius.s, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
    content: { paddingHorizontal: t.space.s2, paddingBottom: t.space.s5 } as ViewStyle,
  }
}
