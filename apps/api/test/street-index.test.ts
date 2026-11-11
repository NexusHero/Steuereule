import { describe, expect, it } from 'vitest'
import { StreetIndex } from '../src/address/street-index.js'

const CSV = [
  'Name,PostalCode,Locality,RegionalKey,Borough,Suburb',
  // The source abbreviates "Straße" throughout; the index spells it out again.
  'Hauptstr.,50667,Köln,05315000,Innenstadt,',
  'Hauptstr.,50667,Köln,05315000,Altstadt,',
  'Domkloster,50667,Köln,05315000,,',
  'Hohe Str.,50667,Köln,05315000,,',
  'Hauptstr.,21039,Börnsen,01053012,,',
  'Hauptstraße,21039,Börnsen,01053012,,',
  'Hauptstr.,10827,Berlin,11000000,,',
  'Hauptstraßenbrücke,10827,Berlin,11000000,,',
  'Berliner Str.,10715,Berlin,11000000,,',
  'Goethe-Str.,10715,Berlin,11000000,,',
  'Str. des 17. Juni,10623,Berlin,11000000,,',
  '"Am ""Alten"" Markt",10623,Berlin,11000000,,',
  'kaputte Zeile ohne Felder',
  'Ohne PLZ,,Nirgendwo,05315000,,',
].join('\n')

const index = StreetIndex.fromCsv(CSV)

function hits(query: string, postalCode?: string) {
  return index.search(query, postalCode ? { postalCode } : {}).hits.map((h) => `${h.street}, ${h.postalCode} ${h.city}`)
}

describe('StreetIndex', () => {
  it('reads each street once per postal code and place, skipping broken rows', () => {
    expect(index.size).toBe(10)
  })

  it('finds a street by the start of its name, ignoring case, umlaut spelling and "str." abbreviations', () => {
    expect(hits('domkl')).toEqual(['Domkloster, 50667 Köln'])
    expect(hits('BERLINER STR.')).toEqual(['Berliner Straße, 10715 Berlin'])
    expect(hits('goethestr')).toEqual(['Goethe-Straße, 10715 Berlin'])
    expect(hits('hohe strasse')).toEqual(['Hohe Straße, 50667 Köln'])
    expect(hits('str des 17')).toEqual(['Straße des 17. Juni, 10623 Berlin'])
  })

  it('carries the Bundesland of each hit', () => {
    expect(index.search('domkloster', {}).hits[0]).toEqual({ street: 'Domkloster', postalCode: '50667', city: 'Köln', state: 'NW' })
  })

  it('puts the exact street name before longer ones and bigger places before smaller ones', () => {
    expect(hits('hauptstr')).toEqual([
      'Hauptstraße, 10827 Berlin',
      'Hauptstraße, 50667 Köln',
      'Hauptstraße, 21039 Börnsen',
      'Hauptstraßenbrücke, 10827 Berlin',
    ])
  })

  it('narrows by a place or postal code typed after the street', () => {
    expect(hits('hauptstr köln')).toEqual(['Hauptstraße, 50667 Köln'])
    expect(hits('Hauptstraße, Koeln')).toEqual(['Hauptstraße, 50667 Köln'])
    expect(hits('hauptstr 21039')).toEqual(['Hauptstraße, 21039 Börnsen'])
  })

  it('prefers the postal code the form already holds', () => {
    expect(hits('hauptstr', '21039')[0]).toBe('Hauptstraße, 21039 Börnsen')
    expect(hits('hauptstr', '21039')).toHaveLength(4)
  })

  it('splits off a house number and hands it back', () => {
    const result = index.search('Hauptstr. 12a, Köln', {})
    expect(result.houseNumber).toBe('12a')
    expect(result.hits.map((h) => h.city)).toEqual(['Köln'])
  })

  it('does not mistake a number inside a street name for a house number', () => {
    const result = index.search('Straße des 17. Juni', {})
    expect(result.houseNumber).toBeNull()
    expect(result.hits.map((h) => h.street)).toEqual(['Straße des 17. Juni'])
    expect(index.search('Straße des 17. Juni 135', {}).houseNumber).toBe('135')
  })

  it('keeps quoted names intact', () => {
    expect(hits('am alten')).toEqual(['Am "Alten" Markt, 10623 Berlin'])
  })

  it('answers nothing for fewer than three letters or an unknown street', () => {
    expect(hits('ha')).toEqual([])
    expect(hits('gibtesnicht')).toEqual([])
    expect(hits('   ')).toEqual([])
  })

  it('caps the number of hits', () => {
    expect(index.search('hauptstr', { limit: 2 }).hits).toHaveLength(2)
  })
})
