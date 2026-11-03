# 10.4 — Rentner (Produkt-ADR-034, Anlage R)

**What to build:** Die Rente wird eine vollwertige Einkunftsart: gesetzliche Rente + Betriebsrente
(Anlage R), Besteuerungsanteil automatisch nach Rentenbeginn-Jahr, **frei kombinierbar** mit allen
anderen Einkunftsarten (Rentner mit Vermietung/Kapital ist der Normalfall, ADR-030/034). Die
Interview-Frage „Rente" existiert bereits im Minimal-Gate — hier kommt der Posten-/Anlage-R-Ausbau.

**Rentenarten 1.0 (ADR-036 §3):** gesetzliche Rente, Betriebsrente/PK DE, private Rentenversicherung
(Ertragsanteil), Witwen-/Waisenrente, ausländische Rente (CH AHV). Rentenbezugsmitteilung als
eigener Dokumenttyp in der Inbox.

**Blocked by:** **15** (deterministischer Kern + Interview-Katalog) · Engineering-Entwurf 0037
(Einkunftsart-Set `Rente`), promotet.

**Status:** done — gemergt als #375 (6071ee4)

- [x] `Rente` als Einkunftsart im Kern (ADR-037-Entwurf), Besteuerungsanteil nach Rentenbeginn-Jahr
- [x] Rentenbezugsmitteilung als Dokumenttyp in der Beleg-Inbox (10.1-Vokabular)
- [x] Anlage-R-Posten in `berechne` mit Herkunft, offen wo offen — kein fabricated zero (ADR-032)
- [x] Kombinierbarkeit Rente+Vermietung+Kapital+Grenzgänger explizit getestet (ADR-030/034)
- [x] TDD, typecheck + lint grün, Posture-Zeile

**Register-REQ: `REQ-022`** (nächste freie Nummer nach 021). Kollisionsvermerk: 10.2
(Günstigerprüfung) und 10.3 (Bescheidprüfung) belegen parallel ggf. ebenfalls 022/023 — beim Merge
auflösen (wer 023 bekommt, entscheidet die Merge-Reihenfolge; REQ-Nummern sind stabil und werden nie
wiederverwendet).
