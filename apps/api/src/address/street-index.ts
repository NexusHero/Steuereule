// In-memory street search over the OpenStreetMap street extract (ADR-0065). The data is the same
// file the PLZ table is built from (scripts/plz-data/build-postal-codes.mjs): one row per street
// with its postal code, place and Regionalschlüssel. It carries no house numbers and no
// coordinates, so a hit fills Straße, PLZ and Ort — the house number is whatever the user typed.

export interface StreetHit {
  readonly street: string
  readonly postalCode: string
  readonly city: string
  /** Bundesland code as in `GERMAN_STATES` (@steuereule/core), null for an unknown Regionalschlüssel. */
  readonly state: string | null
}

export interface StreetSearchResult {
  /** A house number found in the query ("Hauptstr. 12a, Köln" → "12a"), for the form to take over. */
  readonly houseNumber: string | null
  readonly hits: readonly StreetHit[]
}

export interface StreetSearchOptions {
  /** The postal code the form already holds: its streets come first, others still follow. */
  readonly postalCode?: string
  readonly limit?: number
}

/** First two digits of the Regionalschlüssel → Bundesland. */
const STATE_BY_REGIONAL_KEY: Readonly<Record<string, string>> = {
  '01': 'SH', '02': 'HH', '03': 'NI', '04': 'HB', '05': 'NW', '06': 'HE', '07': 'RP', '08': 'BW',
  '09': 'BY', '10': 'SL', '11': 'BE', '12': 'BB', '13': 'MV', '14': 'SN', '15': 'ST', '16': 'TH',
}

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20
/** Below this, a prefix matches a large share of all streets and the answer helps nobody. */
const MIN_STREET_KEY_LENGTH = 3
/** Upper bound on rows looked at per attempt, so one broad prefix cannot stall the event loop. */
const MAX_SCANNED_ROWS = 200_000
const POSTAL_CODE = /^\d{5}$/
const HOUSE_NUMBER = /^\d{1,4}[a-z]?$/

/** Lower-case, umlauts spelled out, everything but letters and digits dropped. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '')
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (char === '"') quoted = false
      else current += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      fields.push(current)
      current = ''
    } else current += char
  }
  fields.push(current)
  return fields
}

interface Place {
  readonly postalCode: string
  readonly city: string
  readonly cityKey: string
  readonly state: string | null
  /** Streets of the whole place across its postal codes — the stand-in for how big it is. */
  readonly size: { streets: number }
}

interface ParsedQuery {
  readonly words: readonly string[]
  readonly postalCode: string | null
}

/** The source writes "Hauptstr." and "Str. des 17. Juni"; a tax form wants the word spelled out. */
function spellOutStreet(name: string): string {
  return name.replace(/([Ss])tr\.(?![\p{L}\d])/gu, (_, initial: string) => `${initial}traße`)
}

export class StreetIndex {
  private constructor(
    /** Distinct street names, sorted by their search key; a prefix is one contiguous range. */
    private readonly streets: readonly string[],
    private readonly keys: readonly string[],
    /** `rowStart[i]`..`rowStart[i + 1]` are the places street `i` occurs in. */
    private readonly rowStart: Int32Array,
    private readonly rowPlace: Int32Array,
    private readonly places: readonly Place[],
  ) {}

