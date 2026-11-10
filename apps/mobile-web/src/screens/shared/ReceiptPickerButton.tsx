import { useRef, type ReactNode } from 'react'
import { Platform, Text, type TextStyle } from 'react-native'
import { Button } from '@steuereule/ui'

export const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

export interface ReceiptPickerButtonProps {
  readonly onFile: (file: File) => void
  readonly disabled?: boolean | undefined
  readonly testID: string
  readonly children: ReactNode
  readonly variant?: 'primaer' | 'leise' | undefined
  /** Shown instead of the button where no file picker exists yet (native build, #444 Slice 4). */
  readonly unsupportedHint?: string | undefined
  readonly hintStyle?: TextStyle | undefined
  /** Defaults to `${testID}-input`. */
  readonly inputTestID?: string | undefined
}

/** One file picker for PDFs and photos, shared by the LStB mask, the Belege inbox and the chat. */
export function ReceiptPickerButton({
  onFile,
  disabled,
  testID,
  children,
  variant,
  unsupportedHint,
  hintStyle,
  inputTestID,
}: ReceiptPickerButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  if (Platform.OS !== 'web') {
    return unsupportedHint ? (
      <Text style={hintStyle} testID={`${testID}-unsupported`}>
        {unsupportedHint}
      </Text>
    ) : null
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        data-testid={inputTestID ?? `${testID}-input`}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      <Button
        {...(variant ? { variant } : {})}
        onPress={() => inputRef.current?.click()}
        disabled={disabled === true}
        testID={testID}
      >
        {children}
      </Button>
    </>
  )
}
