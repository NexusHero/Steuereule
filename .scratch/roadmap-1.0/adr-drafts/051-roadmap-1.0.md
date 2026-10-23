# ADR-051 — Roadmap 1.0: Ziel, Tracks, Phasen, Zeitrahmen (ENTWURF)

**Status:** Vorgeschlagen (Entwurf — Grilling-Session 2026-10-23; Review durch Musti steht aus) · 2026-10-23

**Kontext:** Das Projekt hat einen diszipliniert getesteten Mantel (REQ-001–014), aber die
eigentliche Produktfunktion (Produkt-ADRs 001–042) existiert nur auf Papier, der Code zeigt
Eigenbau-Stellen und unverbundene Slices, und es gibt keine Deployment-Pipeline (#292). Der
Stakeholder hat entschieden: Steuereule wird ein **echtes Produkt**, das mit Taxfix, WISO,
wundertax und Steuerbot konkurriert (D1), mit dem **kompletten 1.0-Umfang** als Ziel (D2).

**Entscheidung:** Eine gestufte Roadmap mit drei Tracks:

1. **Code-Track:** Phase 0 Foundation (Hygiene → Framework-Ersatz → Verdrahtung →
   Domänenkern → Mantel-Abschluss; Details in Engineering-ADR-0028) → Phase 1 zwei Vertikalen
   **parallel** (Angestellte ∥ Grenzgänger-CH) → Phase 2 Verbreiterung → Phase 3
   Go-Live-Readiness. Vollständig in `docs/roadmap-1.0.md`.
2. **Infra-Track:** #292 (k3s/Hetzner, managed EU-Postgres, Redis, CI/CD, Observability,
   Backups/DR, arm64-Verifikation) ab der Foundation parallel (D7) — die Lücke, die ADR-0026
   offen gelassen hat.
3. **ELSTER-Track (extern):** Hersteller-Zertifikat wird **sofort** beantragt (D8); 1.0
   shippt „abgabe-bereit", die Übermittlung aktiviert sich bei Zertifikats-Eingang
   (ADR-005/-017; Beta bis dahin kostenlos).

**Parallel-Tracks-Entscheidung (D5):** Angestellte und Grenzgänger-CH werden gleichzeitig
gebaut — bewusst gegen die Lehre aus ADR-0015, die die *Review*-Kapazität als Engpass
identifiziert hat. Gegenmittel: der geteilte Domänenkern (Engineering-ADR-0028) als
gemeinsame Naht, ein gemeinsames Kern-Review-Gate, und Review bleibt in der Planung der
Engpass. Die Vertikalen sind zwei Fallwelten **eines** Kerns, nicht zwei Apps.

**Mantel-Abschluss in der Foundation (D9):** REQ-007/008/009 werden vor den Produktfeatures
gebaut — der gesamte Bestand ist fertig und aufgeräumt, bevor Neues entsteht. Damit
**superseded** diese Entscheidung Produkt-ADR-027(b) („keine 2FA in 1.0") auf genau diesem
Punkt; das Amendment wird im Research-ADR-Log nachgezogen (Durchsetzungsort: Ticket 05).

**Qualitätslatte (D3):** kein Eigenbau wo das Framework die Antwort ist, Slices als ein
Produkt verdrahtet, Kommentare warum-only. Durchsetzung über die vier DoD-Ebenen
(Engineering-ADR-0029).

**Zeitrahmen (D12):** keine Kalenderdaten; relative Phasen in Crew-Slices. Einziger externer
Taktgeber ist der ELSTER-Antrag. Ein Zieldatum, falls es entsteht, justiert den Plan
rückwärts — als explizite Entscheidung.

**Planform (D10):** eine Wahrheit, drei Sichten — `docs/roadmap-1.0.md` im Repo, Tickets mit
Blocking-Edges unter `.scratch/roadmap-1.0/issues/` (bzw. GitHub bei Publikation), Phasen als
progress.db-Kontexte.

**Prozess (D11):** Der bestehende Crew-Flow bleibt unverändert — `to-spec` → `to-tickets` →
`implement` (TDD) → `code-review`; dieser Plan speist ihn, ersetzt ihn nicht.

**Agenten-Besatzung (D21):** vier Pro-Rollen gleichzeitig — zwei Full-Stack-Autoren (Track A/B;
P0 nur einer, die Foundation ist eine strikte Kette), ein dedizierter Reviewer (authored nie,
frischer Kontext pro Draft-PR, ADR-0022), ein Infra-/DevOps-Agent (Track 06). NexusHero
orchestriert; der ELSTER-Antrag ist kein Agenten-Job. Mehr Autoren sind durch den Blocking-Graphen
und den Review-Engpass (ADR-0015) nicht schneller; Ausnahme nur in P2 bei leerer Review-Queue
(Autoren ≤ Review-Durchsatz − 1).

**Konsequenzen:**

- Phase 1 shippt nur auf einer echten Umgebung (Phase-DoD) — Deployment ist damit
  Voraussetzung für Produktfortschritt, nicht Nachzügler.
- Der Domänenkern trägt die Hauptlast der Parallelität; divergiert er, divergieren beide
  Tracks — das gemeinsame Kern-Review-Gate ist Pflicht, kein Nice-to-have.
- Der 1.0-Umfang bleibt sehr groß. Reißt die Kapazität, bleiben Rentner/Kapital/Vermietung
  ehrlich „gegated" (Entscheidung nur durch NexusHero, sichtbar im Register).
- Neue Produkt-REQs entstehen beim Schneiden der Phasen; das Register bleibt die einzige
  Status-Quelle (REQ-DoD, Engineering-ADR-0029).
- Dieser ADR steht bewusst im Research-Log: D1/D2/D5/D8 sind Produkt-/Geschäfts-Entscheidungen;
  die Engineering-Konsequenzen delegieren an Engineering-ADR-0028/0029 und den Master
  `docs/roadmap-1.0.md` (Referenzrichtung: Engineering-ADRs verweisen auf den Master, nicht
  umgekehrt auf diesen ADR).

**Entscheidungs-Historie:** 2026-10-23 — Entwurf aus der Roadmap-Grilling-Session
(D1, D2, D3, D5, D7, D8, D9, D10, D11, D12, D21). Rev 2 nach Mustis Re-Review (GO).