  static fromCsv(csv: string): StreetIndex {
    const places: Place[] = []
    const placeIds = new Map<string, number>()
    const sizes = new Map<string, { streets: number }>()
    /** Spelling → its search key and the places it occurs in. Two spellings never share an entry. */
    const byStreet = new Map<string, { key: string; places: Set<number> }>()
    let from = csv.indexOf('\n') + 1
    while (from > 0 && from < csv.length) {
      let to = csv.indexOf('\n', from)
      if (to === -1) to = csv.length
      const [name, postalCode, city, regionalKey] = parseCsvLine(csv.slice(from, to).trimEnd())
      from = to + 1
      const street = spellOutStreet(name?.trim() ?? '')
      if (street === '' || !city || !postalCode || !POSTAL_CODE.test(postalCode)) continue
      const placeKey = `${postalCode}|${city}`
      let place = placeIds.get(placeKey)
      if (place === undefined) {
        place = places.length
        placeIds.set(placeKey, place)
        const state = STATE_BY_REGIONAL_KEY[(regionalKey ?? '').slice(0, 2)] ?? null
        const sizeKey = `${state}|${city}`
        const size = sizes.get(sizeKey) ?? { streets: 0 }
        sizes.set(sizeKey, size)
        places.push({ postalCode, city, cityKey: fold(city), state, size })
      }
      const entry = byStreet.get(street)
      if (entry === undefined) {
        const key = fold(street)
        if (key === '') continue
        byStreet.set(street, { key, places: new Set([place]) })
      } else if (!entry.places.has(place)) entry.places.add(place)
      else continue
      places[place]!.size.streets += 1
    }

    const sorted = [...byStreet.entries()].sort(([, a], [, b]) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    const streets: string[] = []
    const keys: string[] = []
    const rowStart = new Int32Array(sorted.length + 1)
    let rowCount = 0
    for (const [, entry] of sorted) rowCount += entry.places.size
    const rowPlace = new Int32Array(rowCount)
    let at = 0
    sorted.forEach(([street, entry], i) => {
      streets.push(street)
      keys.push(entry.key)
      rowStart[i] = at
      for (const place of entry.places) rowPlace[at++] = place
    })
    rowStart[sorted.length] = at
    return new StreetIndex(streets, keys, rowStart, rowPlace, places)
  }

  /** Number of distinct street × postal code × place entries. */
  get size(): number {
    return this.rowPlace.length
  }

  search(query: string, options: StreetSearchOptions = {}): StreetSearchResult {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
    const preferred = options.postalCode && POSTAL_CODE.test(options.postalCode) ? options.postalCode : null
    const parsed = parseQuery(query)

    const asTyped = this.match(parsed, preferred, limit)
    if (asTyped.length > 0) return { houseNumber: null, hits: asTyped }

    // Only when the words do not name a street as they stand is a number read as a house number —
    // "Straße des 17. Juni" must stay whole. The last number wins: "Straße des 17. Juni 135".
    for (let i = parsed.words.length - 1; i >= 1; i -= 1) {
      const word = parsed.words[i]!
      if (!HOUSE_NUMBER.test(word)) continue
      const hits = this.match({ ...parsed, words: parsed.words.filter((_, at) => at !== i) }, preferred, limit)
      if (hits.length > 0) return { houseNumber: word, hits }
    }
    return { houseNumber: null, hits: [] }
  }

  /** Tries the longest street name first: "berliner allee düsseldorf" is street + place, not one name. */
  private match(query: ParsedQuery, preferred: string | null, limit: number): StreetHit[] {
    for (let streetWords = query.words.length; streetWords >= 1; streetWords -= 1) {
      const streetKey = query.words.slice(0, streetWords).join('')
      if (streetKey.length < MIN_STREET_KEY_LENGTH) continue
      const cityKey = query.words.slice(streetWords).join('')
      const hits = this.matchPrefix(streetKey, cityKey, query.postalCode, preferred, limit)
      if (hits.length > 0) return hits
    }
    return []
  }

  private matchPrefix(streetKey: string, cityKey: string, postalCode: string | null, preferred: string | null, limit: number): StreetHit[] {
    const found: { street: number; place: Place }[] = []
    let scanned = 0
    for (let street = this.lowerBound(streetKey); street < this.keys.length && scanned < MAX_SCANNED_ROWS; street += 1) {
      if (!this.keys[street]!.startsWith(streetKey)) break
      for (let row = this.rowStart[street]!; row < this.rowStart[street + 1]!; row += 1) {
        scanned += 1
        const place = this.places[this.rowPlace[row]!]!
        if (postalCode !== null && place.postalCode !== postalCode) continue
        if (cityKey !== '' && !place.cityKey.startsWith(cityKey)) continue
        found.push({ street, place })
      }
    }
    // "hauptstr" means Hauptstraße: the full name comes before Hauptstraat or Hauptstraßenbrücke.
    const fullName = streetKey.endsWith('str') ? `${streetKey}asse` : streetKey
    const rank = (place: Place) => (place.postalCode === preferred ? 0 : 1)
    const exact = (street: number) => (this.keys[street] === fullName ? 0 : 1)
    found.sort(
      (a, b) =>
        rank(a.place) - rank(b.place) ||
        exact(a.street) - exact(b.street) ||
        b.place.size.streets - a.place.size.streets ||
        this.keys[a.street]!.length - this.keys[b.street]!.length ||
        a.street - b.street ||
        a.place.postalCode.localeCompare(b.place.postalCode),
    )
    return found.slice(0, limit).map(({ street, place }) => ({
      street: this.streets[street]!,
      postalCode: place.postalCode,
      city: place.city,
      state: place.state,
    }))
  }

  private lowerBound(key: string): number {
    let low = 0
    let high = this.keys.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (this.keys[mid]! < key) low = mid + 1
      else high = mid
    }
    return low
  }
}

function parseQuery(query: string): ParsedQuery {
  const words: string[] = []
  let postalCode: string | null = null
  for (const raw of query.split(/[\s,;]+/)) {
    const folded = fold(raw)
    if (folded === '') continue
    // "Str. des 17. Juni": a lone "str" is the word itself, not the start of a name.
    const word = folded === 'str' ? 'strasse' : folded
    if (postalCode === null && POSTAL_CODE.test(word)) postalCode = word
    else words.push(word)
  }
  return { words, postalCode }
}
