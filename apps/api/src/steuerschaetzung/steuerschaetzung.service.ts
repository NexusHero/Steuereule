import { Inject, Injectable } from '@nestjs/common'
import {
  angestellteAusAntworten,
  berechneWerktage,
  chfNachEur,
  gatedEinkunftsarten,
  lstbZustand,
  offeneLohnausweisFelder,
  pendlerpauschale,
  steuerschaetzungAngestellt,
  steuerschaetzungGrenzgaenger,
  type Answers,
  type Steuerschaetzung,
} from '@steuereule/core'
import { ARBEITSWEG_REPOSITORY, type ArbeitswegEingaben, type ArbeitswegRepository } from '../arbeitsweg/arbeitsweg.repository.js'
import { CH_LOHNAUSWEIS_REPOSITORY, type ChLohnausweisRepository } from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import { grenzgaengerStatusAusAnswers, lohnausweisWerteAusRecord, wechselkursAusRecord } from '../ch-lohnausweis/lohnausweis-daten.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { answersAus } from '../interview/answers.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { lstbDatenAus } from '../lstb/lstb-daten.js'
import { STAMMDATEN_REPOSITORY, type StammdatenRepository } from '../stammdaten/stammdaten.repository.js'

export type SteuerschaetzungStand =
  | (Extract<Steuerschaetzung, { kind: 'spanne' }> & { readonly kirchensteuerOffen: boolean })
  | { readonly kind: 'offen'; readonly fehlt: readonly string[] }
  | { readonly kind: 'nicht-moeglich'; readonly grund: string }

const CH_AUSLAND = 'Ja, in die Schweiz'

/** Ranged refund / back-payment estimate from everything the user has entered for one tax year (product ADR-015). */
@Injectable()
export class SteuerschaetzungService {
  constructor(
    @Inject(LSTB_REPOSITORY) private readonly lstb: LstbRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(CH_LOHNAUSWEIS_REPOSITORY) private readonly chLohnausweis: ChLohnausweisRepository,
    @Inject(STAMMDATEN_REPOSITORY) private readonly stammdaten: StammdatenRepository,
    @Inject(ARBEITSWEG_REPOSITORY) private readonly arbeitsweg: ArbeitswegRepository,
  ) {}

  async getState(userId: string, jahr: number): Promise<SteuerschaetzungStand> {
    const [lstbRecord, interviewRows, chRecord, stammdaten, weg] = await Promise.all([
      this.lstb.findForUserAndYear(userId, jahr),
      this.interview.findAllForUserAndYear(userId, jahr),
      this.chLohnausweis.findForUserAndYear(userId, jahr),
      this.stammdaten.findByUserId(userId),
      this.arbeitsweg.findForUserAndYear(userId, jahr),
    ])
    const answers = answersAus(interviewRows)

    if (answers.job !== 'Angestellt') return { kind: 'nicht-moeglich', grund: 'nur-angestellte' }
    if (stammdaten?.familienstand === 'verheiratet') return { kind: 'nicht-moeglich', grund: 'verheiratet' }
    if (gatedEinkunftsarten(answers).length > 0 || besondereLebenslage(answers)) {
      return { kind: 'nicht-moeglich', grund: 'besondere-lebenslage' }
    }

    const zahlen = angestellteAusAntworten(answers)
    const pauschale = pendlerpauschaleAus(jahr, weg)
    const kirchensteuerOffen = stammdaten?.religion !== undefined && stammdaten?.religion !== null && stammdaten.religion !== 'VD'

    if (answers.ausland === CH_AUSLAND) {
      const werte = lohnausweisWerteAusRecord(chRecord)
      const wechselkurs = wechselkursAusRecord(chRecord)
      const status = grenzgaengerStatusAusAnswers(answers)
      const fehlt = [...(status === null ? ['grenzgaenger-status'] : offeneLohnausweisFelder(werte, status)), ...(wechselkurs === null ? ['wechselkurs'] : [])]
      if (fehlt.length > 0 || wechselkurs === null) return { kind: 'offen', fehlt }
      const eur = (chf: number | undefined) => (chf === undefined ? 0 : Math.round(chfNachEur(chf, wechselkurs.kurs)))
      const krankenkasseChf = chRecord?.krankenkasseChf === null || chRecord?.krankenkasseChf === undefined ? undefined : Number(chRecord.krankenkasseChf)
      return mitKirchensteuer(
        steuerschaetzungGrenzgaenger({
          jahr,
          einnahmenEur: eur(werte['bruttolohn-total']),
          quellensteuerEur: eur(werte.quellensteuer),
          ahvEur: eur(werte['ahv-beitraege']),
          pensionskasseEur: eur(werte['berufliche-vorsorge']),
          krankenkasseEur: eur(krankenkasseChf),
          selbstGezahlteKvPv: zahlen.kvPvBeitraege,
          pendlerpauschale: pauschale,
          spenden: zahlen.spenden,
        }),
        kirchensteuerOffen,
      )
    }

    const zustand = lstbZustand(lstbDatenAus(lstbRecord))
    if (zustand.kind === 'unvollstaendig') return { kind: 'offen', fehlt: [...zustand.offen, ...zustand.unklar] }
    if (zustand.kind === 'widerspruch') return { kind: 'offen', fehlt: zustand.widersprueche.map((w) => w.art) }
    return mitKirchensteuer(
      steuerschaetzungAngestellt({
        jahr,
        bruttoarbeitslohn: zustand.bruttoarbeitslohn,
        lohnsteuer: zustand.lohnsteuer,
        sozialversicherung: zustand.sozialversicherung,
        pendlerpauschale: pauschale,
        weitereWerbungskosten: zahlen.umzugKosten,
        spenden: zahlen.spenden,
        selbstGezahlteKvPv: zahlen.kvPvBeitraege,
      }),
      kirchensteuerOffen,
    )
  }
}

function besondereLebenslage(answers: Answers): boolean {
  return answers.dhf === 'Ja' || answers.abfindung === 'Ja' || answers.lohnersatz === 'Ja' || answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob'
}

function pendlerpauschaleAus(jahr: number, weg: ArbeitswegEingaben | null): number {
  if (weg === null || weg.einfacheKm === null || weg.verkehrsmittel === null) return 0
  const tage = berechneWerktage({
    jahr,
    werktage: weg.arbeitstage,
    urlaubstage: weg.urlaubstage,
    krankheitstage: weg.krankheitstage,
    homeofficeTage: weg.homeofficeTage,
  })
  if (tage.kind !== 'bestimmt') return 0
  try {
    return pendlerpauschale({ einfacheKm: weg.einfacheKm, tage: tage.pendlertage, jahr, mitPkw: weg.verkehrsmittel === 'pkw' })
  } catch {
    return 0
  }
}

function mitKirchensteuer(schaetzung: Steuerschaetzung, kirchensteuerOffen: boolean): SteuerschaetzungStand {
  if (schaetzung.kind !== 'spanne') return { kind: 'nicht-moeglich', grund: schaetzung.grund }
  return { ...schaetzung, kirchensteuerOffen }
}
