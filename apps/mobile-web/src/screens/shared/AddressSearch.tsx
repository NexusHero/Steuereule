import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { addressControllerSearch, type AddressHitDto } from '@steuereule/api-client'
import { Feld, Input, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

export interface PickedAddress {
  readonly street: string
  readonly postalCode: string
  readonly city: string
  /** Digits of the house number typed into the search, null if none was typed. */
  readonly houseNumber: string | null
  /** Letter after the digits ("12a" → "a"), null if none. */
  readonly houseNumberSuffix: string | null
}

export interface AddressSearchProps {
  /** Postal code the form already holds; its streets are listed first. */
  readonly postalCode: string
  readonly onPick: (address: PickedAddress) => void
  readonly testIDPrefix: string
}

/** Shorter queries match too many streets to help; the server answers nothing for them anyway. */
const MIN_QUERY_LENGTH = 3
/** Pause after the last keystroke before asking, so one word is one request, not one per letter. */
const DEBOUNCE_MS = 250

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'found'; readonly hits: readonly AddressHitDto[]; readonly houseNumber: string | null }
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable' }

/**
 * One line for the whole address (ADR-0065): the streets come from our own server, a pick fills
 * Straße, Hausnummer, PLZ and Ort. The fields below stay editable and are the fallback whenever
 * the search has no answer.
 */
export function AddressSearch({ postalCode, onPick, testIDPrefix }: AddressSearchProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  /** Only the answer to the latest request may be shown; a slow earlier one is dropped. */
  const latestRequest = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    const request = ++latestRequest.current
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ kind: 'idle' })
      return
    }
    const timer = setTimeout(() => {
      addressControllerSearch({ query: trimmed, ...(/^\d{5}$/.test(postalCode) ? { postalCode } : {}) })
        .then((response) => {
          if (request !== latestRequest.current) return
          if (response.status !== 200 || !response.data.available) setState({ kind: 'unavailable' })
          else if (response.data.hits.length === 0) setState({ kind: 'none' })
          else setState({ kind: 'found', hits: response.data.hits, houseNumber: response.data.houseNumber })
        })
        .catch(() => {
          if (request === latestRequest.current) setState({ kind: 'unavailable' })
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, postalCode])

  function pick(hit: AddressHitDto, houseNumber: string | null) {
    const parts = houseNumber ? /^(\d+)([a-z]?)$/i.exec(houseNumber) : null
    onPick({
      street: hit.street,
      postalCode: hit.postalCode,
      city: hit.city,
      houseNumber: parts ? parts[1]! : null,
      houseNumberSuffix: parts && parts[2] ? parts[2] : null,
    })
    latestRequest.current += 1
    setQuery('')
    setState({ kind: 'idle' })
  }

  return (
    <View style={styles.box}>
      <Feld label={tr('adresssuche.label')}>
        <Input
          value={query}
          onChange={setQuery}
          placeholder={tr('adresssuche.placeholder')}
          accessibilityLabel={tr('adresssuche.label')}
          autoComplete="off"
          testID={`${testIDPrefix}-adresssuche`}
        />
      </Feld>
      {state.kind === 'idle' ? <Text style={styles.hint}>{tr('adresssuche.hinweis')}</Text> : null}
      {state.kind === 'none' ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {tr('adresssuche.keineTreffer')}
        </Text>
      ) : null}
      {state.kind === 'unavailable' ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {tr('adresssuche.nichtVerfuegbar')}
        </Text>
      ) : null}
      {state.kind === 'found' ? (
        <View style={styles.list} testID={`${testIDPrefix}-adresssuche-liste`}>
          {state.hits.map((hit, index) => {
            const line = `${hit.street}${state.houseNumber ? ` ${state.houseNumber}` : ''}, ${hit.postalCode} ${hit.city}`
            return (
              <Pressable
                key={`${hit.street}|${hit.postalCode}|${hit.city}`}
                accessibilityRole="button"
                accessibilityLabel={tr('adresssuche.treffer', { adresse: line })}
                onPress={() => pick(hit, state.houseNumber)}
                style={[styles.row, index > 0 ? styles.rowDivider : null]}
                testID={`${testIDPrefix}-adresssuche-treffer-${index}`}
              >
                <Text style={styles.rowText}>{line}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: { marginBottom: t.space.s3 } as ViewStyle,
    hint: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginTop: -t.space.s2 } as TextStyle,
    list: {
      marginTop: -t.space.s2,
      borderWidth: 2,
      borderColor: t.color.tinte,
      borderRadius: t.radius.s,
      backgroundColor: t.color.karte,
      overflow: 'hidden',
    } as ViewStyle,
    row: { minHeight: 48, justifyContent: 'center', paddingHorizontal: t.space.s4, paddingVertical: t.space.s3 } as ViewStyle,
    rowDivider: { borderTopWidth: 1, borderTopColor: t.color.tinte2 } as ViewStyle,
    rowText: { fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
  }
}
