import { apiFetch } from '../../net/apiFetch'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, TextInput, View, type TextStyle, type ViewInstance, type ViewStyle } from 'react-native'
import { ApiError, getApiClientBaseUrl, type LiveFormDto, type LiveFormInstanceDto } from '@steuereule/api-client'
import type { Screen } from '@steuereule/core'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Card, Chip, useTheme, type UiTheme, controlLine } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'
import { maskTargetForAcroField } from '../shared/formLineMapping'
import { acroEditSpec, type AcroEditSpec, type AcroInstanceContext, type AcroSaveOutcome, type EditableAcroField } from './acroFieldEditing'
import type { SaveAcroField } from './useAcroFieldSaver'

export interface AcroFormViewerProps {
  readonly year: number
  readonly initialForm?: string | undefined
  /** What the printout prints, per Vordruck and copy (`GET ausdruck/werte`). */
  readonly liveForms: readonly LiveFormDto[]
  readonly highlightedFieldId?: string | undefined
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
  /** Present only in expert mode; writes a directly editable field (see acroFieldEditing.ts) back to the return. */
  readonly onSaveAcroField?: SaveAcroField | undefined
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
  const res = await apiFetch(url, { credentials: 'include' })
  if (!res.ok) {
    // NC-12: a refusal is an ApiError, said in the shared wording, never „HTTP 404“.
    throw new ApiError(res.status, await res.json().catch(() => null), res.headers)
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
  liveForms,
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
  // Until the user picks a zoom, the page is fitted to the width it gets (a narrow mask, a wide screen).
  const [fitToWidth, setFitToWidth] = useState(true)
  const [annotations, setAnnotations] = useState<readonly AcroAnnotationBox[]>([])
  const [pageSize, setPageSize] = useState<{ readonly width: number; readonly height: number }>({ width: 595, height: 842 })
  const [focusedField, setFocusedField] = useState<string | null>(highlightedFieldId ?? null)
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [savingField, setSavingField] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ readonly field: string; readonly outcome: AcroSaveOutcome } | null>(null)
  const savingRef = useRef(false)
  const [copyIndex, setCopyIndex] = useState(0)
  const { t: tr } = useTranslation(APP_NS)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<unknown>(null)
  const [reload, setReload] = useState(0)
  const failureMessage = useApiFailureMessage()
  const canvasHostRef = useRef<ViewInstance | null>(null)

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
        setError(err ?? new Error('template'))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year, selectedForm, pageNumber, zoom, loader, reload])

  const activeFormMeta = OFFICIAL_VORDRUCKE.find((f) => f.id === selectedForm) ?? OFFICIAL_VORDRUCKE[0]!
  const copies = liveForms.find((form) => form.formular === selectedForm)?.instances ?? []
  const copy = copies[Math.min(copyIndex, Math.max(0, copies.length - 1))]
  const liveValues: Readonly<Record<string, string | true>> = copy?.values ?? {}
  const copyContext: AcroInstanceContext = { person: copy?.person ?? null, entityId: copy?.entityId ?? null, copies: Math.max(1, copies.length) }
  /** A draft belongs to one copy: switching the copy or the form starts clean. */
  const selectCopy = (index: number) => {
    setCopyIndex(index)
    setDraftValues({})
    setFeedback(null)
  }
  const filledCountOnForm = annotations.filter((a) => liveValues[a.fieldName] !== undefined).length
  const selectedFieldMeta = focusedField ? maskTargetForAcroField(focusedField) : null
  const focusedSpec = focusedField ? acroEditSpec(focusedField, copyContext) : null
  const canEdit = (fieldId: string): boolean =>
    onSaveAcroField !== undefined && liveValues[fieldId] !== true && isEditable(acroEditSpec(fieldId, copyContext))
  const storedText = (fieldId: string): string => {
    const stored = liveValues[fieldId]
    return typeof stored === 'string' ? stored : ''
  }
  const dropDraft = (fieldId: string) =>
    setDraftValues((prev) => {
      const { [fieldId]: _dropped, ...rest } = prev
      return rest
    })

  /** One save path for Enter, the button and leaving the inline field; never two saves at once. */
  async function commit(fieldId: string) {
    const draft = draftValues[fieldId]
    if (!onSaveAcroField || draft === undefined || savingRef.current) return
    if (draft.trim() === storedText(fieldId)) {
      dropDraft(fieldId)
      return
    }
    savingRef.current = true
    setSavingField(fieldId)
    setFeedback(null)
    let outcome: AcroSaveOutcome
    try {
      outcome = await onSaveAcroField(fieldId, draft, copyContext)
    } catch {
      outcome = { kind: 'failed' }
    } finally {
      savingRef.current = false
      setSavingField(null)
    }
    // An invalid input stays for correcting; otherwise the stored value is the truth again
    // (the new one after a save, the previous one after a failure).
    if (outcome.kind !== 'invalid') dropDraft(fieldId)
    setFeedback({ field: fieldId, outcome })
  }

  const feedbackText = (outcome: AcroSaveOutcome): string | null => {
    switch (outcome.kind) {
      case 'saved':
        return tr('ausdruck.direkteingabe.gespeichert')
      case 'cleared':
        return tr('ausdruck.direkteingabe.geleert')
      case 'invalid':
        return tr(`ausdruck.direkteingabe.ungueltig.${outcome.reason}`)
      case 'failed':
        // C-33: a 429 names its wait, a lost session says so; the previous value stays.
        return outcome.error === undefined ? tr('ausdruck.direkteingabe.fehler') : `${tr('ausdruck.direkteingabe.fehler')} ${failureMessage(outcome.error, { unknown: '' })}`.trim()
      case 'not-editable':
        return tr('ausdruck.direkteingabe.nurMaske')
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.toolbar}>
        <View style={styles.titleColumn}>
          <Text style={styles.title}>{`Original BMF-Vordruck (AcroForm HD) · ${activeFormMeta.title}`}</Text>
          <Text style={styles.subtitle}>
            {`Seite ${pageNumber} von ${numPages} · ${annotations.length} AcroForm-Felder auf dieser Seite (${filledCountOnForm} befüllt) · ${
              onSaveAcroField ? 'Mit ✎ markierte Felder änderst du hier, die übrigen in ihrer Eingabemaske' : 'Klick ins Feld springt direkt in die Eingabemaske'
            }`}
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
            onPress={() => {
              setFitToWidth(false)
              setZoom((z) => (z >= 1.75 ? 1.0 : Number((z + 0.25).toFixed(2))))
            }}
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
              selectCopy(0)
            }}
          >
            {form.short}
          </Chip>
        ))}
      </View>

      {copies.length > 1 ? (
        <View style={styles.formChipsRow} testID="acro-copies">
          {copies.map((instance, index) => (
            <Chip key={instance.entityId ?? `${instance.person ?? 'x'}-${index}`} active={copy === instance} onPress={() => selectCopy(index)}>
              {copyLabel(instance, index, tr)}
            </Chip>
          ))}
        </View>
      ) : null}

      {selectedFieldMeta && focusedField ? (
        <View style={styles.inspectorBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inspectorTitle}>
              {`Aktives AcroForm-Feld: ${focusedField} → ${selectedFieldMeta.label}`}
            </Text>
            <Text style={styles.inspectorValue}>
              {savingField === focusedField
                ? tr('ausdruck.direkteingabe.speichert')
                : liveValues[focusedField] !== undefined
                  ? `Eingetragener Wert: ${liveValues[focusedField] === true ? '✕ (Angekreuzt)' : String(liveValues[focusedField])}`
                  : 'Derzeit leer im amtlichen Formular'}
            </Text>
            {onSaveAcroField && focusedSpec?.kind === 'derived' ? (
              <Text style={styles.inspectorValue} testID="acro-derived-hint">
                {tr('ausdruck.direkteingabe.berechnet', { sources: focusedSpec.sources.join(', ') })}
              </Text>
            ) : null}
            {onSaveAcroField && focusedSpec === null ? (
              <Text style={styles.inspectorValue}>{tr('ausdruck.direkteingabe.nurMaske')}</Text>
            ) : null}
            {feedback && feedback.field === focusedField ? (
              <Text
                accessibilityLiveRegion="polite"
                testID="acro-save-feedback"
                style={feedback.outcome.kind === 'failed' || feedback.outcome.kind === 'invalid' ? styles.errorText : styles.inspectorValue}
              >
                {feedbackText(feedback.outcome)}
              </Text>
            ) : null}
          </View>
          {canEdit(focusedField) && isEditable(focusedSpec) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }}>
              <TextInput
                accessibilityLabel={tr('ausdruck.direkteingabe.eingabeLabel', { label: selectedFieldMeta.label })}
                value={draftValues[focusedField] ?? storedText(focusedField)}
                placeholder={
                  focusedSpec.kind === 'direct'
                    ? tr('ausdruck.direkteingabe.platzhalter', { unit: focusedSpec.unit === 'CHF' ? 'Franken' : 'Euro' })
                    : tr('ausdruck.direkteingabe.platzhalterText')
                }
                inputMode={focusedSpec.kind === 'direct' || focusedSpec.rule !== 'text' ? 'numeric' : 'text'}
                editable={savingField !== focusedField}
                onChangeText={(next) => setDraftValues((prev) => ({ ...prev, [focusedField]: next }))}
                onSubmitEditing={() => void commit(focusedField)}
                style={{
                  ...t.type.small,
                  color: t.color.tinte,
                  backgroundColor: t.color.karte,
                  borderWidth: 1,
                  borderColor: controlLine(t),
                  borderRadius: t.radius.s,
                  paddingHorizontal: t.space.s2,
                  paddingVertical: 4,
                  minWidth: 150,
                }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={savingField === focusedField || draftValues[focusedField] === undefined}
                onPress={() => void commit(focusedField)}
                style={styles.jumpButton}
              >
                <Text style={styles.jumpButtonText}>{tr('ausdruck.direkteingabe.speichern')}</Text>
              </Pressable>
            </View>
          ) : null}
          {onInspectField ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onInspectField(selectedFieldMeta.screen, selectedFieldMeta.field, selectedFieldMeta.person ?? copy?.person ?? 'A')}
              style={styles.jumpButton}
            >
              <Text style={styles.jumpButtonText}>Ins Eingabefeld springen →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading ? <Text style={styles.statusText}>Lade hochauflösenden AcroForm-Vordruck …</Text> : null}
      {error !== null ? (
        <View accessibilityRole="alert" testID="acro-vorlage-fehler">
          <Text style={styles.errorText}>
            {`${tr('ausdruck.vorlageLadefehler')} ${failureMessage(error, { 'not-found': tr('ausdruck.vorlageUnbekannt'), unknown: '' })}`.trim()}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setReload((n) => n + 1)} testID="acro-vorlage-erneut">
            <Text style={styles.errorText}>{tr('apiFehler.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {onSaveAcroField ? (
        <View style={styles.legendRow} testID="acro-legend">
          <Text style={[styles.legendItem, styles.legendEditable]}>{tr('formular.legende.editierbar')}</Text>
          <Text style={[styles.legendItem, styles.legendDerived]}>{tr('formular.legende.berechnet')}</Text>
          <Text style={styles.legendItem}>{tr('formular.legende.maske')}</Text>
        </View>
      ) : null}

      <View
        style={styles.sheetScrollWrapper}
        onLayout={(event) => {
          if (!fitToWidth) return
          const available = event.nativeEvent.layout.width - 2 * t.space.s2
          const fitted = Math.round(Math.min(2, Math.max(0.6, available / pageSize.width)) * 20) / 20
          if (Number.isFinite(fitted) && fitted !== zoom) setZoom(fitted)
        }}
      >
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
            // In expert mode every field shows what it is: editable here, computed, or only in its mask.
            const spec = onSaveAcroField ? acroEditSpec(annot.fieldName, copyContext) : null
            const editableHere = canEdit(annot.fieldName)
            const computed = spec?.kind === 'derived'
            const alignRight = annot.textAlignment === 2
            const alignCenter = annot.textAlignment === 1 || rawVal === true

            return (
              <Pressable
                key={annot.fieldName}
                accessibilityRole="button"
                accessibilityLabel={`${target.label}${displayVal ? `: ${displayVal}` : ''}${
                  editableHere ? ` · ${tr('formular.legende.editierbar')}` : computed ? ` · ${tr('formular.legende.berechnet')}` : ''
                }`}
                onPress={() => {
                  setFocusedField(annot.fieldName)
                  // In expert mode a click only selects the field: editable ones open in place, the
                  // others show why they are locked; leaving for the mask is the inspector's button.
                  if (onInspectField && !onSaveAcroField) {
                    onInspectField(target.screen, target.field, target.person ?? copy?.person ?? 'A')
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
                  // Room for the ✎ / 🔒 marker inside the box, so it is never clipped at the page edge.
                  paddingLeft: editableHere || computed ? 16 : 2,
                  borderWidth: isFocused || editableHere ? 2 : 1,
                  borderStyle: computed ? 'dashed' : 'solid',
                  borderColor: isFocused || editableHere ? t.color.funkeTinte : computed ? t.color.tinte2 : isFilled ? t.color.tinte : 'rgba(37, 99, 235, 0.35)',
                  backgroundColor: isFocused
                    ? 'rgba(201, 242, 41, 0.32)'
                    : editableHere
                      ? 'rgba(201, 242, 41, 0.22)'
                      : computed
                        ? 'rgba(13, 15, 8, 0.05)'
                        : isFilled
                          ? // In expert mode only editable fields carry the Funke tint, so they stand out.
                            onSaveAcroField
                            ? 'rgba(13, 15, 8, 0.03)'
                            : 'rgba(201, 242, 41, 0.14)'
                          : 'rgba(37, 99, 235, 0.04)',
                }}
                testID={editableHere ? `acro-field-editable-${annot.fieldName}` : computed ? `acro-field-computed-${annot.fieldName}` : undefined}
              >
                {editableHere || computed ? (
                  <Text aria-hidden={true} style={styles.fieldBadge}>
                    {editableHere ? '✎' : '🔒'}
                  </Text>
                ) : null}
                {isFocused && canEdit(annot.fieldName) ? (
                  <TextInput
                    accessibilityLabel={tr('ausdruck.direkteingabe.inlineLabel', { field: annot.fieldName })}
                    value={String(displayVal)}
                    inputMode={acroEditSpec(annot.fieldName, copyContext)?.kind === 'direct' ? 'numeric' : 'text'}
                    editable={savingField !== annot.fieldName}
                    onChangeText={(next) => setDraftValues((prev) => ({ ...prev, [annot.fieldName]: next }))}
                    onSubmitEditing={() => void commit(annot.fieldName)}
                    onBlur={() => void commit(annot.fieldName)}
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
  // A real basis width: with `flex: 1` (basis 0) the row never wraps and the title shrinks to one letter per line.
  const titleColumn: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0 }
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
    borderColor: controlLine(t),
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
    borderColor: t.color.linie,
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
  const legendRow: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s3 }
  const legendItem: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
    paddingHorizontal: t.space.s2,
    paddingVertical: 2,
    borderRadius: t.radius.s,
    borderWidth: 1,
    borderColor: t.color.linieWeich,
  }
  const legendEditable: TextStyle = { color: t.color.tinte, borderColor: t.color.funkeTinte, borderWidth: 2, backgroundColor: 'rgba(201, 242, 41, 0.22)' }
  const legendDerived: TextStyle = { borderStyle: 'dashed', borderColor: t.color.tinte2, backgroundColor: 'rgba(13, 15, 8, 0.05)' }
  const fieldBadge: TextStyle = { ...t.type.meta, position: 'absolute', left: 3, top: 0, bottom: 0, textAlignVertical: 'center', color: t.color.tinte }
  const sheetScrollWrapper: ViewStyle = {
    overflow: 'scroll',
    paddingVertical: t.space.s2,
  }
  return {
    card,
    toolbar,
    titleColumn,
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
    legendRow,
    legendItem,
    legendEditable,
    legendDerived,
    fieldBadge,
  }
}

function isEditable(spec: AcroEditSpec | null): spec is EditableAcroField {
  return spec !== null && spec.kind !== 'derived'
}

/** Names a printed copy so the user knows whose Anlage they are looking at. */
function copyLabel(instance: LiveFormInstanceDto, index: number, tr: TFunction<typeof APP_NS>): string {
  if (instance.person) return tr('ausdruck.exemplar.person', { person: instance.person })
  const childName = instance.values['anlKind.vorname']
  if (typeof childName === 'string') return tr('ausdruck.exemplar.kind', { name: childName })
  const street = instance.values['anlV.strasse']
  if (typeof street === 'string') return tr('ausdruck.exemplar.objekt', { name: street })
  return tr('ausdruck.exemplar.allgemein', { nummer: index + 1 })
}
