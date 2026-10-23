# Roadmap Steuereule 1.0

**Status:** Akzeptiert (Grilling-Session 2026-10-23) · **Decider:** NexusHero (Stakeholder), gegrillt und gegengeprüft von Musti (Lead-Rolle)

**Wo die Tickets leben:** `.scratch/roadmap-1.0/issues/` (eine Datei pro Ticket, Blocking-Edges im Tracer-Format). **Wo die ADRs leben:** `docs/adr/0035` und `0036` (Engineering) bzw. `finanzo-funke-design-system/project/research/adr/051` (Produkt) — promotet nach Mustis Re-Review (GO); der Review-Report liegt unter `.scratch/roadmap-1.0/adr-review-findings.md`.

## Ziel

Steuereule wird ein **echtes Produkt**, das mit Taxfix, WISO Steuer, wundertax und Steuerbot
konkurriert (D1). Funktionales Ziel ist die **komplette 1.0-Vision** aus den Produkt-ADRs
001–042: Angestellte in 5 Lebenslagen, Grenzgänger-CH, Rentner, Kapital, Vermietung (einfach),
Beleg-Inbox, Günstigerprüfung, Bescheidprüfung, Fristen-Warnmodus, Eulen-KI — nicht ein
Einzelschnitt, sondern eine gestufte Roadmap (D2).

Die Qualitätslatte (D3): **professionelles Engineering statt AI-Blähe.**

1. **Kein Eigenbau, wo das Framework die Antwort ist** — NestJS-Standard und etablierte
   Bibliotheken zuerst; jede Abweichung braucht eine ADR.
2. **Slices sind ein Produkt, keine Sammlung** — eine Navigation, ein Session-/Datenfluss,
   ein geteilter Domänenkern.
3. **Kommentare erklären warum, nie was** — Dateikopf-Kommentare werden bei Berührung getrimmt.
4. Messbare Durchsetzung über die **Definition of Done** (siehe unten).

## Drei Tracks

| Track | Inhalt | Start |
|---|---|---|
| **Code** | Phasen 0–3 unten | sofort |
| **Infra** | #292: k3s/Hetzner + managed EU-Postgres + Redis, CI/CD, Observability, Backups/DR, arm64-Verifikation (D7) | parallel zur Phase 0 |
| **ELSTER (extern)** | Hersteller-Zertifikat beantragen — langer Behörden-Vorlauf, läuft ab sofort (D8) | sofort, Owner: NexusHero |

## Phasen

### Phase 0 — Foundation (Code-Track, intern strikt sequenziert: 0.1 → 0.5)

| # | Ticket | Inhalt |
|---|---|---|
| 0.1 | Hygiene | Ein Lockfile (pnpm; `package-lock.json` raus), `.gitignore` vollständig (`.DS_Store`), Gates grün, PR-Checkliste (DoD) ins Template |
| 0.2 | Framework-Ersatz | Feste Liste: `@nestjs/throttler` ersetzt die drei handgerollten Limiter + eigene `RateLimit`-Tabelle · Fastify `trustProxy` ersetzt den `trusted-proxies.ts`-Resolver · better-auth-Device-Plugin fixt sein Cookie selbst, `session-cookie.ts`-Nachbau fliegt · Prüfung weiterer Eigenbauten gegen NestJS-Standard |
| 0.3 | Verdrahtung | Eine Navigation als *ein* Produkt, ein gemeinsamer Session-/Datenfluss statt Pro-Screen-Silos, vereinheitlichte honest states |
| 0.4 | Domänenkern | Geteilter Steuer-Domänenkern: Steuerjahr/Einkunftsarten (ADR-006/-010/-030), deterministischer Berechnungs-Kern (ADR-048: KI hinter Port), Interview-Engine-Gerüst (Katalog, Zustandsmaschine ADR-018, ADR-035/036), Beleg-Posteingang-Schnitt (ADR-007/008) |
| 0.5 | Mantel-Abschluss | REQ-007 (TOTP/passkey), REQ-008 (Apple-Wiring, flagged off), REQ-009 (Expo-SecureStore-Hälfte) — bewusst in der Foundation (D9) |

Kommentar-Disziplin gilt **durchgängig ab sofort** (Boy-Scout: trimmen bei jeder berührten Datei,
kein globaler Kommentar-Sprint).

