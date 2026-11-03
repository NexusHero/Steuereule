// ADR-0052 §6/§7 — die Kennzeichnungs-Schicht aus ADR-0049, verallgemeinert auf jede Maske: jeder
// Wert, den nicht der Nutzer selbst eingetragen hat (Jahresübernahme, Assistent, Beleg), trägt seine
// Herkunft und bleibt unbestätigt, bis der Nutzer seine Anlage bestätigt. Kein Eintrag heißt: der
// Nutzer hat den Wert selbst eingetragen (wie `Posten.unbestaetigt`: absent = bestätigt).
//
// Pure, no I/O (ADR-0004). Werte sind die gespeicherten Feld-Strings der Masken (`null` = offen),
// damit ein Vergleich nie an Formatierung scheitert.

export type Herkunft =
  | { readonly art: 'nutzer' }
  | { readonly art: 'uebernahme'; readonly vorjahr: number }
  | { readonly art: 'assistent'; readonly name: string; readonly belegId?: string }
  | { readonly art: 'beleg'; readonly belegId: string }

export interface Vorschlag {
  readonly wert: string | null
  readonly herkunft: Herkunft
}

export interface Kennzeichnung {
  readonly key: string
  readonly herkunft: Herkunft
  readonly bestaetigt: boolean
  /** Der Wert, auf den sich die Kennzeichnung bezieht (zum Erkennen, ob er sich geändert hat). */
  readonly wert: string | null
  /** ADR-0052 §7: ein Wert, der einen geschützten Wert nicht überschreiben durfte. */
  readonly vorschlag: Vorschlag | null
}

export const MASKEN = ['profil', 'stammdaten', 'kopplung', 'interview', 'lstb', 'chLohnausweis', 'rente', 'kapital', 'vermietung', 'kind'] as const
export type Maske = (typeof MASKEN)[number]

export const ANLAGEN = ['hauptvordruck', 'anlageN', 'anlageNGre', 'anlageR', 'anlageKap', 'anlageV', 'anlageKind'] as const
export type Anlage = (typeof ANLAGEN)[number]

const ANLAGE_JE_MASKE: Readonly<Record<Maske, Anlage>> = {
  profil: 'hauptvordruck',
  stammdaten: 'hauptvordruck',
  kopplung: 'hauptvordruck',
  interview: 'hauptvordruck',
  lstb: 'anlageN',
  chLohnausweis: 'anlageNGre',
  rente: 'anlageR',
  kapital: 'anlageKap',
  vermietung: 'anlageV',
  kind: 'anlageKind',
}

/** Profil und Stammdaten gelten für alle Jahre; ihre Kennzeichnungen liegen unter diesem Jahr. */
export const JAHRESUNABHAENGIG = 0

/** `lstb.bruttoarbeitslohn`, oder mit Instanz (ein Objekt, ein Kind) `vermietung:<id>.mieteinnahmen`. */
export function kennzeichnungsKey(maske: Maske, feld: string, instanz?: string): string {
  if (feld === '' || feld.includes('.') || (instanz !== undefined && (instanz === '' || instanz.includes('.')))) {
    throw new RangeError(`kennzeichnungsKey: invalid field "${feld}" or instance "${instanz ?? ''}"`)
  }
  return instanz === undefined ? `${maske}.${feld}` : `${maske}:${instanz}.${feld}`
}

export function zerlegeKennzeichnungsKey(key: string): { maske: Maske; instanz: string | null; feld: string } {
  const punkt = key.indexOf('.')
  if (punkt <= 0 || punkt === key.length - 1) throw new RangeError(`Kennzeichnungs-Key "${key}" has no field`)
  const kopf = key.slice(0, punkt)
  const feld = key.slice(punkt + 1)
  const doppelpunkt = kopf.indexOf(':')
  const maske = doppelpunkt === -1 ? kopf : kopf.slice(0, doppelpunkt)
  const instanz = doppelpunkt === -1 ? null : kopf.slice(doppelpunkt + 1)
  if (!(MASKEN as readonly string[]).includes(maske)) throw new RangeError(`Kennzeichnungs-Key "${key}" names no known mask`)
  if (instanz === '') throw new RangeError(`Kennzeichnungs-Key "${key}" has an empty instance`)
  return { maske: maske as Maske, instanz, feld }
}

export function anlageVon(key: string): Anlage {
  return ANLAGE_JE_MASKE[zerlegeKennzeichnungsKey(key).maske]
}

