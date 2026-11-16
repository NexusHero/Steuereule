import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { getApiClientBaseUrl } from '@steuereule/api-client'
import type { Screen } from '@steuereule/core'
import { Card, Chip, useTheme, type UiTheme } from '@steuereule/ui'
import { maskTargetForAcroField } from '../shared/formLineMapping'

export interface AcroFormViewerProps {
  readonly year: number
  readonly initialForm?: string | undefined
  readonly liveValues: Readonly<Record<string, string | true>>
  readonly highlightedFieldId?: string | undefined
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
  readonly onSaveAcroField?: ((acroFieldId: string, nextValue: string) => Promise<void> | void) | undefined
}

export interface AcroAnnotationBox {
  readonly fieldName: string
  readonly rect: readonly [number, number, number, number]
  readonly textAlignment?: number | undefined
}

interface PdfPageViewport {
  readonly width: number
  readonly height: number
  convertToViewportRectangle(rect: readonly [number, number, number, number]): readonly [number, number, number, number]
}

interface PdfPageProxy {
  getViewport(params: { readonly scale: number }): PdfPageViewport
  render(params: { readonly canvasContext: CanvasRenderingContext2D; readonly viewport: PdfPageViewport }): {
    readonly promise: Promise<void>
  }
  getAnnotations(): Promise<readonly AcroAnnotationBox[]>
}

interface PdfDocumentProxy {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfPageProxy>
}

export interface AcroFormPdfLoader {
  loadTemplate(year: number, formular: string): Promise<PdfDocumentProxy>
}

export const OFFICIAL_VORDRUCKE: ReadonlyArray<{ readonly id: string; readonly title: string; readonly short: string }> = [
  { id: 'est-1-a', title: 'Hauptvordruck ESt 1 A', short: 'ESt 1 A' },
  { id: 'anlage-n', title: 'Anlage N (Arbeitnehmer & Werbungskosten)', short: 'Anlage N' },
  { id: 'anlage-n-gre', title: 'Anlage N-Gre (Grenzgänger Schweiz)', short: 'Anlage N-Gre' },
  { id: 'anlage-vorsorgeaufwand', title: 'Anlage Vorsorgeaufwand', short: 'Vorsorge' },
  { id: 'anlage-kind', title: 'Anlage Kind', short: 'Anlage Kind' },
  { id: 'anlage-v', title: 'Anlage V (Vermietung)', short: 'Anlage V' },
  { id: 'anlage-kap', title: 'Anlage KAP (Kapitalerträge)', short: 'Anlage KAP' },
  { id: 'anlage-r', title: 'Anlage R (Renten)', short: 'Anlage R' },
  { id: 'anlage-sonderausgaben', title: 'Anlage Sonderausgaben', short: 'Sonderausg.' },
  { id: 'anlage-haushaltsnahe-aufwendungen', title: 'Anlage Haushaltsnahe Aufwendungen', short: 'Haushalt' },
  { id: 'anlage-aussergewoehnliche-belastungen', title: 'Anlage Außergewöhnliche Belastungen', short: 'Außerg. Bel.' },
  { id: 'anlage-av', title: 'Anlage AV (Riester)', short: 'Anlage AV' },
]

