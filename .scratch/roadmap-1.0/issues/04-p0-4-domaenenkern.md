# 04 — Phase 0.4: Geteilter Steuer-Domänenkern

**What to build:** Der gemeinsame Fachkern, in den beide Vertikalen (Phase 1) einstecken —
die tiefste Nahtstelle der Roadmap und die Antwort auf „Slices nicht verbunden". Lieferumfang:
Steuerjahr-/Einkunftsarten-Modell, deterministischer Berechnungs-Kern mit klarer KI-Grenze,
Interview-Engine-Gerüst (Katalog + Zustandsmaschine), Beleg-Posteingang-Schnitt. Nichts davon
darf von einer konkreten Einkunftsart abhängen.

**Blocked by:** 03 — Phase 0.3: Verdrahtung

**Status:** ready-for-agent

- [ ] Einkunftsarten-/Steuerjahr-Modell in `packages/core` (ADR-006/-010/-030), UI-frei,
      von API, web und mobile geteilt; Kombinierbarkeit getestet (ADR-030)
- [ ] Deterministischer Berechnungs-Kern mit port-basierter KI-Grenze (ADR-048):
      KI schlägt vor, legt nie selbst an (ADR-014); Kern ist ohne KI-Injektion voll
      testbar und tut dann das Richtige
- [ ] Interview-Engine-Gerüst: Katalog-Schnitt, Zustandsmaschine (ADR-018: Rückfrage/
      Extern-erledigt als Zustände), on-demand-Erweiterbarkeit (ADR-016/035)
- [ ] Beleg-Posteingang-Schnitt (ADR-007/008): Upload ohne Jahresbindung,
      Zuordnungs-Vorschlag, sichtbarer Konflikt-Zustand statt stilles Überschreiben
- [ ] Acceptance-Tests auf der vom jeweiligen ADR geforderten Tier; ADR-Entwürfe für jede
      neue Kern-Entscheidung

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
