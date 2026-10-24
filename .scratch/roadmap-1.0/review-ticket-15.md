# Review — Ticket 15, 08-Slice 2 (Cockpit-Echtdaten + mobile-web-Screens)

**Branch:** `ticket-15-p1a-slice2` (Worktree `Steuereule-t15`, 1 Commit `00fbd79` auf `4908ed2`)
**Verdict:** REQUEST-CHANGES

Der Kern ist solide: ehrlicher Diskriminator (`bestimmt | spanne | gated`), `gated` nennt die
Einkunftsart, kein Edit an `berechnung.ts`/`grenzgaenger.ts`/Beleg-Bereich, Katalog-409-Resync ist
wirklich implementiert (nicht nur Kommentar), Arbeitstage ehrlich als „Werktage, keine Feiertage“
beschriftet. Es bleiben drei ADR-0032-/„eine Wahrheit“-Findings, die der Branch selbst zum Maßstab
macht und die vor Merge behoben gehören.

## Findings

### F1 — Empty-State verspricht eine „Erstattung“, die der Slice nicht liefert (ADR-0032)
`apps/mobile-web/src/i18n/resources.ts:698` (en `:1303`):
`message: '… Sobald deine Daten da sind, zeigen wir dir hier deine Erstattung.'`

Der geladene Hero zeigt aber jetzt „Erfasstes Einkommen“ (`:705`) und explizit „Die Erstattung
rechnen wir in einem späteren Schritt“ (`:717`). Die Empty-State-Zeile ist beim `estimate`→`stand`-
Umbau nicht mitgezogen worden und überverspricht genau das, was dieser Slice ehrlich verweigert.
**Vorschlag:** Empty-Text auf „… zeigen wir dir hier dein erfasstes Einkommen.“ umstellen (beide
Sprachen), analog zum Hero-Label.

### F2 — „eine Wahrheit“ verletzt: settled-income-Summe + offen/konflikt-Zählung existieren doppelt
`apps/api/src/cockpit/cockpit.service.ts:58-93` (`summeAusDaten`, `offenePostenAusDaten`,
`konflikteAusDaten`) und `apps/mobile-web/src/screens/plausibilitaet/PlausibilitaetScreen.tsx:119-137`
(`fold`, `einnahmen` `:124`, `offenePosten` `:128`, `konflikte` `:129`) rechnen dieselbe
`LStB-Brutto + Nebenjob-Brutto`-Summe und dieselbe offene/Konflikt-Zählung unabhängig voneinander
— einmal serverseitig, einmal clientseitig. `angestellte.ts` liefert nur `nebenjobBrutto`, keine
gemeinsame `einnahmenAusDaten(daten, answers)`-Funktion. Das ist der vom Ticket befürchtete
zweite Rechenweg: zwei Stellen, die bei einer Regeländerung (neuer Einkunfts-Posten) getrennt
gepflegt werden und auseinanderlaufen können.
**Vorschlag:** Core-Helper `settledEinnahmen(daten, answers)` (+ ggf. `offeneUndKonflikte(daten,
answers)`) extrahieren und aus beiden Callern aufrufen — analog zur bestehenden
`cockpitSpanneAusEingaben`-Abstraktion.

### F3 — Plausibilität „einreichbar“ ohne UI-Hinweis, dass werktage/Pendlerpauschale ungeprüft bleibt
`apps/mobile-web/src/screens/plausibilitaet/PlausibilitaetScreen.tsx:133` übergibt `werktage:
{ kind: 'bestimmt', wochentage: 0, werktage: 0, pendlertage: 0 }` („neutral“) — dokumentiert im
Code-Header, aber dem Nutzer unsichtbar. Bei vollständig erfasster LStB und ohne gated/offen zeigt
der Screen `resources.ts:672` „Alles klar — du kannst abgeben“, obwohl werktage-Widerspruch und
Pendlerpauschale bewusst nie geprüft wurden. Das Ticket schreibt selbst „dokumentiert im
Screen-Header“ — für ADR-0032 reicht der Code-Header nicht, der Screen muss es sagen.
**Vorschlag:** Persistenten Hinweis im Screen (analog `arbeitstage.honestyNote`) — z. B. „Die
Arbeitstage-/Pendlerpauschale-Prüfung folgt in einem späteren Schritt“ — solange werktage nicht
persistiert ist.