export function istJahresunabhaengig(key: string): boolean {
  const { maske } = zerlegeKennzeichnungsKey(key)
  return maske === 'profil' || maske === 'stammdaten'
}

export type Schreibentscheidung =
  /** Wert schreiben; `kennzeichnung: null` heißt: Kennzeichnung entfernen (jetzt Nutzer-Wert). */
  | { readonly art: 'schreiben'; readonly kennzeichnung: Kennzeichnung | null }
  /** Wert NICHT schreiben, nur den Vorschlag ablegen. */
  | { readonly art: 'vorschlag'; readonly kennzeichnung: Kennzeichnung }
  | { readonly art: 'unveraendert' }

export interface Schreibversuch {
  readonly key: string
  readonly bestehend: Kennzeichnung | null
  readonly aktuellerWert: string | null
  readonly neuerWert: string | null
  readonly herkunft: Herkunft
}

/**
 * ADR-0052 §7 — der Nutzer gewinnt: ein selbst eingetragener (keine Kennzeichnung, aber ein Wert —
 * auch „unklar“) oder bestätigter Wert wird nie überschrieben; der neue Wert wird ein Vorschlag, der
 * neueste ersetzt einen älteren. Ein unbestätigter Wert hat noch niemanden, der für ihn einsteht,
 * und wird ersetzt.
 */
export function entscheideSchreibung({ key, bestehend, aktuellerWert, neuerWert, herkunft }: Schreibversuch): Schreibentscheidung {
  if (herkunft.art === 'nutzer') return { art: 'schreiben', kennzeichnung: null }
  if (neuerWert === aktuellerWert) return { art: 'unveraendert' }
  const geschuetzt = bestehend === null ? aktuellerWert !== null : bestehend.bestaetigt
  if (geschuetzt) {
    const basis: Kennzeichnung = bestehend ?? { key, herkunft: { art: 'nutzer' }, bestaetigt: true, wert: aktuellerWert, vorschlag: null }
    return { art: 'vorschlag', kennzeichnung: { ...basis, vorschlag: { wert: neuerWert, herkunft } } }
  }
  return { art: 'schreiben', kennzeichnung: { key, herkunft, bestaetigt: false, vorschlag: null, wert: neuerWert } }
}

/** Je Anlage mit mindestens einem unbestätigten Wert ein Vorprüfungs-Schlüssel, in Anlagen-Reihenfolge. */
export function fehlendeBestaetigungen(kennzeichnungen: readonly Kennzeichnung[]): string[] {
  const offen = new Set(kennzeichnungen.filter((k) => !k.bestaetigt).map((k) => anlageVon(k.key)))
  return ANLAGEN.filter((a) => offen.has(a)).map((a) => `unbestaetigt.${a}`)
}

/** Bestätigt alle Werte einer Anlage; die Herkunft bleibt (ADR-0049 §2). */
export function bestaetigeAnlage(kennzeichnungen: readonly Kennzeichnung[], anlage: Anlage): Kennzeichnung[] {
  return kennzeichnungen.map((k) => (anlageVon(k.key) === anlage && !k.bestaetigt ? { ...k, bestaetigt: true } : k))
}

/** Der Nutzer wählt den Vorschlag — damit ist er bestätigt; die Herkunft ist die des Vorschlags. */
export function nimmVorschlagAn(k: Kennzeichnung): Kennzeichnung {
  if (k.vorschlag === null) throw new RangeError(`nimmVorschlagAn: "${k.key}" has no proposal`)
  return { key: k.key, herkunft: k.vorschlag.herkunft, bestaetigt: true, wert: k.vorschlag.wert, vorschlag: null }
}

/** Verwirft den Vorschlag; bleibt nichts zu kennzeichnen (Nutzer-Wert), entfällt die Kennzeichnung. */
export function verwirfVorschlag(k: Kennzeichnung): Kennzeichnung | null {
  if (k.herkunft.art === 'nutzer') return null
  return { ...k, vorschlag: null }
}

export function herkunftText(herkunft: Herkunft): string {
  switch (herkunft.art) {
    case 'nutzer':
      return 'Selbst eingetragen'
    case 'uebernahme':
      return `Übernahme aus ${herkunft.vorjahr}`
    case 'assistent':
      return herkunft.belegId === undefined ? `Assistent: ${herkunft.name}` : `Assistent: ${herkunft.name}, aus Beleg`
    case 'beleg':
      return 'Aus Beleg'
  }
}
