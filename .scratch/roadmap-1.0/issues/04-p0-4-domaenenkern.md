# 04 — Phase 0.4: Geteilter Steuer-Domänenkern

**What to build:** Der gemeinsame Fachkern, in den beide Vertikalen (Phase 1) einstecken —
die tiefste Nahtstelle der Roadmap und die Antwort auf „Slices nicht verbunden". Lieferumfang:
Steuerjahr-/Einkunftsarten-Modell, deterministischer Berechnungs-Kern mit klarer KI-Grenze,
Interview-Engine-Gerüst (Katalog + Zustandsmaschine), Beleg-Posteingang-Schnitt. Nichts davon
darf von einer konkreten Einkunftsart abhängen.

**Blocked by:** 03 — Phase 0.3: Verdrahtung

**Status:** ready-for-agent

- [x] Einkunftsarten-/Steuerjahr-Modell in `packages/core` (ADR-006/-010/-030), UI-frei,
      von API, web und mobile geteilt; Kombinierbarkeit getestet (ADR-030)
- [x] Deterministischer Berechnungs-Kern mit port-basierter KI-Grenze (ADR-048):
      KI schlägt vor, legt nie selbst an (ADR-014); Kern ist ohne KI-Injektion voll
      testbar und tut dann das Richtige
- [x] Interview-Engine-Gerüst: Katalog-Schnitt, Zustandsmaschine (ADR-018: Rückfrage/
      Extern-erledigt als Zustände), on-demand-Erweiterbarkeit (ADR-016/035)
- [x] Beleg-Posteingang-Schnitt (ADR-007/008): Upload ohne Jahresbindung,
      Zuordnungs-Vorschlag, sichtbarer Konflikt-Zustand statt stilles Überschreiben
- [x] Acceptance-Tests auf der vom jeweiligen ADR geforderten Tier; ADR-Entwürfe für jede
      neue Kern-Entscheidung

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._

## Umsetzung (Robin, Ticket 04)

**Geliefert** (core: pure unit, 100 % Coverage; belege: integration gegen echtes Postgres):

- `packages/core/src/einkunftsarten.ts` — `Einkunftsart`-Vokabular + `einkunftsartenFromAnswers`
  (ADR-010-Brücke) + `gatedEinkunftsarten` (ADR-028/032/033); Kombinierbarkeit getestet
  (ADR-030/034).
- `packages/core/src/steuerjahr.ts` — `Steuerjahr` (userId-Besitz, ADR-006) + `kopple`/`entkopple`.
- `packages/core/src/steuerjahr-status.ts` — Zustandsmaschine (ADR-018), `istUebergangErlaubt`.
- `packages/core/src/berechnung.ts` — deterministischer Kern: `Quelle`/`Posten`/`PostenKonflikt`
  (ADR-008) + `berechne` (bestimmt/offen) + `loeseKonflikt`.
- `packages/core/src/ki-port.ts` — `KiVorschlag`/`KiPort` + `nehmeVorschlagAn` (ADR-014/048).
- `packages/core/src/beleg.ts` — `BelegDaten` + `steuerjahrVorschlag` (§ 11 Zufluss) +
  `zuordnungAusDaten` (abgeleiteter Konflikt) + `ordneZu`.
- `apps/api/src/beleg/*` + Prisma-Migration `20261024080000_add_beleg` — `POST/GET /v1/belege`,
  `POST /v1/belege/:id/zuordnung`; `dateiname` feldverschlüsselt (ADR-0008), Audit (REQ-004).
- ADR-Entwürfe `.scratch/roadmap-1.0/adr-drafts/0037…0040`.

**Bewusst NICHT gebaut** (ehrlich):
- **Segment 2 / Katalog-Schnitt neu bauen** — existiert bereits (#321 R1, `ENTRIES`/`entryForStep`);
  Stand-Sync-Umscope bestätigt: Engine wird aufgebaut, nicht neu gebaut. Nur die Zustandsmaschine
  ist neu.
- **Scan/OCR** (ADR-036/045) — spätere Tickets; Beleg-Modell trägt deshalb **kein** `betrag`.
- **KI-Implementierung (LangChain)** — nur der Port (ADR-048 §3), Wiring ist api-seitig/später.
- **Steuer-Formeln** (Tarif, Günstigerprüfung, Fünftelregelung …) — Phase 1/2; der Kern liefert
  den ehrlichen Container (`bestimmt`/`offen`/`gegated`), nicht die Zahlen.

**Offene Punkte für Review/Musti:**
1. Zustandsmaschine: exakte Transitionstabelle (v. a. `pruefung→entwurf`, `extern-erledigt` nur aus
   entwurf/pruefung) ist Interpretation, kein ADR-018-Wortlaut → Produkt-Bestätigung.
2. Beleg: „Konflikt auf das **Jahr**" (zugeordnet vs. datenabgeleiteter Vorschlag) ist eine
   Produktfrage — ADR-008 benennt den Posten-**Betrag**-Konflikt; der Jahr-Konflikt ist modelliert,
   weil AC ADR-007/008 zusammen nennt.
3. `Gewerbe` vs. `Selbstständig` als kanonischer Einkunftsart-Name (ADR-010 „Gewerbe/Selbstständig").

**Gates:** `pnpm -r typecheck` grün · `pnpm lint` grün · core 193 Tests + 100 % Coverage ·
beleg.integration 7/7 grün · adr-check/register-check PASS.
**Bekannte, nicht von mir verursachte Rot-Tests** (Umgebung): 3× PDF-Renderer + 2× REQ-011-Export
(fehlendes Chromium, „pnpm exec playwright install") + 1× REQ-014-Rate-Limit (`bind EADDRNOTAVAIL
127.0.0.2`).
