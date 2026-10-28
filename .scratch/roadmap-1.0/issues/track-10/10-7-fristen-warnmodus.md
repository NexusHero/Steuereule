# 10.7 — Fristen-/Verspätungszuschlag-Warnmodus (M6, § 152 AO)

**What to build:** Ein Warnmodus, der **ab 60 Tage vor der Abgabefrist** vor dem
Verspätungszuschlag (§ 152 AO) warnt. Kein eigener `verspätet`-Zustand: die verpasste Frist bleibt
`entwurf` + Warnbanner (Engineering-Entwurf 0039 — ein technischer/zeitlicher Zustand darf nie wie ein
Steuer-Status aussehen).

**Blocked by:** **15** (Cockpit-Oberfläche für das Warnbanner) · Engineering-Entwurf 0039
(Zustandsmaschine: Abgabe-/Frist-Bezug), promotet. **Soft-Dep:** 10.8 (rückwirkende Jahre haben
eigene Fristen; das Warnmodell teilt sich den Jahr-/Frist-Begriff).

**Status:** done — gemergt als #376 (69385df)

- [x] Abgabefrist je Steuerjahr bestimmt (Regelwerk pro Jahr, ADR-022) — nie „aktuelle" Werte
- [x] Warnbanner ab 60 Tage vor Frist, mit Betrags-/Frist-Angabe, nüchtern (ADR-023)
- [x] Verpasste Frist: `entwurf` + Banner, KEIN `verspätet`-Status (Entwurf 0039)
- [ ] Rückwirkende Jahre (bis 4) bekommen ihre eigenen Fristen (mit 10.8)
- [x] TDD, typecheck + lint grün, Posture-Zeile

**Register-REQ: `REQ-027`** (nächste freie Nummer nach 024; 10.5/10.6 belegen 025/026 auf den
Parallel-Branches — beim Merge prüfen, REQ-Nummern sind stabil und werden nie wiederverwendet).
**ADR-0047** (Fristen-Warnmodus, Draft — Promotion im Ticket-Review; 0046/0048 gehören
10.6/10.5 auf den Parallel-Branches, 0045 ist vom Value-First-Funnel belegt). Rückwirkende
Jahre (Häkchen 4) sind explizit MIT 10.8 — hier nicht gebaut.
