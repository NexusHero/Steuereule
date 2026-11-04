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
  readonly wert: string | null
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

export const JAHRESUNABHAENGIG = 0

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
  | { readonly art: 'schreiben'; readonly kennzeichnung: Kennzeichnung | null }
  | { readonly art: 'vorschlag'; readonly kennzeichnung: Kennzeichnung }
  | { readonly art: 'unveraendert' }

export interface Schreibversuch {
  readonly key: string
  readonly bestehend: Kennzeichnung | null
  readonly aktuellerWert: string | null
  readonly neuerWert: string | null
  readonly herkunft: Herkunft
}

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

export function fehlendeBestaetigungen(kennzeichnungen: readonly Kennzeichnung[]): string[] {
  const offen = new Set(kennzeichnungen.filter((k) => !k.bestaetigt).map((k) => anlageVon(k.key)))
  return ANLAGEN.filter((a) => offen.has(a)).map((a) => `unbestaetigt.${a}`)
}

export function bestaetigeAnlage(kennzeichnungen: readonly Kennzeichnung[], anlage: Anlage): Kennzeichnung[] {
  return kennzeichnungen.map((k) => (anlageVon(k.key) === anlage && !k.bestaetigt ? { ...k, bestaetigt: true } : k))
}

export function nimmVorschlagAn(k: Kennzeichnung): Kennzeichnung {
  if (k.vorschlag === null) throw new RangeError(`nimmVorschlagAn: "${k.key}" has no proposal`)
  return { key: k.key, herkunft: k.vorschlag.herkunft, bestaetigt: true, wert: k.vorschlag.wert, vorschlag: null }
}

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
