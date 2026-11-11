import { Svg, Path } from 'react-native-svg'

/** Line icons of the chat composer, drawn on a 24 px grid like the tab icons. */
export const CHAT_ICON_PATHS = {
  microphone: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5.5 11.5a6.5 6.5 0 0 0 13 0 M12 18v3',
  send: 'M12 19V5 M6 11l6-6 6 6',
  attach: 'M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8',
} as const

export type ChatIconName = keyof typeof CHAT_ICON_PATHS | 'stop'

export interface ChatIconProps {
  readonly name: ChatIconName
  readonly color: string
  readonly size?: number | undefined
}

export function ChatIcon({ name, color, size = 20 }: ChatIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {name === 'stop' ? (
        <Path d="M7.5 7.5h9v9h-9z" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      ) : (
        <Path d={CHAT_ICON_PATHS[name]} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  )
}
