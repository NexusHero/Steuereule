# 10.6 — Vermietung einfach (Produkt-ADR-033); Verkauf/möbliert bleibt Gate

**What to build:** Vermietung als Einkunftsart, aber **einfach**: mehrere **ganzjährig vermietete**
Objekte (je Objekt eine Anlage V, lineare AfA). **Verkauf und möbliert-auf-Zeit bleiben gegated**
(ADR-033) — die Grenze wird ehrlich benannt, nicht still erweitert.

**Blocked by:** **15** (Kern + `berechne` für die Anlage-V-Posten) · Engineering-Entwurf 0037
(Einkunftsart-Set `Vermietung`), promotet.

**Status:** ready-for-agent

- [ ] `Vermietung` als Einkunftsart; mehrere Objekte je eine Anlage V, lineare AfA
- [ ] Werbungskosten je Objekt mit Herkunft; offen wo offen — kein fabricated zero (ADR-032)
- [ ] Verkauf/möbliert-auf-Zeit: ehrliches Gate (kein halbes Feature, ADR-033)
- [ ] Kombinierbarkeit Vermietung+Rente+Kapital+Grenzgänger explizit getestet (ADR-030)
- [ ] TDD, typecheck + lint grün, Posture-Zeile
