import { useRef, type ReactNode } from 'react'
import { Platform, Text, type TextStyle } from 'react-native'
import { Button } from '@steuereule/ui'

export const RECEIPT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'
/** Business receipts also take an E-Rechnung as XRechnung file (ADR-0101 §22). */
export const BUSINESS_RECEIPT_ACCEPT = `${RECEIPT_ACCEPT},application/xml,text/xml,.xml`

export interface ReceiptPickerButtonProps {
  readonly onFile: (file: File) => void
  /** Lets the user choose several files at once; `onFile` then runs once per file, in the order chosen. */
  readonly multiple?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly testID: string
  readonly children: ReactNode
  readonly variant?: 'primaer' | 'leise' | undefined
  /** Shown instead of the button where no file picker exists yet (native build, #444 Slice 4). */
  readonly unsupportedHint?: string | undefined
  readonly hintStyle?: TextStyle | undefined
  /** Defaults to `${testID}-input`. */
  readonly inputTestID?: string | undefined
  /** The file types the picker offers; PDFs and photos by default. */
  readonly accept?: string | undefined
}

/** One file picker for PDFs and photos, shared by the LStB mask, the Belege inbox and the chat. */
export function ReceiptPickerButton({
  onFile,
  multiple,
  disabled,
  testID,
  children,
  variant,
  unsupportedHint,
  hintStyle,
  inputTestID,
  accept = RECEIPT_ACCEPT,
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
        accept={accept}
        multiple={multiple === true}
        data-testid={inputTestID ?? `${testID}-input`}
        style={{ display: 'none' }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          for (const file of multiple === true ? files : files.slice(0, 1)) onFile(file)
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
