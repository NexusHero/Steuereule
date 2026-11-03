// Eulen-Modus (Ticket 10.9, product ADRs 037–042).
// Pure, deterministic domain logic for proactive triggers, legal bounds (StBerG),
// and card lifecycle. No I/O, no LLM calls here (ADR-014/048 determinism boundary).
import { createHash } from 'node:crypto'

export type EulenTriggerArt = 'musterluecke' | 'vorjahresvergleich' | 'rechtsaenderung' | 'lebenslage_hinweis'

export type EulenKartenKategorie = 'cockpit_proaktiv' | 'abruf_frage' | 'archiv_einspruch'

export interface EulenEmpfehlungWeg {
  readonly name: string
  readonly betragEur: number
  readonly beschreibung: string
  readonly risiko: 'sicher' | 'risiko'
}

export interface EulenKarte {
  readonly id: string
  readonly fingerprint: string
  readonly trigger: EulenTriggerArt
  readonly kategorie: EulenKartenKategorie
  readonly titel: string
  readonly botschaft: string
  readonly begruendung: string
  readonly betragEur: number | null
  readonly rechtsstandDatum: string
  readonly quelleUebersetzt: string
  readonly quelleUrl?: string | undefined
  readonly wege?: readonly [EulenEmpfehlungWeg, EulenEmpfehlungWeg] | undefined
  readonly einspruchFristBis?: string | undefined
}

export interface EulenArchivJahr {
  readonly steuerjahr: number
  readonly bescheidDatum: string
  readonly einspruchMoeglichBis: string
  readonly hatHomeofficeOhnePauschale?: boolean
}

export interface EulenEingabeFakten {
  readonly steuerjahr: number
  readonly bruttoarbeitslohnEur?: number | null
  readonly werbungskostenGesamtEur?: number | null
  readonly fortbildungskostenEur?: number | null
  readonly fahrtkostenEur?: number | null
  readonly homeofficeTage?: number | null
  readonly vorjahrFakten?: {
    readonly werbungskostenGesamtEur?: number | null
    readonly spendenEur?: number | null
  } | null
  readonly bekannteBelegeArten?: readonly string[]
  readonly hatKinderErfasst?: boolean
  readonly archivJahre?: readonly EulenArchivJahr[]
  readonly verworfeneFingerprints?: readonly string[]
}

/** Generates a stable fingerprint so a dismissed card never re-appears without new facts (ADR-041). */
export function berechneEulenKartenFingerprint(trigger: EulenTriggerArt, keyContext: string): string {
  return createHash('sha256').update(`${trigger}::${keyContext}`).digest('hex').slice(0, 16)
}

/** Current statutory reference date (ADR-039). */
export const RECHTSSTAND_DATUM = '01.01.2025'

/**
 * Evaluates facts against the statutory and pattern rule engine.
 * Pure and deterministic: always returns the exact same cards for identical inputs.
 */
