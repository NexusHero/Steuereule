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

**Status:** ready-for-agent

- [ ] `Rente` als Einkunftsart im Kern (ADR-037-Entwurf), Besteuerungsanteil nach Rentenbeginn-Jahr
- [ ] Rentenbezugsmitteilung als Dokumenttyp in der Beleg-Inbox (10.1-Vokabular)
- [ ] Anlage-R-Posten in `berechne` mit Herkunft, offen wo offen — kein fabricated zero (ADR-032)
- [ ] Kombinierbarkeit Rente+Vermietung+Kapital+Grenzgänger explizit getestet (ADR-030/034)
- [ ] TDD, typecheck + lint grün, Posture-Zeile
