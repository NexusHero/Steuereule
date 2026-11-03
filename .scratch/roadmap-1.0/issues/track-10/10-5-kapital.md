# 10.5 — Kapital inkl. ausländische Broker (Produkt-ADR-032); Krypto → 2.0

**What to build:** Kapitalerträge als Einkunftsart: deutsche Depots (Abgeltungsteuer,
Sparerpauschbetrag, **Günstigerprüfung § 32d Abs. 6**) plus **ausländische Broker** (IBKR,
Revolut — keine Steuer abgeführt → KAP-Pflicht; genau die junge Zielgruppe).

**Namens-Disziplin (Engineering-ADR-0034 §1):** Hier ist die echte **Günstigerprüfung** (§ 32d
Abs. 6) — der Begriff gehört *diesem* Ticket, nicht dem Veranlagungsartenvergleich (10.2). Die
beiden Vergleiche sind verschiedene Dinge und dürfen nie wieder denselben Namen tragen.

**Krypto bleibt 2.0** (Produkt-ADR-032): privates Veräußerungsgeschäft, Haltefristen, eigene
Beschaffungslogik — ehrliches Gate mit Vormerken (sobald Vormerken-Speicher existiert, sonst nur
die ehrliche Gate-Aussage, ADR-032 §2).

**Blocked by:** **15** (Kern + `berechne` für die § 32d-Günstigerprüfung) · Engineering-Entwurf
0037 (Einkunftsart-Set `Kapital`), promotet.

**Status:** done — gemergt als #376 (69385df)

- [x] `Kapital` als Einkunftsart; Depot-Posten mit Herkunft (Beleg/KI-Vorschlag)
- [x] § 32d-Günstigerprüfung: Abgeltungsteuer vs. persönlicher Satz, mit Unschärfe-Bound (ADR-0034-
      Muster), nie ein nacktes Urteil
- [x] Ausländischer Broker → KAP-Pflicht ehrlich benannt (keine Steuer abgeführt)
- [x] Krypto-Gate: ehrliche Aussage, kein halbes Feature (ADR-032)
- [x] TDD, typecheck + lint grün, Posture-Zeile

**Register-REQ: `REQ-025`** (nächste freie Nummer nach 024). Kollisionsvermerk: 10.2/10.3/10.4
belegen 022/023/024 — beim Merge prüfen (10.6 nimmt 026; REQ-Nummern sind stabil und werden nie
wiederverwendet). **ADR-0048** (Kapital-Vertikale, Draft — Promotion im Ticket-Review; 0045 ist
vom Value-First-Funnel-Branch belegt, 0046/0047 von 10.6/10.7 — deshalb 0048).
