# ADR-0046 — Vermietung-Vertikale: mehrere Objekte je Anlage V, lineare AfA, Verkauf/möbliert-Gate (Entwurf)

- **Status:** Draft — promotion needs Musti review (ticket 10.6 review)
- **Date:** 2026-10-25
- **Deciders:** Suhay (agent, Ticket 10.6) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-033 (Vermietung EINFACH; Verkauf/möbliert bleibt Gate), Produkt-ADR-010
  (Einkunftsart `Vermietung`), Produkt-ADR-030 (frei kombinierbar), Produkt-ADR-032 (kein fabricated
  zero)
- **Builds on** ADR-0037 (Einkunftsart-Set), ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0041/0042/
  0044 (die Vertikalen-Muster), ADR-0040 (Belegart-Vokabular)
- **Context tags:** architecture, vermietung, anlage-v, determinism boundary, honesty principle,
  security

## Context

Vermietung wird in 1.0 eine vollwertige Einkunftsart — aber EINFACH (Produkt-ADR-033): mehrere
**ganzjährig vermietete** Objekte, je Objekt eine Anlage V, lineare AfA. Verkauf und
möbliert-auf-Zeit bleiben gegated (privates Veräußerungsgeschäft mit Fristen bzw. eigene
Abgrenzung) — die Grenze wird ehrlich benannt, nicht still erweitert. Die Interview-Antwort
`vermietung-art` (Einfach / Mehrere / Verkauf oder möbliert) existiert bereits im
Segment-2-Graphen (interview.ts `VERMIETUNG_ART_VALUES`) und `gatedEinkunftsarten` gatet
`Vermietung` bereits für die Verkauf/möbliert-Antwort — was fehlt, ist der
Posten-/Anlage-V-Ausbau: die geführte Datenschnittstelle je Objekt, die lineare AfA, und die
Faltung in den deterministischen Kern.

Vermietung unterscheidet sich von Rente (10.4) und Kapital (10.5) strukturell: es gibt
**mehrere Objekte** pro `(userId, steuerjahr)` — der Listen-Charakter ist der Normalfall
(ADR-030: Vermietung+Kapital+Rente+Grenzgänger ist eine normale Kombination), keine Ecke.

## Decision

Ein reines, UI-freies Modul `packages/core/src/vermietung.ts` (ADR-0004, kein I/O), plus der
übliche API-/Screen-Ausbau:

1. **Vermietung-Einordnung (`ordneVermietungEin`)** — die `vermietung-art`-Antwort wird auf das
   abgebildet, was sie BEDEUTET: `einfach`/`mehrere` sind berechenbar (ganzjährig vermietet, je
   Objekt eine Anlage V), `verkauf-oder-moebliert` bleibt gegated (ADR-033 — benannt, nie
   erweitert), `unbekannt` wird nie geraten. Reine Ableitung aus der EINEN Quelle
   (Interview-Antwort), keine denormalisierte Spalte.

2. **Geführte Datenschnittstelle je Objekt (`VermietungsobjektDaten`)** — vier erfasste Fakten:
   Mieteinnahmen (Jahreskaltmiete), Anschaffungskosten (Gebäudeanteil), Baujahr (Fertigstellung),
   laufende Werbungskosten — jeweils `erfasst`/`offen`/`unklar` (dieselbe Ehrlichkeits-
   Zustandsmaschine wie lstb.ts/rente.ts/kapital.ts), Serialisierung in EINER Stelle
   (ADR-0033-Ein-Regel-Instinkt). Werbungskosten dürfen 0 sein — aber diese 0 ist die EINGABE
   des Benutzers, nie eine vom Kern erfundene Null (ADR-032).

3. **Lineare AfA (`afaSatzProzent`)** — § 7 Abs. 4 Satz 1 EStG, die drei gesetzlichen Bänder
   VERBATIM (kein ausgedachter Prozentsatz): bis einschließlich 1924 fertiggestellt → 2,5 %;
   1925–2022 → 2 %; ab 2023 (Wohngebäude, § 7 Abs. 4 Satz 1 Nr. 2 i.d.F. JStG 2022) → 3 %.
   Ein nicht-ganzzahliges/negatives Baujahr ist offen (null), nie geraten.

