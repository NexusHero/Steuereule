# ADR-0065 — Address search via our own server (deviation from #451 decisions 7 and 8)

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/address/`, `apps/api/scripts/fetch-street-data.ts`, `apps/mobile-web/src/screens/shared/AddressSearch.tsx`; master data, rental income (property address), children (address of the other parent)
- **Deviates from:** Ticket #451 decision 7 ("no outbound request" for addresses) and decision 8 (address data shipped only with the app)

## Context

#451 limited address entry to two aids: autofill hints for the browser and a
postcode (PLZ) table shipped with the app. Neither leaves the device. In testing by the
Product Owner (11 November 2026) this was not enough: browser autofill only works if an address is
already stored in the browser, and the street is still typed entirely by hand. What is expected
is a search like in a maps app: type a few letters, select the address.

A street list for all of Germany has around 1.19 million entries (55 MB source). That is too large
to pack into the app like the postcode table (~240 KB).

## Decision

**The street search runs on our own server. No third party sees the input.**

1. **Data:** the same OpenStreetMap street list from the OpenPLZ API project (ODbL 1.0) from which
   the postcode table is already built, pinned to the same commit.
   `pnpm --filter @steuereule/api run streets:fetch` downloads it, checks the SHA-256 checksum and places
   a manifest next to it (like the geo-IP database, ADR-0024). The file is not checked in.
2. **In-memory search:** On startup, the API reads the file from `STREET_DATA_PATH` into a
   sorted index (measured: ~2 s load time, ~45 MB heap, response under 15 ms). No database,
   no migration.
3. **Endpoint `POST /v1/adressen/suche`:** POST instead of GET, so that the typed address does not end up in URLs,
   access logs or proxy caches. The request is not stored. Limited to
   120 requests per minute per account or IP.
4. **Honest without data:** If the file is missing, the endpoint responds `available: false`. The screen
   then says that the search is not available, and the fields are typed as before.
5. **One search field above the address fields:** "Hauptstr. 12, Köln" → selecting fills street,
   house number, postcode and city. The individual fields, browser autofill and the postcode lookup from #451 remain.

## Limits

- **No house numbers in the data.** The house number is taken from the input, not checked.
- **No „Meinen Standort verwenden" ("Use my location").** The data has no coordinates; GPS remains excluded per #451
  decision 7.
- **Spelling:** The source abbreviates "Straße" as "Str." throughout. The index writes it
  out again ("Hauptstraße"). A street whose official name is "…str." would thus be written out
  incorrectly; the field remains editable.
- **Germany only.**

## Consequences

- Operations must provide the file and set `STREET_DATA_PATH` (locally this is done by
  `scripts/local.sh dev`). The API process needs around 50 MB more memory and starts ~2 s later.
- Annual update together with the postcode table: bump the commit in both scripts,
  adjust the checksum.
- The privacy policy mentions the processing of the search input on our own server
  (no storage, no third party).

## Rejected

- **Google Places or similar:** best hit quality including house numbers, but every input goes to
  a third party.
- **Public OSM services (Photon, Nominatim):** also a third party, plus usage limits.
- **Street list in the app:** 55 MB source, even compressed double-digit MB in the bundle.
