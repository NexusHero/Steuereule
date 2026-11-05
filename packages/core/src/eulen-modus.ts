import { createHash } from 'node:crypto'
import type { HOMEOFFICE_VALUES } from './interview'

export type OwlTriggerKind = 'musterluecke' | 'vorjahresvergleich' | 'rechtsaenderung' | 'lebenslage_hinweis'
export type OwlCardCategory = 'cockpit_proaktiv' | 'abruf_frage' | 'archiv_einspruch'
export type OwlSourceId = 'estg-4-5-6c' | 'estg-9-1-4a' | 'estg-10b' | 'estg-10-1-5' | 'ao-355'

export interface OwlRecommendationPath {
  readonly name: string
  readonly betragEur: number
  readonly beschreibung: string
  readonly risiko: 'sicher' | 'risiko'
}

export interface OwlCard {
  readonly id: string
  readonly fingerprint: string
  readonly trigger: OwlTriggerKind
  readonly kategorie: OwlCardCategory
  readonly titel: string
  readonly botschaft: string
  readonly begruendung: string
  readonly betragEur: number | null
  readonly rechtsstandDatum: string
  readonly quelleId: OwlSourceId
  readonly quelleUebersetzt: string
  readonly quelleUrl?: string | undefined
  readonly wege?: readonly [OwlRecommendationPath, OwlRecommendationPath] | undefined
  readonly einspruchFristBis?: string | undefined
}

export type EulenKartenAnzeige = Omit<OwlCard, 'quelleId'>

export interface OwlArchiveYear {
  readonly steuerjahr: number
  readonly bescheidDatum: string
  readonly einspruchMoeglichBis: string
  readonly homeofficeTage: number
}

export interface OwlInputFacts {
  readonly steuerjahr: number
  readonly hatFortbildung?: boolean
  readonly homeofficeTage?: number | null
  readonly vorjahrFakten?: { readonly spendenEur?: number | null } | null
  readonly kinderLautInterview?: boolean
  readonly hatKinderErfasst?: boolean
  readonly archivJahre?: readonly OwlArchiveYear[]
  readonly verworfeneFingerprints?: readonly string[]
}

export function calculateOwlCardFingerprint(trigger: OwlTriggerKind, keyContext: string): string {
  return createHash('sha256').update(`${trigger}::${keyContext}`).digest('hex').slice(0, 16)
}

export const RECHTSSTAND_DATUM = '01.01.2025'

const HOMEOFFICE_TAGESPAUSCHALE_EUR = 6
const HOMEOFFICE_HOECHSTTAGE = 210
const ANGENOMMENE_ARBEITSTAGE = 220

type HomeofficeAntwort = (typeof HOMEOFFICE_VALUES)[number]

const HOMEOFFICE_ANTEIL: Record<HomeofficeAntwort, number> = {
  Nie: 0,
  '1–2 Tage pro Woche': 0.3,
  'Fast immer': 1,
}

export function homeofficeTageAusInterview(antworten: Readonly<Record<string, string>>): number | null {
  const anteil = HOMEOFFICE_ANTEIL[antworten['homeoffice'] as HomeofficeAntwort]
  if (anteil === undefined) return null
  const tage = antworten['tage']
  const arbeitstage = tage && /^\d+$/.test(tage) ? Number(tage) : ANGENOMMENE_ARBEITSTAGE
  return Math.min(Math.round(arbeitstage * anteil), HOMEOFFICE_HOECHSTTAGE)
}

function homeofficePauschaleEur(tage: number): number {
  return Math.min(tage, HOMEOFFICE_HOECHSTTAGE) * HOMEOFFICE_TAGESPAUSCHALE_EUR
}