### Phase 1 — Zwei Vertikalen parallel (auf dem geteilten Kern, D5)

- **Angestellte:** Interview in 5 Lebenslagen (ADR-031), LStB-Daten, Sonderausgaben-Katalog,
  Arbeitstage-Assistent (M4), ehrliche Gates (M8), Cockpit-Echtdaten.
- **Grenzgänger-CH:** Lohnausweis-Scan, Quellensteuer, PK, 3a, KK, Zulagen (ADR-029),
  CHF-Führung (ADR-036).
- **Gemeinsam:** Plausibilitäts-Prüfung vor Abgabe (M2) als Kern-Feature.
- Divergenz-Gegenmittel (ADR-0015-Lehre): gemeinsames Kern-Review-Gate, Review bleibt Engpass-Planung.

### Phase 2 — Verbreiterung

Beleg-Inbox ganzjährig (M3, ADR-007/008) · Günstigerprüfung Zusammen/Einzel (M1) ·
Bescheidprüfung PDF + manuell (M7) · Rentner (ADR-034), Kapital (ADR-032), Vermietung einfach
(ADR-033) · Fristen-/Verspätungszuschlag-Warnmodus (M6) · Jahresübernahme (ADR-021),
rückwirkende Jahre (ADR-022) · Eulen-KI-Modus (ADR-037–041).

### Phase 3 — Go-Live-Readiness 1.0

Abgabe-bereit-Paket (PDF-Export, Bescheid-Vorbereitung) · Marketing-Website (M9, separat, ADR-044) ·
DSGVO-Final-Audit vor dem ersten echten Konto · **#170: echte Google-Credentials — echter
OAuth-Handshake statt Platzhalter** · REQ-010 schließt mit der #292-Netzwerk-Eigenschaft ·
Pre-Go-Live-Lasttest · **ELSTER-Übermittlung aktiviert sich bei Zertifikats-Eingang** (ADR-005/-017);
bis dahin Beta kostenlos und abgabe-bereit ohne Übermittlung.

## Definition of Done — vier Ebenen (D13–D20)

**Eingeführt durch [ADR-0036](adr/0036-definition-of-done.md) (Engineering). Durchsetzung:
PR-Checkliste + Review-Haken; Ausnahmen sichtbar + genehmigt + begründet + mit Nachhol-Ticket.**

### 1. DoD Ticket/Slice
- TDD red→green; `typecheck` + `oxlint` grün; Review-Gate bestanden (Draft-PR → Musti).
- Acceptance-Test auf der vom REQ geforderten Tier (Musti-Ruling PR #249).
- **Kein Eigenbau** ohne ADR; Framework-/Library-Standard zuerst.
- **Kommentare warum-only**; berührte Dateien getrimmt.
- **Security/Performance-Posture-Zeile im PR:** Achse berührt? Test/Messung verlinkt —
  oder begründetes „n/a". Reviewer hakt die Zeile ab (D16).
- ADR nachgezogen bei Architektur-Entscheidung; Register gepflegt bei REQ-Berührung.

### 2. DoD REQ (Register-Status „Done")
- Acceptance-Test existiert auf der geforderten Tier · grün auf `main` in CI ·
  Register-Zeile zitiert den Test-Ort · Review bestanden · ADR wo nötig (D14).
- Kein Demo-/Sign-off pro REQ — das leistet die 1.0-Ebene.

### 3. DoD Phase
- Alle Tickets erfüllen Ticket-DoD; alle Blocking-Edges aufgelöst.
- Phase ist **auf der echten Umgebung demoable** (ab Phase 1; Foundation: Gates grün +
  lokaler Prod-Shape-Stack, weil die echte Umgebung der parallele Infra-Track ist).
- Roadmap-Status-Spalte aktualisiert; progress.db-Kontext auf `erledigt` (D17).

### 4. DoD 1.0 (Produkt, „zeigbar")
1. ADR-001–042-Umfang umgesetzt — oder Einzelnes bewusst „gegated" (nur per NexusHero-
   Entscheidung, sichtbar im Register).
2. **Ein kompletter Stakeholder-Durchlauf ohne manuelle Eingriffe** — Gast → Registrierung →
   Interview → Berechnung → Abgabe-bereit → Export — auf der echten URL. Durchgeführt von
   NexusHero **und** mindestens einem externen Testnutzer, aufgezeichnet als Beweis (D18).