export function generiereEulenKarten(fakten: EulenEingabeFakten): readonly EulenKarte[] {
  const karten: EulenKarte[] = []
  const verworfen = new Set(fakten.verworfeneFingerprints ?? [])

  // 1. Trigger: Musterlücke (Fortbildung erfasst, aber 0 Fahrtkosten)
  if (
    fakten.fortbildungskostenEur &&
    fakten.fortbildungskostenEur > 0 &&
    (!fakten.fahrtkostenEur || fakten.fahrtkostenEur === 0)
  ) {
    const fp = berechneEulenKartenFingerprint('musterluecke', `fortbildung_ohne_fahrt_${fakten.steuerjahr}`)
    if (!verworfen.has(fp)) {
      karten.push({
        id: `eule-ml-fortbildung-${fakten.steuerjahr}`,
        fingerprint: fp,
        trigger: 'musterluecke',
        kategorie: 'abruf_frage',
        titel: 'Fahrtkosten zur Fortbildung',
        botschaft: 'Mir fällt auf: Du hast Fortbildungskosten angegeben, aber keine Fahrtkosten. Bist du geflogen?',
        begruendung: 'weil Fahrten zu Fortbildungsstätten als Werbungskosten mit 0,30 € pro gefahrenem Kilometer ansetzbar sind.',
        betragEur: 90,
        rechtsstandDatum: RECHTSSTAND_DATUM,
        quelleUebersetzt: 'Bundesfinanzhof bestätigt Fahrtkosten bei Auswärtstätigkeiten (§ 9 Abs. 1 Satz 3 Nr. 4a EStG).',
        quelleUrl: 'https://www.gesetze-im-internet.de/estg/__9.html',
      })
    }
  }

  // 2. Trigger: Vorjahresvergleich (Vorjahr hatte Spenden, aktuelles Jahr nicht)
  if (
    fakten.vorjahrFakten?.spendenEur &&
    fakten.vorjahrFakten.spendenEur > 0
  ) {
    const fp = berechneEulenKartenFingerprint('vorjahresvergleich', `spenden_vorjahr_${fakten.steuerjahr}`)
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
        quelleUebersetzt: 'Sonderausgabenabzug für Zuwendungen nach § 10b EStG.',
        quelleUrl: 'https://www.gesetze-im-internet.de/estg/__10b.html',
      })
    }
  }

  // 3. Trigger: Rechtsänderung / Urteil (Homeoffice-Tagespauschale Anhebung auf 6 € / max. 1.260 €)
  // Betrifft konkreten Fall ab >= 50 € -> Proaktiv ins Cockpit (ADR-038)
  if (fakten.homeofficeTage && fakten.homeofficeTage >= 10) {
    const betrag = Math.min(fakten.homeofficeTage * 6, 1260)
    if (betrag >= 50) {
      const fp = berechneEulenKartenFingerprint('rechtsaenderung', `homeoffice_pauschale_${fakten.steuerjahr}_${betrag}`)
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
          quelleUebersetzt: 'Jahressteuergesetz: Gesetzliche Regelung zur Tagespauschale (§ 4 Abs. 5 Satz 1 Nr. 6b EStG).',
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

  // 4. Trigger: Beleg deutet auf nicht angelegte Lebenslage hin (z.B. Kita / Betreuung ohne Kind)
  if (fakten.bekannteBelegeArten?.includes('kita_rechnung') && !fakten.hatKinderErfasst) {
    const fp = berechneEulenKartenFingerprint('lebenslage_hinweis', `kita_ohne_kind_${fakten.steuerjahr}`)
    if (!verworfen.has(fp)) {
      karten.push({
        id: `eule-lh-kita-${fakten.steuerjahr}`,
        fingerprint: fp,
        trigger: 'lebenslage_hinweis',
        kategorie: 'abruf_frage',
        titel: 'Kinderbetreuungskosten',
        botschaft: 'Du hast einen Kita- oder Betreuungsbeleg hochgeladen, aber noch kein Kind erfasst.',
        begruendung: 'weil zwei Drittel der Kinderbetreuungskosten (bis max. 4.000 € je Kind) als Sonderausgaben abzugsfähig sind.',
        betragEur: 400,
        rechtsstandDatum: RECHTSSTAND_DATUM,
        quelleUebersetzt: 'Kinderbetreuungskosten nach § 10 Abs. 1 Nr. 5 EStG.',
        quelleUrl: 'https://www.gesetze-im-internet.de/estg/__10.html',
      })
    }
  }

  // 5. Trigger: Archiv-Wache (Urteil zu abgegebenen Vorjahren im Einspruchsfenster, ADR-042)
  if (fakten.archivJahre && fakten.archivJahre.length > 0) {
    for (const archiv of fakten.archivJahre) {
      if (archiv.hatHomeofficeOhnePauschale) {
        const fp = berechneEulenKartenFingerprint('rechtsaenderung', `archiv_einspruch_${archiv.steuerjahr}`)
        if (!verworfen.has(fp)) {
          karten.push({
            id: `eule-archiv-${archiv.steuerjahr}`,
            fingerprint: fp,
            trigger: 'rechtsaenderung',
            kategorie: 'archiv_einspruch',
            titel: `Einspruchsfrist Steuerjahr ${archiv.steuerjahr}`,
            botschaft: `Für deinen Steuerbescheid ${archiv.steuerjahr} läuft die Einspruchsfrist bis ${archiv.einspruchMoeglichBis}.`,
            begruendung: 'weil ein anhängiges BFH-Musterverfahren deine damals nicht berücksichtigten Kosten nachträglich begünstigen kann.',
            betragEur: 180,
            rechtsstandDatum: RECHTSSTAND_DATUM,
            quelleUebersetzt: 'BFH-Musterverfahren zur rückwirkenden Pauschalenberücksichtigung.',
            einspruchFristBis: archiv.einspruchMoeglichBis,
          })
        }
      }
    }
  }

  // Sorting: 'cockpit_proaktiv' and 'archiv_einspruch' first, then highest betrag
  return karten.sort((a, b) => {
    if (a.kategorie === 'cockpit_proaktiv' && b.kategorie !== 'cockpit_proaktiv') return -1
    if (a.kategorie !== 'cockpit_proaktiv' && b.kategorie === 'cockpit_proaktiv') return 1
    return (b.betragEur ?? 0) - (a.betragEur ?? 0)
  })
}
