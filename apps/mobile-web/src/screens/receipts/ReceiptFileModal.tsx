import { useEffect, useState } from 'react'
import { Image, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, useTheme, type UiTheme } from '@steuereule/ui'
import { fetchReceiptFileBlob } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'

export interface ReceiptFileModalProps {
  readonly receiptId: string | null
  readonly fileName?: string | undefined
  readonly onClose: () => void
}

type PreviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly objectUrl: string; readonly contentType: string }

export function ReceiptFileModal({ receiptId, fileName, onClose }: ReceiptFileModalProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    if (receiptId === null) {
      setState({ status: 'loading' })
      return
    }

    let cancelled = false
    let activeObjectUrl: string | null = null
    setState({ status: 'loading' })

    void fetchReceiptFileBlob(receiptId)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setState({ status: 'error' })
          return
        }
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
          setState({ status: 'error' })
          return
        }
        const objectUrl = URL.createObjectURL(res.blob)
        activeObjectUrl = objectUrl
        setState({ status: 'ready', objectUrl, contentType: res.mimeType })
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error' })
        }
      })

    return () => {
      cancelled = true
      if (activeObjectUrl !== null && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(activeObjectUrl)
      }
    }
  }, [receiptId])

  if (receiptId === null) {
    return null
  }

  const displayName = fileName ?? receiptId
  const isWeb = typeof document !== 'undefined'

  return (
    <Card style={styles.modalCard} testID="receipt-file-modal">
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {displayName}
        </Text>
        <Button variant="ghost" onPress={onClose} style={styles.closeButton} testID="receipt-file-close">
          {tr('belege.preview.close')}
        </Button>
      </View>

      {state.status === 'loading' && <Text style={styles.infoText}>{tr('belege.preview.loading')}</Text>}

      {state.status === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{tr('belege.preview.error')}</Text>
        </View>
      )}

      {state.status === 'ready' && (
        <View style={styles.body}>
          {state.contentType.toLowerCase().startsWith('image/') ? (
            isWeb ? (
              <img
                src={state.objectUrl}
                alt={displayName}
                style={{ width: '100%', maxHeight: 460, objectFit: 'contain', borderRadius: t.radius.s }}
              />
            ) : (
              <Image
                source={{ uri: state.objectUrl }}
                accessibilityLabel={displayName}
                style={styles.nativeImage}
                resizeMode="contain"
              />
            )
          ) : isWeb ? (
            <View style={styles.pdfStack}>
              <iframe
                title={displayName}
                src={state.objectUrl}
                style={{ width: '100%', height: 460, border: 'none', borderRadius: t.radius.s }}
              />
              <a
                href={state.objectUrl}
                download={displayName}
                // adherence-allow: a DOM <a> takes CSS, not a React Native text role.
                style={{ color: t.color.tinte, fontFamily: t.font.text, fontWeight: 700, fontSize: t.size.s }}
              >
                {tr('belege.preview.download')}
              </a>
            </View>
          ) : (
            <Text style={styles.infoText}>{displayName}</Text>
          )}
        </View>
      )}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const modalCard: ViewStyle = {
    marginVertical: t.space.s4,
    borderWidth: 2,
    borderColor: t.color.tinte,
    gap: t.space.s3,
  }
  const header: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.s3,
  }
  const title: TextStyle = {
    ...t.type.cardTitle,
    flex: 1,
    color: t.color.tinte,
  }
  const closeButton: ViewStyle = {
    width: 'auto',
    minHeight: 40,
    paddingHorizontal: t.space.s4,
  }
  const body: ViewStyle = {
    gap: t.space.s2,
  }
  const pdfStack: ViewStyle = {
    gap: t.space.s2,
  }
  const infoText: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
  }
  const errorBox: ViewStyle = {
    padding: t.space.s3,
    borderRadius: t.radius.s,
    borderWidth: t.space.kontur,
    borderColor: t.color.warn,
    backgroundColor: t.color.warnWeich,
  }
  const errorText: TextStyle = {
    ...t.type.small,
    color: t.color.tinte,
  }
  const nativeImage = {
    width: '100%' as const,
    height: 360,
  }
  return { modalCard, header, title, closeButton, body, pdfStack, infoText, errorBox, errorText, nativeImage }
}
