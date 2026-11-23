// Anlage V: one form per rented property, with the AfA when it is the same as last year.
import { depreciationRatePercent } from '@steuereule/core'
import type { PrintoutFacts, RentalFacts } from './facts.js'
import { formHeader, integer, isJoint, type Fields, type Section } from './section.js'

export function rentalGap(obj: RentalFacts): string | null {
  const unclear = [obj.mieteinnahmen, obj.werbungskosten, obj.anschaffungskosten, obj.baujahr].includes('unklar')
  if (unclear || integer(obj.mieteinnahmen) === null || integer(obj.werbungskosten) === null) return 'vermietung'
  if (!obj.strasse || !obj.plz || !obj.city) return 'vermietung'
  if (rentalDepreciation(obj) === null) return null
  if (obj.depreciationAsLastYear === null) return 'vermietung'
  return obj.depreciationAsLastYear ? null : 'anlageVAfaNeu'
}

function rentalDepreciation(obj: RentalFacts): { rate: number; amount: number } | null {
  const costs = integer(obj.anschaffungskosten)
  const baujahr = integer(obj.baujahr)
  if (costs === null || baujahr === null) return null
  const rate = depreciationRatePercent(baujahr)
  return rate === null ? null : { rate, amount: Math.round((costs * rate) / 100) }
}

/** Zeilen 13–86: rent, Umlagen, interest, AfA and ongoing costs, the surplus and its split (Z. 86). */
function rentalAmounts(obj: RentalFacts, joint: boolean): Fields {
  const rent = integer(obj.mieteinnahmen)
  const ongoing = integer(obj.werbungskosten)
  if (rent === null || ongoing === null) return {}
  const vValues: Fields = { 'anlV.z13Miete': String(rent), 'anlV.kz01': String(rent) }
  const umlagen = integer(obj.umlagen ?? null) ?? 0
  if (umlagen > 0) vValues['anlV.kz04'] = String(umlagen)
  vValues['anlV.z32Einnahmen'] = String(rent + umlagen)
  const schuldzinsen = integer(obj.schuldzinsen ?? null) ?? 0
  if (schuldzinsen > 0) {
    vValues['anlV.z46Text'] = 'Darlehen für das Objekt'
    vValues['anlV.z46Betrag'] = String(schuldzinsen)
    vValues['anlV.kz33'] = String(schuldzinsen)
  }
  const depreciation = obj.depreciationAsLastYear ? rentalDepreciation(obj) : null
  if (depreciation) {
    vValues['anlV.z33Linear'] = '1'
    vValues['anlV.z33Satz'] = String(depreciation.rate).replace('.', ',')
    vValues['anlV.z33WieVorjahr'] = '1'
    vValues['anlV.z33Afa'] = String(depreciation.amount)
    vValues['anlV.kz30'] = String(depreciation.amount)
  }
  if (ongoing > 0) {
    vValues['anlV.z80Text'] = 'Laufende Werbungskosten'
    vValues['anlV.z80Betrag'] = String(ongoing)
    vValues['anlV.kz49'] = String(ongoing)
  }
  const sum = ongoing + schuldzinsen + (depreciation ? depreciation.amount : 0)
  const surplus = rent + umlagen - sum
  vValues['anlV.werbungskostenSumme'] = String(sum)
  vValues['anlV.ueberschuss'] = String(surplus)
  // Z. 86: in a joint return the result is attributed to both spouses (ADR-0054), half and half by default.
  if (joint) {
    const anteilA = Math.min(100, integer(obj.anteilA ?? null) ?? 50)
    const teilA = Math.round((surplus * anteilA) / 100)
    vValues['anlV.kz20'] = String(teilA)
    vValues['anlV.kz21'] = String(surplus - teilA)
  } else vValues['anlV.kz20'] = String(surplus)
  return vValues
}

/** One Anlage V: the head, the property and — once rent and costs are known — the amounts. */
export function anlageVValues(obj: RentalFacts, index: number, profile: PrintoutFacts['profile'], joint: boolean): Fields {
  const vValues: Fields = { ...formHeader('anlV', profile, profile.steuernummer), 'anlV.lfdNr': obj.sequenceNumber ?? String(index + 1) }
  if (obj.strasse) vValues['anlV.strasse'] = obj.strasse
  if (obj.plz) vValues['anlV.plz'] = obj.plz
  if (obj.city) vValues['anlV.ort'] = obj.city
  if (obj.livingArea) {
    vValues['anlV.wohnflaeche'] = obj.livingArea
    vValues['anlV.z13Wohnflaeche'] = obj.livingArea
  }
  // Several flats of one building go into Z. 13 together, named as such.
  const units = integer(obj.einheiten ?? null)
  if (units !== null && units > 1) vValues['anlV.z13Bezeichnung'] = `${units} Wohneinheiten`
  return Object.assign(vValues, rentalAmounts(obj, joint))
}

export function rentalSection(facts: PrintoutFacts): Section {
  if (!facts.rental || facts.rental.length === 0) return {}
  const missing: string[] = []
  for (const obj of facts.rental) {
    const gap = rentalGap(obj)
    if (gap && !missing.includes(gap)) missing.push(gap)
  }
  return { instances: { 'anlage-v': facts.rental.map((obj, i) => anlageVValues(obj, i, facts.profile, isJoint(facts))) }, missing }
}
