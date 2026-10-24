# 10.7 — Fristen-/Verspätungszuschlag-Warnmodus (M6, § 152 AO)

**What to build:** Ein Warnmodus, der **ab 60 Tage vor der Abgabefrist** vor dem
Verspätungszuschlag (§ 152 AO) warnt. Kein eigener `verspätet`-Zustand: die verpasste Frist bleibt
`entwurf` + Warnbanner (Engineering-Entwurf 0039 — ein technischer/zeitlicher Zustand darf nie wie ein
Steuer-Status aussehen).

**Blocked by:** **15** (Cockpit-Oberfläche für das Warnbanner) · Engineering-Entwurf 0039
(Zustandsmaschine: Abgabe-/Frist-Bezug), promotet. **Soft-Dep:** 10.8 (rückwirkende Jahre haben
eigene Fristen; das Warnmodell teilt sich den Jahr-/Frist-Begriff).

**Status:** ready-for-agent

- [ ] Abgabefrist je Steuerjahr bestimmt (Regelwerk pro Jahr, ADR-022) — nie „aktuelle" Werte
- [ ] Warnbanner ab 60 Tage vor Frist, mit Betrags-/Frist-Angabe, nüchtern (ADR-023)
- [ ] Verpasste Frist: `entwurf` + Banner, KEIN `verspätet`-Status (Entwurf 0039)
- [ ] Rückwirkende Jahre (bis 4) bekommen ihre eigenen Fristen (mit 10.8)
- [ ] TDD, typecheck + lint grün, Posture-Zeile