async function defaultLoadPdfTemplate(year: number, formular: string): Promise<PdfDocumentProxy> {
  const url = `${getApiClientBaseUrl()}/v1/steuerjahre/${year}/ausdruck/vorlage/${formular}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`Vordruck ${formular} (${year}) konnte nicht geladen werden (HTTP ${res.status})`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = workerMod
  const pdfMod = await import('pdfjs-dist/legacy/build/pdf.min.mjs')
  const loadingTask = pdfMod.getDocument({
    data: bytes,
    disableAutoFetch: true,
    isEvalSupported: false,
  })
  return (await loadingTask.promise) as PdfDocumentProxy
}

const DEFAULT_LOADER: AcroFormPdfLoader = {
  loadTemplate: defaultLoadPdfTemplate,
}

export function AcroFormLiveViewer({
  year,
  initialForm = 'est-1-a',
  liveValues,
  highlightedFieldId,
  onInspectField,
  onSaveAcroField,
  loader = DEFAULT_LOADER,
}: AcroFormViewerProps & { readonly loader?: AcroFormPdfLoader | undefined }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const [selectedForm, setSelectedForm] = useState<string>(initialForm)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [numPages, setNumPages] = useState<number>(1)
  const [zoom, setZoom] = useState<number>(1.25)
  const [annotations, setAnnotations] = useState<readonly AcroAnnotationBox[]>([])
  const [pageSize, setPageSize] = useState<{ readonly width: number; readonly height: number }>({ width: 595, height: 842 })
  const [focusedField, setFocusedField] = useState<string | null>(highlightedFieldId ?? null)
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [savingField, setSavingField] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const canvasHostRef = useRef<View | null>(null)

  useEffect(() => {
    if (highlightedFieldId) {
      setFocusedField(highlightedFieldId)
    }
  }, [highlightedFieldId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loader
      .loadTemplate(year, selectedForm)
      .then(async (doc) => {
        if (cancelled) return
        const safePage = Math.min(Math.max(1, pageNumber), doc.numPages)
        setNumPages(doc.numPages)
        if (safePage !== pageNumber) setPageNumber(safePage)

        const page = await doc.getPage(safePage)
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        setPageSize({ width: baseViewport.width, height: baseViewport.height })

        const rawAnnots = await page.getAnnotations()
        if (cancelled) return
        const txAnnots = rawAnnots.filter((a) => typeof a.fieldName === 'string' && a.fieldName.length > 0 && Array.isArray(a.rect))
        setAnnotations(txAnnots)

        if (Platform.OS === 'web' && typeof document !== 'undefined' && canvasHostRef.current) {
          const domNode = canvasHostRef.current as unknown as HTMLElement
          if (typeof domNode.querySelector === 'function') {
            let canvas = domNode.querySelector('canvas')
            if (!canvas) {
              canvas = document.createElement('canvas')
              domNode.innerHTML = ''
              domNode.appendChild(canvas)
            }
            const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2, 3)
            const renderViewport = page.getViewport({ scale: zoom * dpr })
            canvas.width = Math.floor(renderViewport.width)
            canvas.height = Math.floor(renderViewport.height)
            canvas.style.width = `${Math.floor(baseViewport.width * zoom)}px`
            canvas.style.height = `${Math.floor(baseViewport.height * zoom)}px`
            canvas.style.display = 'block'
            const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')
            if (!isJsdom) {
              const ctx = canvas.getContext('2d')
              if (ctx) {
                await page.render({ canvasContext: ctx, viewport: renderViewport }).promise
              }
            }
          }
        }
        if (!cancelled) setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Vordruck konnte nicht geladen werden.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year, selectedForm, pageNumber, zoom, loader])

  const activeFormMeta = OFFICIAL_VORDRUCKE.find((f) => f.id === selectedForm) ?? OFFICIAL_VORDRUCKE[0]!
  const filledCountOnForm = annotations.filter((a) => liveValues[a.fieldName] !== undefined).length
  const selectedFieldMeta = focusedField ? maskTargetForAcroField(focusedField) : null

  return (
    <Card style={styles.card}>
      <View style={styles.toolbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{`📄 Original BMF-Vordruck (AcroForm HD) · ${activeFormMeta.title}`}</Text>
          <Text style={styles.subtitle}>
            {`Seite ${pageNumber} von ${numPages} · ${annotations.length} AcroForm-Felder auf dieser Seite (${filledCountOnForm} befüllt) · Klick ins Feld springt direkt in die Eingabemaske`}
          </Text>
        </View>
        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            disabled={pageNumber <= 1}
            onPress={() => setPageNumber((p) => Math.max(1, p - 1))}
            style={[styles.controlBtn, pageNumber <= 1 ? styles.controlBtnDisabled : null]}
          >
            <Text style={styles.controlBtnText}>◀ Seite</Text>
          </Pressable>
          <Text style={styles.pageIndicator}>{`${pageNumber} / ${numPages}`}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={pageNumber >= numPages}
            onPress={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            style={[styles.controlBtn, pageNumber >= numPages ? styles.controlBtnDisabled : null]}
          >
            <Text style={styles.controlBtnText}>Seite ▶</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setZoom((z) => (z >= 1.75 ? 1.0 : Number((z + 0.25).toFixed(2))))}
            style={styles.controlBtn}
          >
            <Text style={styles.controlBtnText}>{`🔍 ${Math.round(zoom * 100)} %`}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.formChipsRow}>
        {OFFICIAL_VORDRUCKE.map((form) => (
          <Chip
            key={form.id}
            active={selectedForm === form.id}
            onPress={() => {
              setSelectedForm(form.id)
              setPageNumber(1)
            }}
          >
            {form.short}
          </Chip>
        ))}
      </View>

      {selectedFieldMeta && focusedField ? (
        <View style={styles.inspectorBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inspectorTitle}>
              {`Aktives AcroForm-Feld: ${focusedField} → ${selectedFieldMeta.label}`}
            </Text>
            <Text style={styles.inspectorValue}>
              {savingField === focusedField
                ? 'Speichere Änderung direkt in der Steuererklärung …'
                : (draftValues[focusedField] ?? liveValues[focusedField]) !== undefined
                  ? `Eingetragener Wert: ${(draftValues[focusedField] ?? liveValues[focusedField]) === true ? '✕ (Angekreuzt)' : String(draftValues[focusedField] ?? liveValues[focusedField])}`
                  : 'Derzeit leer im amtlichen Formular'}
            </Text>
          </View>
          {onSaveAcroField && liveValues[focusedField] !== true ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }}>
              <TextInput
                accessibilityLabel={`Direkteingabe ${selectedFieldMeta.label}`}
                value={draftValues[focusedField] ?? (typeof liveValues[focusedField] === 'string' ? liveValues[focusedField] : '')}
                placeholder="Wert direkt im Formular ändern …"
                onChangeText={(next) => setDraftValues((prev) => ({ ...prev, [focusedField]: next }))}
                onSubmitEditing={async () => {
                  const val = draftValues[focusedField]
                  if (val !== undefined) {
                    setSavingField(focusedField)
                    try {
                      await onSaveAcroField(focusedField, val)
                    } finally {
                      setSavingField(null)
                    }
                  }
                }}
                style={{
                  ...t.type.small,
                  color: t.color.tinte,
                  backgroundColor: t.color.karte,
                  borderWidth: 1,
                  borderColor: t.color.tinte,
                  borderRadius: t.radius.s,
                  paddingHorizontal: t.space.s2,
                  paddingVertical: 4,
                  minWidth: 150,
                }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={savingField === focusedField}
                onPress={async () => {
                  const val =
                    draftValues[focusedField] ??
                    (typeof liveValues[focusedField] === 'string' ? liveValues[focusedField] : '')
                  setSavingField(focusedField)
                  try {
                    await onSaveAcroField(focusedField, val)
                  } finally {
                    setSavingField(null)
                  }
                }}
                style={styles.jumpButton}
              >
                <Text style={styles.jumpButtonText}>✓ Direkt speichern</Text>
              </Pressable>
            </View>
          ) : null}
          {onInspectField ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onInspectField(selectedFieldMeta.screen, selectedFieldMeta.field, selectedFieldMeta.person ?? 'A')}
              style={styles.jumpButton}
            >
              <Text style={styles.jumpButtonText}>Ins Eingabefeld springen →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading ? <Text style={styles.statusText}>Lade hochauflösenden AcroForm-Vordruck …</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.sheetScrollWrapper}>
        <View
          style={{
            width: Math.floor(pageSize.width * zoom),
            height: Math.floor(pageSize.height * zoom),
            position: 'relative',
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: t.color.linie,
            alignSelf: 'center',
          }}
        >
          <View ref={canvasHostRef} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />

          {annotations.map((annot) => {
            const [x1, y1, x2, y2] = annot.rect
            const left = Math.min(x1, x2) * zoom
            const width = Math.abs(x2 - x1) * zoom
            const height = Math.abs(y2 - y1) * zoom
            const top = (pageSize.height - Math.max(y1, y2)) * zoom
            const rawVal = draftValues[annot.fieldName] ?? liveValues[annot.fieldName]
            const displayVal = rawVal === true ? '✕' : rawVal ?? ''
            const isFilled = rawVal !== undefined && rawVal !== ''
            const isFocused = focusedField === annot.fieldName
            const target = maskTargetForAcroField(annot.fieldName)
            const alignRight = annot.textAlignment === 2
            const alignCenter = annot.textAlignment === 1 || rawVal === true

            return (
              <Pressable
                key={annot.fieldName}
                accessibilityRole="button"
                accessibilityLabel={`${target.label}${displayVal ? `: ${displayVal}` : ''}`}
                onPress={() => {
                  setFocusedField(annot.fieldName)
                  if (onInspectField) {
                    onInspectField(target.screen, target.field, target.person ?? 'A')
                  }
                }}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: Math.max(12, width),
                  height: Math.max(12, height),
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                  borderWidth: isFocused ? 2 : 1,
                  borderColor: isFocused ? t.color.funkeTinte : isFilled ? t.color.tinte : 'rgba(37, 99, 235, 0.35)',
                  backgroundColor: isFocused
                    ? 'rgba(201, 242, 41, 0.32)'
                    : isFilled
                      ? 'rgba(201, 242, 41, 0.14)'
                      : 'rgba(37, 99, 235, 0.04)',
                }}
              >
                {onSaveAcroField && rawVal !== true && isFocused ? (
                  <TextInput
                    accessibilityLabel={`Inline AcroForm ${annot.fieldName}`}
                    value={String(displayVal)}
                    onChangeText={(next) => setDraftValues((prev) => ({ ...prev, [annot.fieldName]: next }))}
                    onBlur={async () => {
                      const val = draftValues[annot.fieldName]
                      if (val !== undefined) {
                        await onSaveAcroField(annot.fieldName, val)
                      }
                    }}
                    style={{
                      ...t.type.meta,
                      color: '#0D0F08',
                      fontWeight: '700',
                      padding: 0,
                      margin: 0,
                      textAlign: alignRight ? 'right' : 'left',
                    }}
                  />
                ) : (
                  <Text
                    numberOfLines={1}
                    style={{
                      ...t.type.meta,
                      color: '#0D0F08',
                      fontWeight: isFilled ? '700' : '400',
                      textAlign: alignCenter ? 'center' : alignRight ? 'right' : 'left',
                    }}
                  >
                    {displayVal}
                  </Text>
                )}
              </Pressable>
            )
          })}
        </View>
      </View>
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = {
    borderWidth: t.space.kontur,
    borderColor: t.color.linie,
    padding: t.space.s3,
    gap: t.space.s3,
  }
  const toolbar: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const title: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
  }
  const subtitle: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
    marginTop: 2,
  }
  const controlsRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
  }
  const controlBtn: ViewStyle = {
    paddingHorizontal: t.space.s2,
    paddingVertical: 4,
    borderRadius: t.radius.s,
    borderWidth: 1,
    borderColor: t.color.linie,
    backgroundColor: t.color.grund,
  }
  const controlBtnDisabled: ViewStyle = {
    opacity: 0.4,
  }
  const controlBtnText: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte,
    fontWeight: '700',
  }
  const pageIndicator: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
  }
  const formChipsRow: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.s2,
  }
  const inspectorBar: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: t.space.s2,
    padding: t.space.s2,
    borderRadius: t.radius.s,
    backgroundColor: t.color.funkeWeich,
    borderWidth: 1,
    borderColor: t.color.tinte,
  }
  const inspectorTitle: TextStyle = {
    ...t.type.label,
    color: t.color.tinte,
  }
  const inspectorValue: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
  }
  const jumpButton: ViewStyle = {
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.tinte,
  }
  const jumpButtonText: TextStyle = {
    ...t.type.meta,
    color: t.color.grund,
    fontWeight: '700',
  }
  const statusText: TextStyle = {
    ...t.type.small,
    color: t.color.tinte2,
  }
  const errorText: TextStyle = {
    ...t.type.small,
    color: t.color.fehler,
  }
  const sheetScrollWrapper: ViewStyle = {
    overflow: 'scroll',
    paddingVertical: t.space.s2,
  }
  return {
    card,
    toolbar,
    title,
    subtitle,
    controlsRow,
    controlBtn,
    controlBtnDisabled,
    controlBtnText,
    pageIndicator,
    formChipsRow,
    inspectorBar,
    inspectorTitle,
    inspectorValue,
    jumpButton,
    jumpButtonText,
    statusText,
    errorText,
    sheetScrollWrapper,
  }
}
