# ADR-0048 — Kapital-Vertikale: Depot-Einordnung, Kapitalerträge-Maske, § 32d-Günstigerprüfung (bounded comparison) (Entwurf)

- **Status:** Draft — promotion needs Musti review (ticket 10.5 review)
- **Date:** 2026-10-25
- **Deciders:** Suhay (agent, Ticket 10.5) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-032 (Kapitalerträge in 1.0, Krypto bleibt 2.0), Produkt-ADR-010
  (Einkunftsart `Kapital`), Produkt-ADR-030 (frei kombinierbar), Produkt-ADR-032 (kein fabricated
  zero)
- **Builds on** ADR-0037 (Einkunftsart-Set), ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0034
  (bounded comparison, Günstigerprüfungs-Namensreservierung), ADR-0040 (Belegart-Vokabular),
  ADR-0043 (Soli/KiSt eingefaltet, Unschärfe nur noch der Progressionsvorbehalt)
- **Context tags:** architecture, kapital, anlage-kap, guenstigerpruefung, determinism boundary,
  honesty principle, security

## Context

Kapitalerträge werden in 1.0 eine vollwertige Einkunftsart (Produkt-ADR-032): deutsche Depots
(Abgeltungsteuer, Sparerpauschbetrag, **Günstigerprüfung § 32d Abs. 6**) plus ausländische Broker
(IBKR, Revolut — keine Steuer abgeführt → KAP-Pflicht; genau die junge Zielgruppe). Krypto bleibt
2.0 (privates Veräußerungsgeschäft, Haltefristen, eigene Beschaffungslogik — ehrliches Gate).
Die Interview-Antwort `kap-depot` (Deutscher Broker / Ausländischer Broker / Krypto) existiert
bereits im Segment-2-Graphen (interview.ts `KAP_DEPOT_VALUES`) und `gatedEinkunftsarten` gatet
`Kapital` bereits für die Krypto-Antwort — was fehlt, ist der Posten-/Anlage-KAP-Ausbau: die
geführte Datenschnittstelle für die Jahressteuerbescheinigung, die Depot-Einordnung, und die
§ 32d-Günstigerprüfung als bounded comparison nach dem ADR-0034-Muster.

Namens-Disziplin (ADR-0034 §1): **Dieses** Ticket trägt den Namen „Günstigerprüfung" (§ 32d
Abs. 6 EStG) — der Veranlagungsartenvergleich (10.2) heißt nicht so, und umgekehrt. Zwei
verschiedene Vergleiche, zwei Namen, nie wieder einer.

## Decision

Ein reines, UI-freies Modul `packages/core/src/kapital.ts`, ein zweites
`packages/core/src/guenstigerpruefung.ts` (ADR-0004, kein I/O), plus eine Belegart-Erweiterung,
plus der übliche API-/Screen-Ausbau:

1. **Depot-Einordnung (`ordneKapDepotEin`)** — die `kap-depot`-Antwort wird auf das abgebildet,
   was sie für die Steuererklärung BEDEUTET: `deutscher-broker` (Abgeltungsteuer einbehalten —
   die Günstigerprüfung ist die hier anwendbare Frage), `auslaendischer-broker` (keine deutsche
   Steuer abgeführt → Pflichtveranlagung Anlage KAP, tarifliche Besteuerung — die KAP-Pflicht
   wird ehrlich benannt, nie eine Abgeltung erfunden), `krypto` (gegated, ADR-032 §2),
   `unbekannt` (nie geraten). Die Einordnung ist eine reine Ableitung aus der EINEN Quelle
   (Interview-Antwort) — keine denormalisierte Spalte, die driften kann.

2. **Geführte Datenschnittstelle (`KapitalDaten`)** — ein erfasstes Faktum: die Kapitalerträge
   (Einkünfte aus Kapitalvermögen, ganze Euro), `erfasst`/`offen`/`unklar` (dieselbe
   Ehrlichkeits-Zustandsmaschine wie lstb.ts/rente.ts). Serialisierung in EINER Stelle
   (ADR-0033-Ein-Regel-Instinkt). Faltung: `kapitalAlsKernposten` → `Posten` der Einkunftsart
   `Kapital` mit `Quelle: { art: 'eingabe' }` (die geführte Maske ist eine Transkription; die
   Beleg-/KI-Vorschlag-Herkunft trägt der `Quelle`-Vertrag bereits — sie ist der
   Zuordnungs-Slice, ein benannter Follow-up, kein halbes Feature hier); `kapitalStand` faltet
   über `berechne` und reicht `gegated` unverändert durch — ein Krypto-Anleger liest offen mit
   benanntem Gate.