3. Deployed auf k3s/Hetzner mit Backups/DR; REQ-010 geschlossen; Mantel-REQs 007/008/009 grün.
4. DSGVO-Final-Audit vor dem ersten echten Konto.
5. Pre-Go-Live-Lasttest bestanden.
6. Kein „AI-Geruch": Eigenbau-Liste aus Phase 0.2 ersetzt, Kommentar-Disziplin repo-weit.
7. ELSTER-Übermittlung aktiviert, sobald das Hersteller-Zertifikat vorliegt (externer Track).

**Ausnahmen (D20):** Musti genehmigt DoD-Abweichungen; sichtbar im PR **und** Register mit Grund
und Nachhol-Ticket; NexusHero behält Veto. An den 1.0-Kernkriterien (2 und 3) gibt es keine
Ausnahmen — dort gibt es nur Go-Live-Verschiebung.

## Prozess (unverändert, D11)

Jede Phase läuft durch den bestehenden Crew-Flow: `to-spec` → `to-tickets` (Tracer-Slices mit
Blocking-Edges; die Phasen-Tickets hier werden beim Phasenstart fein geschnitten) → `implement`
(TDD) → `code-review`. Die Entscheidungen D1–D21 sind als ADRs festgeschrieben (ADR-0035/0036
in `docs/adr/`, ADR-051 im Research-Log), inkl. Amendments, wo bestehende ADRs berührt sind
(ADR-0015-Lehre bei D5, ADR-0026 (#292-Lücke, geschlossen durch den Infra-Track),
Produkt-ADR-027(b) bei REQ-007 — Supersession auf dem 2FA-Punkt, Durchsetzung in Ticket 05).
Register bekommt neue REQs für die Produktfeatures, sobald die Phasen sie schneiden.

## Zeitrahmen (D12)

Keine Kalenderdaten. Relative Phasen mit Aufwänden in Crew-Slices; einziger externer Taktgeber
ist der ELSTER-Antrag (läuft ab sofort). Wenn ein Zieldatum entsteht, wird der Plan rückwärts
vom Datum neu justiert — explizit als Entscheidung, nicht schleichend.

## Agenten-Besatzung (D21)

**4 Pro-Rollen gleichzeitig** — mehr ist durch den Blocking-Graphen nicht schneller:

| Rolle (Crew-Persona) | Aufgabe |
|---|---|
| Author Track A (Full-Stack) | P0-Kette (sequenziell) → P1 Angestellte → P2/P3-Anteile |
| Author Track B (Full-Stack) | ab P1: Grenzgänger-CH parallel |
| Reviewer (Musti) | **dediziert, authored nie** — jeder Draft-PR in frischem Kontext re-gelesen (ADR-0022) |
| Infra/DevOps (Salih) | Track 06 (#292) von Anfang bis Ende |

NexusHero orchestriert und führt den ELSTER-Antrag (extern, kein Agenten-Job).

Begründung: P0 ist eine strikte Kette (ein aktiver Code-Faden; parallel nur Infra) · P1 ist der
Peak mit 2 Vertikalen + Infra + Reviewer = 4 · Review bleibt der Engpass (ADR-0015: N Autoren,
1 Reviewer ⇒ Stau bei mehr Autoren) · drei Autoren am gemeinsamen Kern = Merge-Konflikte ·
kein Koordinations-Sitz (ADR-0016: Tickets und ADRs sind die Koordination).

**Skalierungs-Ausnahme:** In P2 dürfen temporär 3 Autoren fahren, wenn Rentner/Kapital/Vermietung
als echte Parallel-Sub-Tracks geschnitten werden — nur solange die Review-Queue leer bleibt
(Formel: Autoren ≤ Review-Durchsatz − 1). Alle Rollen laufen auf Pro; der Reviewer braucht
mindestens Autor-Qualität, weil er der Engpass ist.

## Stand-Sync 2026-10-23 (origin/main 8c9a150)

Die Roadmap wurde gegen `origin/main` revalidiert (71 Commits Fortschritt; Details:
`.scratch/roadmap-1.0/gap-analyse-2026-10-23.md`). Entscheidungen D1–D23 unverändert; drei
Zustands-Korrekturen:

1. **0.4 (Domänenkern) umgescoped:** Der Interview-Fragen-Graph existiert bereits in
   `packages/core` (ADR-0031/0033, REQ-015 Done — Minimal-Gate Segment 1; Segment 2/Katalog
   in Arbeit, #341). Die Foundation baut die Engine nicht neu, sondern auf; ihr Kern-Deliverable
   ist der Rest (Beleg-Schnitt ADR-007/008, deterministischer Rechenkern, KI-Port).
2. **Infra-Track angelaufen:** #338 lieferte liveness/readiness-Health-Endpoints für k3s/Hetzner.
   Track-06-Slice 1 nutzt diese Endpoints für die Readiness-Probe; Sub-Ticket 06.1 anerkennt
   #338 als erledigten Teil.
3. **Veranlagungsartenvergleich existiert** (ADR-0034, bounded comparison, explizit *keine*
   Günstigerprüfung) — Phase 1 baut darauf auf; M1 bleibt Phase 2.
4. **ADR-Nummern:** unsere Engineering-ADRs tragen jetzt **0035** (Foundation-Konsolidierung)
   und **0036** (Definition of Done) — 0028/0029 waren remote belegt.

## Risiken (ehrlich)

- **Foundation ist groß** (D9) → interne Reihenfolge 0.1 → 0.5 ist Pflicht, WIP-Limit gilt.
- **Parallele Vertikalen** (D5) → Divergenz-Risiko am Kern; Gegenmittel: gemeinsames
  Kern-Review-Gate; Review-Kapazität ist der Engpass (ADR-0015).
- **ELSTER-Zertifikat** → externe Timeline; Fallback definiert (abgabe-bereit ohne Übermittlung).
- **1.0-Umfang ist sehr groß** → wenn Kapazität reißt, bleiben Rentner/Kapital/Vermietung
  ehrlich „gegated" — Entscheidung bleibt bei NexusHero, sichtbar im Register.
- **DoD-Proliferation** → vier Ebenen tragen Verwaltung; die REQ-Ebene ist die semantische
  Definition des Register-Status und keine Zweitbuchführung (D13).

## Entscheidungs-Protokoll

| # | Entscheidung |
|---|---|
| D1 | Echtes Produkt, Konkurrenz zu Taxfix/WISO/wundertax |
| D2 | Vollständiger 1.0-Umfang (ADR 001–042) als gestufte Roadmap |
| D3 | Qualitätslatte: kein Eigenbau, verbundene Slices, warum-only-Kommentare |
| D4 | Foundation-Konsolidierung zuerst, mit fester Liste |
| D5 | Angestellte und Grenzgänger-CH parallel in zwei Tracks |
| D6 | Foundation enthält den geteilten Steuer-Domänenkern |
| D7 | Infrastruktur (#292) als dritter Track ab Foundation |
| D8 | ELSTER-Zertifikat sofort beantragen; 1.0 shippt „abgabe-bereit" |
| D9 | Mantel-REQs 007/008/009 in der Foundation |
| D10 | Planform: Roadmap-Doc im Repo + GitHub-Tickets + progress.db |
| D11 | Crew-Prozess unverändert; Plan liefert neue ADRs |
| D12 | Keine festen Daten; ELSTER-Antrag einziger externer Anker |
| D13 | DoD auf vier Ebenen (Ticket, REQ, Phase, 1.0) |
| D14 | REQ-DoD = Tier + Artefakt + Rückverfolgbarkeit |
| D15 | Ticket-DoD inkl. Performance/Sicherheits-Kriterium pro Ticket |
| D16 | Perf/Security-Kriterium = Pflicht-Posture-Zeile im PR |
| D17 | Phase-DoD = Tickets done + demoable auf echter Umgebung + gepflegte Status |
| D18 | 1.0-DoD = 6 Kriterien + Stakeholder-Durchlauf (NexusHero + extern, aufgezeichnet) |
| D19 | DoD-Durchsetzung = PR-Checkliste + Review-Haken + ADR + docs/process |
| D20 | Ausnahmen: sichtbar + genehmigt (Musti) + begründet + Nachhol-Ticket |
| D21 | Agenten-Besatzung: 4 Pro-Rollen gleichzeitig; P2-Ausnahme mit Review-Queue-Regel |