### F4 — 60 €/100 €-Verbreiterungsfaktoren sind unbelegt (vorbestehend)
`packages/core/src/cockpit.ts:8,11` (`UNCERTAINTY_PER_ITEM = 60`, `UNCERTAINTY_PER_CONFLICT = 100`).
ADR-015 (research) fordert „Spanne verengt sich“, nennt aber keine Faktoren. Die Zahlen sind
Magic Numbers ohne Quellenangabe und tragen jetzt reale, nutzer sichtbare Euro-Spannen
(`cockpit-spanne.ts:57`). Der Branch macht es richtig, sie zu *wiederverwenden* statt neu zu
erfinden (eine Quelle) — die Zahl selbst bleibt aber unzitiert. **Nicht durch diesen Branch
eingeführt**, aber mit diesem Slice erstmals lasttragend; als Schuld für den nächsten
Kern-/Fach-Review festhalten.

### F5 — Stale-Kommentar im Write-Pfad widerspricht der neuen VESTIGIAL-Markierung
`apps/api/src/interview/interview-answer.repository.prisma.ts:50-55`: „A later slice that does
compute a real baseEstimate writes it through its own path“ — durch Ticket 15 ist `baseEstimate`
endgültig vestigial (`schema.prisma`-Kommentar), es wird *kein* späterer Slice mehr einen echten
Wert schreiben. Die Datei ist vom Branch nicht angefasst, der Kommentar ist durch die neue
Schema-Markierung aber falsch geworden. **Vorschlag:** Kommentar anpassen („kept only to satisfy
the upsert’s required column“), um die beiden Aussagen konsistent zu halten.

### F6 — Label „LStB-Feld offen“ zählt auch den offenen Nebenjob
`apps/api/src/cockpit/cockpit.service.ts:82-84` zählt einen deklarierten Nebenjob ohne Brutto als
`+1` in `offenePosten`; die UI (`resources.ts:708-709` „{{count}} LStB-Feld offen“, `:711-712`
„{{count}} offenes Feld × …“) benennt das als LStB-Feld. Kleine Fehlbezeichnung, kein Blocker.
**Vorschlag:** Neutrales Label („Posten offen“) oder den Nebenjob-Fall separat benennen.

## Nicht re-verifiziert

- **Gates** (`core 294`, `api 367`, `mobile-web 406`, Cockpit-Integration 5/5) wurden **nicht neu
  ausgeführt** (read-only-Auftrag). Der Befund ist plausibel: neue `cockpit-spanne.test.ts`
  (8 Fälle), `cockpit.service.test.ts` (u. a. gated/spanne/Nebenjob/Rente-Scoping), 5 neue
  Screen-Testdateien + `App.test.tsx`, Integration-Test auf echte Repos/Postgres umgestellt.
- **DoD-Zeilen, Posture** und die konkrete Laufzeit der Test-Suiten wurden nicht gegengeprüft.

## Standards (geprüft, ohne Fund)

- Kein Edit an `berechnung.ts`/`grenzgaenger.ts`/Beleg-Bereich — Hoheitsgebiete unangetastet.
- `apps/api/src/cockpit/*` nur in diesem Ticket; `InterviewModule`/`LstbModule` exportieren ihre
  Repos (dieselbe Verschlüsselungs-Naht, kein zweiter Prisma-Pfad).
- Warum-Kommentare, Diskriminator statt nacktem `{von,bis}`, kein Eigenbau (orval/openapi
  regeneriert), kein Tool-Footer, Commit-Konvention (`feat(angestellte): …`, Kaan-Form).
