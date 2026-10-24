# Review — Branch `ticket-10-p2-verbreiterung` (Ticket 10, Phase-2-Feinschnitt + Beleg-Inbox-UI 10.1)

- **Base:** `4908ed2` · **HEAD:** `8b72dc0` (2 Commits: `075ba51` docs/tickets, `8b72dc0` feat mobile-web)
- **Scope:** read-only, keine git-Mutationen
- **Verdict:** REQUEST-CHANGES

---

## (1) Verdict

**REQUEST-CHANGES.** Der BelegeScreen-Code ist sauber, ehrlich und hält die Kern-Grenze
(Zustände aus `@steuereule/core`, nie client-seitig nachgerechnet). Die zwei
Blocking-Edge-/Ehrlichkeits-Befunde in den Sub-Tickets (10.2 fehlende `tarif.ts`-Kante,
ADR-0040-Offenpunkt nicht in 10.1 gespiegelt) und der einseitige Konflikt-Auflösungspfad sind
inhaltlich — gerade bei einem Commit, dessen Wert die *ehrlichen* Blocking-Edges sind. Kein
Code-Rework nötig, nur Ticket-Ergänzungen + eine explizite Produkt-Entscheidung/-Defer.

---

## (2) Findings

### F1 — 10.2: Blocking-Edge unvollständig + Verweis auf eine Datei, die es in diesem Branch nicht gibt (HIGH)
- `track-10/10-2-guenstigerpruefung-screen.md:4` — referenziert `packages/core/src/tarif.ts`.
  Diese Datei existiert in `HEAD` **nicht** (sie liegt auf dem ungemergten Branch
  `origin/kaan/321-tarif-guenstigerpruefung`, nicht Ancestor von `HEAD`). Die „zwei Zahlen"
  (`einzel`/`zusammen`) kommen aus `veranlagungsartenvergleich` = § 32a `incomeTax` — **nicht**
  aus `berechne`.