3. **`guenstigerpruefung.ts` — § 32d Abs. 6 EStG als bounded comparison (ADR-0034-Muster):**
   - `abgeltung`: 25 % auf (Kapitalerträge − Sparerpauschbetrag § 20 Abs. 9: 1.000 € einzeln /
     2.000 € zusammen) + Soli (§ 4 SolZG) + KiSt mit der § 32d Abs. 1 Satz 4-Ermäßigung (die
     Abgeltungsteuer ermäßigt sich um 25 % der entfallenden KiSt). Alle Sätze zitiert, keine
     erfundene Konstante.
   - `persoenlich`: die tarifliche Steuer auf den Kapitalertrags-Anteil = § 32a-Tarif auf
     (übriges zvE + Kapitalerträge) − Tarif auf übriges zvE, plus die Soli-Differenz (die
     Freigrenze macht den Soli nichtlinear — Differenz, nie ein Zuschlag auf die Differenz) und
     die KiSt; Zusammenveranlagung = Splitting (§ 32a Abs. 5) auf die kombinierte Basis.
   - Ergebnis ist die ADR-0034-Union: `aussage` `eindeutig` (mit `empfehlung`) / `zu-knapp` /
     `unbestimmt` — `empfehlung` existiert NUR auf `eindeutig`, der Compiler verweigert die
     Abkürzung. `unschaerfe` ist die EINE Schranke-Definition aus dem Veranlagungsartenvergleich
     (`progressionsvorbehaltSchranke`, dafür exportiert): der Progressionsvorbehalt (§ 32b) ist
     der einzige ausgeschlossene Faktor, der das Ergebnis kippen kann. `eindeutig` nur, wenn die
     Schranke bestimmt ist UND |delta| sie übersteigt. Ebene 3 bleibt offen: `uebrigesZvE` ist
     eine Einnahmen-Basis (kein echtes zvE), das trägt `herkunft` ehrlich mit.

4. **`Steuerbescheinigung` als Belegart** — die `Belegart`-Union (ADR-0040) wächst um einen Wert
   (die Jahressteuerbescheinigung der Bank), kein Rename, keine Semantik-Änderung bestehender
   Werte.

5. **API (`Kapital`-Modul) + Screen** — `GET`/`PUT /v1/steuerjahre/{jahr}/kapital[/
   {feld}]`, eine Zeile pro `(userId, steuerjahr)`, `kapitalertraege` feldencrypted at rest
   (ADR-0008). `GET .../kapital/guenstigerpruefung` rechnet NUR über @steuereule/core und
   benennt die ehrlichen Gates (`nicht-anwendbar`): ausländischer Broker
   (`keine-abgeltung-einbehalten`), Krypto (`krypto-gegated`), unbeantwortetes kap-depot
   (`kap-depot-nicht-beantwortet`), fehlende Kapitalerträge (`keine-kapitalertraege`) — nie ein
   erfundener Vergleich. Der Screen zeigt die Depot-Einordnung, das Feld, den Posten mit
   Herkunft und die Günstigerprüfung mit `aussage` zuerst.

## Consequences

- **M1-Grenzen, einmal benannt:** `uebrigesZvE` der Günstigerprüfung ist die LStB-Einnahmen-
  Basis desselben Steuerjahres (wie der Veranlagungsartenvergleich 10.2 sie verwendet) — Rente/
  Vermietung/CH sind noch nicht eingefaltet (Ebene 3 offen, trägt `herkunft`). Zusammenveranlagung
  rechnet der Kern, die API dient M1 einzeln (Partner-Figuren werden nie erfunden — benannter
  Follow-up). KiSt ist ein Query-Eingang (M1 erhebt sie noch nicht, Standard 0).
- **Ehrliche Grenze, einmal benannt:** Verlustverrechnung, ausländische Quellensteuer-Anrechnung
  (§ 32d Abs. 5), § 32d Abs. 2-Fälle (Beteiligungen) und die KiSt-Kappung sind NICHT hier —
  benannte Follow-ups, keine stille Näherung.
- **Krypto bleibt 2.0:** das Gate ist die ehrliche Aussage (Screen + `gatedEinkunftsarten`),
  kein halbes Feature (ADR-032 §2).
- **Security posture:** `kapitalertraege` ist field-encrypted at rest (ADR-0008) — tatsächliches
  Kapitalvermögen ist eines der sensibelsten Fakten, joinable zur Steuer-ID; die Depot-Einordnung
  ist KEINE eigene Spalte, sondern die (ebenfalls verschlüsselte) Interview-Antwort `kap-depot`;
  WRITE/READ auditiert (REQ-004). Kein Performance-Achse.
- **Register:** REQ-025; die Nachbar-Tickets belegen 022/023/024 — beim Merge auf Kollision
  prüfen (10.6 nimmt 026).

## Alternatives considered

- **Abgeltungsteuer ohne Sparerpauschbetrag.** Verworfen: § 20 Abs. 9 EStG ist zitierbar und
  verändert die Bemessungsgrundlage erheblich — weglassen wäre eine stille Verfälschung, keine
  Vereinfachung.
- **KiSt als Unschärfe-Schranke statt eingefaltet.** Verworfen: die § 32d Abs. 1 Satz 4-Ermäßigung
  ist zitierbar; eingefaltet bleibt die Unschärfe ausschließlich der Progressionsvorbehalt —
  dieselbe Form wie der Veranlagungsartenvergleich (ADR-0043), eine Schranke-Definition für beide.
- **Depot-Art als eigene Prisma-Spalte.** Verworfen: eine denormalisierte Kopie der
  Interview-Antwort kann driften (ADR-0033-Defektklasse); die Ableitung aus der einen Quelle ist
  rein und testbar.
- **Günstigerprüfung für ausländische Broker „miterfinden".** Verworfen: dort wurde nie
  Abgeltungsteuer einbehalten, der Vergleich ist gegenstandslos — die ehrliche
  `nicht-anwendbar`-Antwort ist die KAP-Pflicht-Benennung selbst (ADR-032).
