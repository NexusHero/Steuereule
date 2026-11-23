# ADR-0078 — Handwerkerrechnungen lesen (§ 35a Abs. 3 EStG)

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/craftsman-invoice.ts`, `packages/core/src/interview/{interview,advisor,owl-mode}.ts`, `apps/api/src/receipt/parse/auto-receipt-parse.strategy.ts`, `apps/api/src/advisor/advisor.service.ts`, `apps/api/src/printout/`, `apps/api/src/ki/ki.adapter.ts`
- **Baut auf:** ADR-0077 (§ 35a eingeschaltet), ADR-0076 (Belege addieren sich)

## Kontext

Im Echtfall 2024 hatte der Steuerberater die Arbeitskosten aus sechs Handwerkerrechnungen angesetzt (bis zur
Höchstgrenze der Ermäßigung). Die App legte aus keiner Rechnung einen Entwurf an: Das Feld war für Belege nicht
freigegeben, und der Lohnanteil steht selten als eigene Zeile auf der Rechnung.

## Entscheidung

1. **Feste Regel im Kern.** Ein ausgewiesener Lohnanteil („…sind … € inkl. 19 % MwSt. Lohnkosten
   enthalten“) gewinnt. Sonst zählen die Positionen mit Arbeit (Stunden, Montage, An- und Abfahrt, Bagger,
   Bohrung, Herstellen, Verlegen …), gelesen als Blöcke von Positionsnummer zu Positionsnummer, mit dem
   Rabatt der Rechnung und ihrer Umsatzsteuer (aus Gesamt- und Nettobetrag, 0 % bei Photovoltaik). Material
   zählt nie.
2. **Immer „prüfen“.** Der Lohnanteil ist eine Einschätzung; der Entwurf nennt die gezählten Positionen, warnt
   bei Förderung (BAFA, KfW) und erinnert an Überweisung und Zahlungsjahr. Eine Auftragsbestätigung oder ein
   Angebot bekommt keinen Entwurf.
3. **Summe im Jahr.** Der Entwurf rechnet auf den gespeicherten Wert oder auf den noch offenen Entwurf auf;
   mit ihm wandert der Rechnungsbetrag in die neue Frage `haushalt-handwerker-rechnungsbetrag`, die im
   Ausdruck in Zeile 6 der Anlage Haushaltsnahe Aufwendungen steht.
4. **Rechtsquelle `estg-35a`** für Entwürfe und Antworten der Eule.

## Folgen

- Echtfall 2024: fünf von sechs Rechnungen ergeben denselben Lohnanteil wie beim Steuerberater; bei der
  Solaranlage weicht er ab (welche Montagepositionen zählen, ist Ermessen).
- Mehrere Rechnungen stehen als eine Zeile mit Summen im Ausdruck, nicht einzeln.
