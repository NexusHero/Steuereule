import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  ANLAGEN,
  JAHRESUNABHAENGIG,
  anlageVon,
  entscheideSchreibung,
  fehlendeBestaetigungen,
  istJahresunabhaengig,
  nimmVorschlagAn,
  verwirfVorschlag,
  zerlegeKennzeichnungsKey,
  type Anlage,
  type Herkunft,
  type Kennzeichnung,
  type Maske,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRecord, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { FELD_ZUGRIFF, type FeldZugriff, type MaskenZugriff } from './feld-zugriff.js'
import type { BestaetigungResponseDto, HerkunftDto, KennzeichnungWertDto } from './dto/bestaetigung.dto.js'

export type Schreibergebnis = 'geschrieben' | 'vorschlag' | 'unveraendert'

interface Adresse {
  key: string
  maske: Maske
  instanz: string | null
  feld: string
  steuerjahr: number
  zugriff: MaskenZugriff
}

function herkunftDto(h: Herkunft): HerkunftDto {
  switch (h.art) {
    case 'nutzer':
      return { art: 'nutzer' }
    case 'uebernahme':
      return { art: 'uebernahme', vorjahr: h.vorjahr }
    case 'assistent':
      return h.belegId === undefined ? { art: 'assistent', name: h.name } : { art: 'assistent', name: h.name, belegId: h.belegId }
    case 'beleg':
      return { art: 'beleg', belegId: h.belegId }
  }
}