4. **Fakten je Objekt + Faltung (`vermietungsobjektFakten`/`vermietungStand`)** — die
   Mieteinnahmen werden ein Einnahme-`Posten` der Einkunftsart `Vermietung` mit
   `Quelle: { art: 'eingabe' }`; Werbungskosten und AfA werden SEPARAT gemeldet (Summe über
   alle Objekte, AfA mit `§ 7 Abs. 4 Satz 1 EStG`-Herkunft) — reported, never subtracted: die
   Netto-Rechnung ist der Steuerformel-Slice, dieselbe „partial truth stated as a partial
   truth"-Ehrlichkeit wie angestellte.ts's sonderausgaben. `offenePosten` zählt je Objekt die
   blockierten Ergebnisse (Mieteinnahmen, AfA, Werbungskosten — max 3); `gegated` läuft
   unverändert durch, sodass ein Verkauf/möbliert-Anleger offen mit benanntem Gate liest.

5. **API (`Vermietung`-Modul) + Screen** — eine Zeile PRO OBJEKT
   (`Vermietungsobjekt`-Modell, vier feldencrypted-Spalten, ADR-0008), nicht eine JSON-Spalte:
   das Feldverschlüsselungs-Muster braucht eine Zeile pro Fakt. `GET /v1/steuerjahre/{jahr}/
   vermietung`, `POST …/vermietung/objekte` (legt ein leeres Objekt an), `PUT …/vermietung/
   objekte/{objektId}/{feld}` — fremde/unbekannte `objektId` ist ein 404 (nie ein Cross-User-
   Read). Der Screen zeigt die Einordnung, je Objekt die vier Felder + Fakten (AfA mit
   Herkunft), „Weiteres Objekt hinzufügen" und die Summe — das Verkauf/möbliert-Gate blendet
   die Eingabe aus und benennt die Grenze.

## Consequences

- **M1-Grenze, einmal benannt:** Objekte können angelegt und feldfüllend bearbeitet werden;
  ein Löschen einzelner Objekte gibt es in M1 nicht (ein falsches Objekt wird feldweise zurück
  auf `offen` gesetzt) — ein benannter Follow-up mit dem Einreichungs-/Fassungs-Modell, keine
  stille Lücke. Der Verkauf/möbliert-Fall und alle Sonder-AfA-Fälle (§ 7 Abs. 5 EStG, erhöhte
  Absetzungen) sind NICHT hier.
- **Ehrliche Grenze, einmal benannt:** die Netto-Rechnung (Einnahmen − Werbungskosten − AfA)
  und die daraus folgende Steuer sind der Steuerformel-Slice — hier werden die drei Zahlen
  ehrlich NEBENEINANDER gemeldet, nie still saldiert (ADR-015/032).
- **Security posture:** alle vier Zahlen sind field-encrypted at rest (ADR-0008) — Mieteinnahmen
  und Anschaffungskosten gehören zu den sensibelsten Fakten, joinable zur Steuer-ID; die
  Einordnung ist KEINE eigene Spalte, sondern die (ebenfalls verschlüsselte) Interview-Antwort
  `vermietung-art`; WRITE/READ auditiert (REQ-004). Kein Performance-Achse.
- **Register:** REQ-026; 10.2/10.3/10.4 belegen 022/023/024, 10.5 belegt 025 — beim Merge auf
  Kollision prüfen (10.7 nimmt 027; REQ-Nummern sind stabil und werden nie wiederverwendet).

## Alternatives considered

- **Eine JSON-Spalte für alle Objekte.** Verworfen: bricht das feldverschlüsselte
  Spalten-Muster und die Eindeutigkeit pro Fakt; eine Zeile pro Objekt ist das Muster der
  Nachbar-Vertikalen (ADR-0008) und reviewbar.
- **Nur EIN Objekt pro Jahr (wie Rente).** Verworfen: Produkt-ADR-033 nennt „mehrere Objekte"
  explizit als 1.0-Umfang, und der Listen-Charakter ist der Normalfall (ADR-030) — die
  Einschränkung wäre eine vermeidbare Lücke, keine Ehrlichkeit.
- **AfA-Satz als Formel statt als zitierte Bänder.** Verworfen: die drei Bänder sind direkt aus
  § 7 Abs. 4 Satz 1 EStG zitierbar und im Test gepinnt; eine Formel driftet leichter vom Gesetz
  (dieselbe Begründung wie ADR-0044 für die Renten-Tabellen).
- **Werbungskosten optional mit stiller 0.** Verworfen: eine still erfundene 0 wäre genau der
  fabricated-zero-Fehler, den ADR-032 verbietet — 0 ist eine Benutzereingabe, nie ein
  Kern-Default.
