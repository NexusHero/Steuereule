# 10.6 — Vermietung einfach (Produkt-ADR-033); Verkauf/möbliert bleibt Gate

**What to build:** Vermietung als Einkunftsart, aber **einfach**: mehrere **ganzjährig vermietete**
Objekte (je Objekt eine Anlage V, lineare AfA). **Verkauf und möbliert-auf-Zeit bleiben gegated**
(ADR-033) — die Grenze wird ehrlich benannt, nicht still erweitert.

**Blocked by:** **15** (Kern + `berechne` für die Anlage-V-Posten) · Engineering-Entwurf 0037
(Einkunftsart-Set `Vermietung`), promotet.

**Status:** ready-for-agent

- [x] `Vermietung` als Einkunftsart; mehrere Objekte je eine Anlage V, lineare AfA
- [x] Werbungskosten je Objekt mit Herkunft; offen wo offen — kein fabricated zero (ADR-032)
- [x] Verkauf/möbliert-auf-Zeit: ehrliches Gate (kein halbes Feature, ADR-033)
- [x] Kombinierbarkeit Vermietung+Rente+Kapital+Grenzgänger explizit getestet (ADR-030)
- [x] TDD, typecheck + lint grün, Posture-Zeile

**Register-REQ: `REQ-026`** (nächste freie Nummer nach 024; 10.5 belegt 025 auf dem Parallel-Branch —
beim Merge prüfen, REQ-Nummern sind stabil und werden nie wiederverwendet). **ADR-0046**
(Vermietung-Vertikale, Draft — Promotion im Ticket-Review; 0048 gehört 10.5 auf dem
Parallel-Branch, 0045 ist vom Value-First-Funnel belegt).