/** §6/§7 — Herkunft und Bestätigung je Feld. */
@Injectable()
export class BestaetigungService {
  constructor(
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly repository: KennzeichnungRepository,
    @Inject(FELD_ZUGRIFF) private readonly zugriff: FeldZugriff,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private adresse(key: string, steuerjahr: number): Adresse {
    let teile: ReturnType<typeof zerlegeKennzeichnungsKey>
    try {
      teile = zerlegeKennzeichnungsKey(key)
    } catch {
      throw new InvalidInputError('FIELD_UNKNOWN', `"${key}" is not a known field.`)
    }
    const zugriff = this.zugriff[teile.maske]
    if (zugriff === undefined || !zugriff.felder.includes(teile.feld) || zugriff.mitInstanz !== (teile.instanz !== null)) {
      throw new InvalidInputError('FIELD_NOT_WRITABLE', `"${key}" is not a field that can be written here.`)
    }
    return { key, ...teile, steuerjahr: istJahresunabhaengig(key) ? JAHRESUNABHAENGIG : steuerjahr, zugriff }
  }

  private async aktuellerWert(userId: string, a: Adresse): Promise<string | null> {
    const werte = await a.zugriff.lese(userId, a.steuerjahr, a.instanz)
    if (werte === null) throw new NotFoundError('FIELD_NOT_FOUND', `"${a.key}" does not exist in this tax year.`)
    return werte[a.feld] ?? null
  }

  private async schreibeWert(userId: string, a: Adresse, wert: string | null): Promise<void> {
    if (!(await a.zugriff.schreibe(userId, a.steuerjahr, a.instanz, a.feld, wert))) {
      throw new NotFoundError('FIELD_NOT_FOUND', `"${a.key}" does not exist in this tax year.`)
    }
  }

  async schreibe(userId: string, steuerjahr: number, key: string, neuerWert: string | null, herkunft: Herkunft): Promise<Schreibergebnis> {
    if (herkunft.art === 'nutzer') throw new Error('BestaetigungService.schreibe is for non-user writes; the masks handle user writes.')
    const a = this.adresse(key, steuerjahr)
    const aktuellerWert = await this.aktuellerWert(userId, a)
    const bestehend = await this.repository.find(userId, a.steuerjahr, key)
    const entscheidung = entscheideSchreibung({ key, bestehend: bestehend === null ? null : { ...bestehend, wert: aktuellerWert }, aktuellerWert, neuerWert, herkunft })
    switch (entscheidung.art) {
      case 'unveraendert':
        return 'unveraendert'
      case 'vorschlag':
        await this.repository.speichere(userId, a.steuerjahr, entscheidung.kennzeichnung)
        return 'vorschlag'
      case 'schreiben':
        await this.schreibeWert(userId, a, neuerWert)
        if (entscheidung.kennzeichnung === null) await this.repository.entferne(userId, a.steuerjahr, [key])
        else await this.repository.speichere(userId, a.steuerjahr, entscheidung.kennzeichnung)
        return 'geschrieben'
    }
  }

  async liste(userId: string, steuerjahr: number): Promise<KennzeichnungRecord[]> {
    return this.repository.listForUserAndYears(userId, [steuerjahr, JAHRESUNABHAENGIG])
  }

  async fehlend(userId: string, steuerjahr: number): Promise<string[]> {
    return fehlendeBestaetigungen((await this.liste(userId, steuerjahr)).map((r) => ({ ...r, wert: null })))
  }

  async uebersicht(userId: string, steuerjahr: number): Promise<BestaetigungResponseDto> {
    const offen = (await this.liste(userId, steuerjahr)).filter((r) => !r.bestaetigt || r.vorschlag !== null)
    if (offen.length === 0) return { anlagen: [] }
    await this.auditService.append({ userId, action: 'READ', resource: 'kennzeichnung' })

    const gelesen = new Map<string, Promise<Readonly<Record<string, string | null>> | null>>()
    const werte: { anlage: Anlage; dto: KennzeichnungWertDto }[] = []
    for (const r of offen) {
      const { maske, instanz, feld } = zerlegeKennzeichnungsKey(r.key)
      const zugriff = this.zugriff[maske]
      const cacheKey = `${r.steuerjahr}|${maske}|${instanz ?? ''}`
      if (zugriff !== undefined && !gelesen.has(cacheKey)) gelesen.set(cacheKey, zugriff.lese(userId, r.steuerjahr, instanz))
      const felder = zugriff === undefined ? null : await gelesen.get(cacheKey)
      werte.push({
        anlage: anlageVon(r.key),
        dto: {
          key: r.key,
          maske,
          instanz,
          feld,
          wert: felder?.[feld] ?? null,
          herkunft: herkunftDto(r.herkunft),
          bestaetigt: r.bestaetigt,
          vorschlag: r.vorschlag === null ? null : { wert: r.vorschlag.wert, herkunft: herkunftDto(r.vorschlag.herkunft) },
        },
      })
    }
    return {
      anlagen: ANLAGEN.flatMap((anlage) => {
        const eigene = werte.filter((w) => w.anlage === anlage).map((w) => w.dto)
        return eigene.length === 0 ? [] : [{ anlage, unbestaetigt: eigene.filter((w) => !w.bestaetigt).length, werte: eigene }]
      }),
    }
  }

  async bestaetigeAnlage(userId: string, steuerjahr: number, anlage: Anlage): Promise<BestaetigungResponseDto> {
    if (!(ANLAGEN as readonly string[]).includes(anlage)) throw new InvalidInputError('ANLAGE_UNKNOWN', `"${anlage}" is not an Anlage.`)
    await this.repository.bestaetigeAnlage(userId, [steuerjahr, JAHRESUNABHAENGIG], anlage)
    return this.uebersicht(userId, steuerjahr)
  }

  async entscheideVorschlag(userId: string, steuerjahr: number, key: string, entscheidung: 'annehmen' | 'verwerfen'): Promise<BestaetigungResponseDto> {
    const a = this.adresse(key, steuerjahr)
    const bestehend = await this.repository.find(userId, a.steuerjahr, key)
    if (bestehend === null || bestehend.vorschlag === null) throw new NotFoundError('PROPOSAL_NOT_FOUND', `There is no open proposal for "${key}".`)
    const kennzeichnung: Kennzeichnung = { ...bestehend, wert: await this.aktuellerWert(userId, a) }
    if (entscheidung === 'annehmen') {
      const angenommen = nimmVorschlagAn(kennzeichnung)
      await this.schreibeWert(userId, a, angenommen.wert)
      await this.repository.speichere(userId, a.steuerjahr, angenommen)
    } else {
      const rest = verwirfVorschlag(kennzeichnung)
      if (rest === null) await this.repository.entferne(userId, a.steuerjahr, [key])
      else await this.repository.speichere(userId, a.steuerjahr, rest)
    }
    return this.uebersicht(userId, steuerjahr)
  }

  async decideProposal(userId: string, taxYear: number, key: string, decision: 'annehmen' | 'verwerfen'): Promise<BestaetigungResponseDto> {
    return this.entscheideVorschlag(userId, taxYear, key, decision)
  }

  async confirmAnnex(userId: string, taxYear: number, annex: Anlage): Promise<BestaetigungResponseDto> {
    return this.bestaetigeAnlage(userId, taxYear, annex)
  }

  async overview(userId: string, taxYear: number): Promise<BestaetigungResponseDto> {
    return this.uebersicht(userId, taxYear)
  }

  async missing(userId: string, taxYear: number): Promise<string[]> {
    return this.fehlend(userId, taxYear)
  }

  async list(userId: string, taxYear: number): Promise<KennzeichnungRecord[]> {
    return this.liste(userId, taxYear)
  }
}

export { BestaetigungService as ConfirmationService }

