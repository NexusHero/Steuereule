export type SteuerjahrStatus =
  | 'entwurf'
  | 'pruefung'
  | 'eingereicht'
  | 'rueckfrage'
  | 'bescheid'
  | 'abgeschlossen'
  | 'extern-erledigt'

const UEBERGAENGE_DE: Readonly<Record<SteuerjahrStatus, readonly SteuerjahrStatus[]>> = {
  entwurf: ['pruefung', 'extern-erledigt'],
  pruefung: ['eingereicht', 'entwurf', 'extern-erledigt'],
  eingereicht: ['rueckfrage', 'bescheid'],
  rueckfrage: ['eingereicht', 'bescheid'],
  bescheid: ['abgeschlossen'],
  abgeschlossen: [],
  'extern-erledigt': [],
}

export function isTransitionAllowed(from: SteuerjahrStatus, to: SteuerjahrStatus): boolean {
  return UEBERGAENGE_DE[from].includes(to)
}

export function naechsteZustaende(von: SteuerjahrStatus): readonly SteuerjahrStatus[] {
  return UEBERGAENGE_DE[von] ?? []
}

export type BescheidStatus = 'eingegangen' | 'geprüft' | 'einspruch-eingelegt'

const BESCHEID_UEBERGAENGE: Readonly<Record<BescheidStatus, readonly BescheidStatus[]>> = {
  eingegangen: ['geprüft'],
  geprüft: ['einspruch-eingelegt'],
  'einspruch-eingelegt': [],
}

export function istBescheidUebergangErlaubt(von: BescheidStatus, nach: BescheidStatus): boolean {
  return BESCHEID_UEBERGAENGE[von].includes(nach)
}

export function naechsteBescheidZustaende(von: BescheidStatus): readonly BescheidStatus[] {
  return BESCHEID_UEBERGAENGE[von]
}