export function generateOwlCards(fakten: OwlInputFacts): readonly OwlCard[] {
  const karten: OwlCard[] = []
  const verworfen = new Set(fakten.verworfeneFingerprints ?? [])

  if (fakten.hatFortbildung) {
    const fp = calculateOwlCardFingerprint('musterluecke', `fortbildung_ohne_fahrt_${fakten.steuerjahr}`)
    if (!verworfen.has(fp)) {
      karten.push({
        id: `eule-ml-fortbildung-${fakten.steuerjahr}`,
        fingerprint: fp,
        trigger: 'musterluecke',
        kategorie: 'abruf_frage',
        titel: 'Fahrtkosten zur Fortbildung',
        botschaft: 'Mir fällt auf: Du hast Fortbildungskosten angegeben, aber keine Fahrtkosten. Bist du geflogen?',
        begruendung: 'weil Fahrten zu Fortbildungsstätten als Werbungskosten mit 0,30 € pro gefahrenem Kilometer ansetzbar sind.',
        betragEur: null,
        rechtsstandDatum: RECHTSSTAND_DATUM,
        quelleId: 'estg-9-1-4a',
        quelleUebersetzt: 'Fahrtkosten bei Auswärtstätigkeiten (§ 9 Abs. 1 Satz 3 Nr. 4a EStG).',
        quelleUrl: 'https://www.gesetze-im-internet.de/estg/__9.html',
      })
    }
  }

  if (
    fakten.vorjahrFakten?.spendenEur &&
    fakten.vorjahrFakten.spendenEur > 0
  ) {
    const fp = calculateOwlCardFingerprint('vorjahresvergleich', `spenden_vorjahr_${fakten.steuerjahr}`)
    if (!verworfen.has(fp)) {
      karten.push({
        id: `eule-vj-spenden-${fakten.steuerjahr}`,
        fingerprint: fp,
        trigger: 'vorjahresvergleich',
        kategorie: 'abruf_frage',
        titel: 'Spenden wie im Vorjahr?',
        botschaft: `Im Vorjahr hattest du ${fakten.vorjahrFakten.spendenEur} € Spenden abgesetzt. Gab es dieses Jahr auch Zuwendungen?`,
        begruendung: 'weil regelmäßige Spenden an gemeinnützige Organisationen jedes Jahr das zu versteuernde Einkommen mindern.',
        betragEur: Math.round(fakten.vorjahrFakten.spendenEur * 0.3),
        rechtsstandDatum: RECHTSSTAND_DATUM,
        quelleId: 'estg-10b',
        quelleUebersetzt: 'Sonderausgabenabzug für Zuwendungen nach § 10b EStG.',
        quelleUrl: 'https://www.gesetze-im-internet.de/estg/__10b.html',
      })
    }
  }

  if (fakten.homeofficeTage && fakten.homeofficeTage >= 10) {
    const betrag = homeofficePauschaleEur(fakten.homeofficeTage)
    if (betrag >= 50) {
      const fp = calculateOwlCardFingerprint('rechtsaenderung', `homeoffice_pauschale_${fakten.steuerjahr}_${betrag}`)
      if (!verworfen.has(fp)) {
        karten.push({
          id: `eule-ra-homeoffice-${fakten.steuerjahr}`,
          fingerprint: fp,
          trigger: 'rechtsaenderung',
          kategorie: 'cockpit_proaktiv',
          titel: 'Homeoffice-Tagespauschale 6 €',
          botschaft: `Du hast ${fakten.homeofficeTage} Tage im Homeoffice gearbeitet. Nach aktueller Rechtslage kannst du 6 € pro Tag geltend machen!`,
          begruendung: 'weil der Gesetzgeber die Homeoffice-Pauschale dauerhaft auf 6 € pro Tag (max. 1.260 € / 210 Tage) angehoben hat.',
          betragEur: betrag,
          rechtsstandDatum: RECHTSSTAND_DATUM,
          quelleId: 'estg-4-5-6c',
          quelleUebersetzt: 'Homeoffice-Tagespauschale (§ 4 Abs. 5 Satz 1 Nr. 6c EStG).',
          quelleUrl: 'https://www.gesetze-im-internet.de/estg/__4.html',
          wege: [
            {
              name: 'Tagespauschale ansetzen',
              betragEur: betrag,
              beschreibung: 'Einfacher Nachweis der Arbeitstage ohne separates Arbeitszimmer',
              risiko: 'sicher',
            },
            {
              name: 'Häusliches Arbeitszimmer prüfen',
              betragEur: 1260,
              beschreibung: 'Höherer Abzug möglich, wenn das Arbeitszimmer der Mittelpunkt der gesamten Tätigkeit ist',
              risiko: 'risiko',
            },
          ],
        })
      }
    }
  }

  if (fakten.kinderLautInterview && !fakten.hatKinderErfasst) {
    const fp = calculateOwlCardFingerprint('lebenslage_hinweis', `kinder_nicht_erfasst_${fakten.steuerjahr}`)
    if (!verworfen.has(fp)) {
      karten.push({
        id: `eule-lh-kinder-${fakten.steuerjahr}`,
        fingerprint: fp,
        trigger: 'lebenslage_hinweis',
        kategorie: 'abruf_frage',
        titel: 'Kinder noch nicht erfasst',
        botschaft: 'Du hast im Interview Kinder angegeben, aber noch kein Kind erfasst.',
        begruendung: 'weil zum Beispiel Kinderbetreuungskosten zu 80 % (bis 4.800 € je Kind) als Sonderausgaben abziehbar sind.',
        betragEur: null,
        rechtsstandDatum: RECHTSSTAND_DATUM,
        quelleId: 'estg-10-1-5',
        quelleUebersetzt: 'Kinderbetreuungskosten nach § 10 Abs. 1 Nr. 5 EStG.',
        quelleUrl: 'https://www.gesetze-im-internet.de/estg/__10.html',
      })
    }
  }

  if (fakten.archivJahre && fakten.archivJahre.length > 0) {
    for (const archiv of fakten.archivJahre) {
      if (archiv.homeofficeTage > 0) {
        const fp = calculateOwlCardFingerprint('rechtsaenderung', `archiv_einspruch_${archiv.steuerjahr}`)
        if (!verworfen.has(fp)) {
          karten.push({
            id: `eule-archiv-${archiv.steuerjahr}`,
            fingerprint: fp,
            trigger: 'rechtsaenderung',
            kategorie: 'archiv_einspruch',
            titel: `Einspruchsfrist Steuerjahr ${archiv.steuerjahr}`,
            botschaft: `Für deinen Steuerbescheid ${archiv.steuerjahr} läuft die Einspruchsfrist bis ${archiv.einspruchMoeglichBis}. Prüf, ob die Homeoffice-Pauschale darin steckt.`,
            begruendung: 'weil du für dieses Jahr Homeoffice-Tage angegeben hast — fehlt die Pauschale im Bescheid, kannst du bis Fristende Einspruch einlegen.',
            betragEur: homeofficePauschaleEur(archiv.homeofficeTage),
            rechtsstandDatum: RECHTSSTAND_DATUM,
            quelleId: 'ao-355',
            quelleUebersetzt: 'Einspruchsfrist von einem Monat (§ 355 Abs. 1 AO).',
            quelleUrl: 'https://www.gesetze-im-internet.de/ao_1977/__355.html',
            einspruchFristBis: archiv.einspruchMoeglichBis,
          })
        }
      }
    }
  }

  return karten.sort((a, b) => {
    if (a.kategorie === 'cockpit_proaktiv' && b.kategorie !== 'cockpit_proaktiv') return -1
    if (a.kategorie !== 'cockpit_proaktiv' && b.kategorie === 'cockpit_proaktiv') return 1
    return (b.betragEur ?? 0) - (a.betragEur ?? 0)
  })
}