- `10-2-…md:13` — `Blocked by: 15 (berechne)` ist notwendig, aber **nicht hinreichend**: der
  Posten-Fold (`berechnung.ts`, t15) liefert nur das zvE, der Tarif (§ 32a + Vergleich) fehlt
  und ist eine **eigene, nicht deklarierte Abhängigkeit** (#321 strand N). Die Kante zu 15 ist
  also nicht künstlich, aber unterbestimmt.
- **Vorschlag:** In 10.2 eine explizite Edge ergänzen (z. B. „§ 32a Tarif / `tarif.ts` muss im
  Kern gelandet sein — aktuell nur auf `origin/kaan/321`, ungemerged") und den Dateipfad
  entweder als Blocker benennen oder klar als „existiert noch nicht" markieren. Sonst läuft ein
  Agent, der 10.2 als `ready-for-agent` zieht, in die Wand.

### F2 — ADR-0040-Offenpunkt („Jahr-Konflikt = Produkt-Zustand?") nicht in 10.1 gespiegelt (MEDIUM)
- Der README (README.md:41–42) und der Entwurf `adr-drafts/0040-beleg-posteingang.md:53–56`
  benennen die offene Frage explizit („…ob der *Jahr*-Konflikt überhaupt ein Produkt-Zustand
  ist… ein Produkt-Call, kein gesetztes Recht"). `10-1-beleg-inbox-ui.md` listet `konflikt`
  dagegen als **gesetzte** AC (Zeile 25) ohne jeden Verweis auf ADR-0040.
- **Vorschlag:** In 10.1 unter den ACs/Kopf eine Zeile „ADR-0040 offen: Jahr-Konflikt als
  Produkt-Zustand ist Musti-Review-Punkt, nicht entschieden" ergänzen — damit der Implementierer
  den Zustand nicht als still entschieden liest.

### F3 — Konflikt nur einseitig auflösbar: „Anderes Jahr" führt in eine Sackgasse (MEDIUM)
- `BelegeScreen.tsx:206–216` — der `konflikt`-Zweig hat **genau einen** Button
  („Vorschlag {jahr} übernehmen" → `onZuordnen(…, z.vorschlagsJahr)`). Wer über „Anderes Jahr"
  bewusst 2025 zuordnet, während das Datum 2026 vorschlägt, bekommt `konflikt` und kann seine
  eigene Wahl **nicht** behalten: Es gibt kein „bei 2025 bleiben / Vorschlag verwerfen" und die
  Datumswerte sind (noch) nicht editierbar. Das ist ein Kern-Modell-Loch (`beleg.ts` hat kein
  „Vorschlag verwerfen"-Faktum), nicht nur UI.
- **Vorschlag:** Entweder einen zweiten Auflösungspfad modellieren („Vorschlag verwerfen" als
  persistiertes Faktum im Kern) oder die Lücke explizit als Folge-Ticket deferren und im Ticket
  benennen — nicht still offen lassen.

### F4 — Blocking-Graph (DAG) untertreibt die ADR-Promotion-Abhängigkeiten (LOW)
- `README.md:13–20` — der Graph zeigt nur Ticket→Ticket-Kanten. Die realen Blocker 0037
  (10.4/10.5/10.6/10.8), 0038 (10.2/10.3/10.9) und 0039 (10.3/10.7) stehen nur in Prosa
  („Querschnitts-Blocker", Zeilen 32–45) und in den Einzel-Tickets, nicht als Graph-Knoten.
  Der Graph erweckt so den Eindruck, „15" sei die *einzige* geteilte Abhängigkeit.
- **Vorschlag:** Die drei ADR-Knoten in den Graph aufnehmen (oder den Graph als „nur
  Ticket-Kanten" kennzeichnen).

### F5 — Ticket-Hygiene: 10.1 ACs offen, Status „in-progress", Commit sagt „M3 fertig" (LOW)
- `10-1-beleg-inbox-ui.md:19` — `Status: in-progress (dieser Lauf)`; alle ACs (Zeilen 21–32)
  ungehakt, während `8b72dc0` als `feat(mobile-web): Beleg-Inbox-UI (M3)` abgeschlossen deklariert
  („14 Tests … grün"). Zusätzlich wird REQ-019 (art-Anzeige) jetzt real gerendert, aber
  `docs/requirements/register.md` wurde nicht nachgezogen (DoD 1: „register maintained where a
  REQ is touched").
- **Vorschlag:** ACs abhaken + Status auf erledigt (oder ehrlich „ready-for-review"), und die
  REQ-019-Registerzeile auf den neuen BelegeScreen-Test verweisen lassen.

---

## (3) Was stimmt (verifiziert)

- **Zustände aus dem Kern:** `beleg.service.ts:16–43` importiert `zuordnungAusDaten` aus
  `@steuereule/core` und reicht die 4 Zustände `ungebunden/vorgeschlagen/zugeordnet/konflikt`
  nur durch; `BelegeScreen.tsx` liest ausschließlich `beleg.zuordnung.kind` und rechnet nie nach.
  Die Kern-Funktion (`beleg.ts:74–84`) ist die einzige Ableitung. **Bestätigt.**
- **Upload-Ehrlichkeit:** `ScanFolgt` (`BelegeScreen.tsx:117–127`) ist ein „Scan folgt"-Hinweis,
  kein Button; `useBelegControllerCreate` wird in der UI nicht importiert → `POST /v1/belege`
  wird bewusst nicht aufgerufen. Die API/UI-Teilung ist in 10.1 („Ehrliche Grenze", Zeile 10–12)
  ehrlich vermerkt. **Bestätigt.**
- **Konflikt sichtbar:** beide Jahre (i18n `konflikt.body`, Amber via `t.color.warn`/`warnWeich`)
  statt stillem Überschreiben. Sichtbarkeit und „still-los" stimmen; die Sackgasse ist F3.
- **art-Anzeige:** `null` → generischer „Beleg", CH-Typen gemappt, unbekannte Werte fallen auf
  den Rohstring zurück (`BelegeScreen.tsx:153–154`).
- **Tests:** 14 `it`-Fälle in `BelegeScreen.test.tsx`, inkl. refetch-nach-Schreiben und
  „kein POST bei ungültigem Jahr". Zählung stimmt.
- **Hoheitsgebiete:** Diff berührt keine t15/t16-Dateien (kein `cockpit`, `berechnung.ts`,
  `grenzgaenger.ts`, CH-Screen).
- **Commit-Konventionen:** Conventional Commits (`feat`/`docs`), `Co-authored-by: Robin` (Mensch/
  Rolle), kein Tool-Footer. Kein Eigenbau (orval-generierter Client, bestehende UI-Komponenten).

---

## (4) Nicht re-verifiziert (Gates bewusst nicht neu gelaufen)

- `mobile-web` 404-Gate, `typecheck`, `pnpm lint`, `adr-check`, volle Unit-Suite — **nicht
  re-verifiziert** (Commit-Behauptung „grün" nur plausibilisiert, nicht nachgelaufen).
- Kein Lauf von `openapi.json`-Regenerierung / `orval`-Freshness geprüft.
