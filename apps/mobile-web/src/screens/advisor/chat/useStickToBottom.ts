import { useCallback, useRef } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native'
import { isNearBottom } from './chatKeys'

/**
 * Follows a growing answer only while the reader sits at the bottom of the chat; once they scroll
 * up to read, new text no longer pulls them down (#451 slice 1).
 */
export function useStickToBottom() {
  const ref = useRef<ScrollView>(null)
  const atBottom = useRef(true)

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent
    atBottom.current = isNearBottom({
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    })
  }, [])

  const onContentSizeChange = useCallback(() => {
    if (atBottom.current) ref.current?.scrollToEnd({ animated: false })
  }, [])

  return { ref, onScroll, onContentSizeChange, scrollEventThrottle: 32 } as const
}
