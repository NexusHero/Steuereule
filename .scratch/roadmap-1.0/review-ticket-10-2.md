# Review — Ticket 10.2, Veranlagungsartenvergleich (M1) + Tarif-Modul

- **Branch:** `ticket-10-2-veranlagungsartenvergleich` (Worktree `Steuereule-t102`)
- **Diff:** `git diff 0ab4c4a...HEAD` — Commit 2651cf1 auf 0ab4c4a
- **Verdict:** **REQUEST-CHANGES**

## Kurzfassung

Die Steuerzahlen sind **korrekt** — das ist die wichtigste Entlastung. Alle §32a-Koeffizienten
(VZ 2024/2025/2026), die Soli-Freigrenzen, die Milderungszone (11,9 %) und die KiSt-als-Faktor-
Behandlung sind gegen die zitierten Quellen verifiziert. Die PV-Schranke (45 % × Lohnersatz) ist
eine mathematisch belastbare, konservative Obergrenze. Zwei Punkte verhindern die Freigabe:

1. Ein **fabrizierter Nullwert** in der PV-Schranke (Service-Mapping) kann ein falsches
   `eindeutig` erzeugen — Verstoß gegen ADR-0032.
2. Die **ADR-0034-Verfeinerung** (Soli/KiSt eingefaltet + neue PV-Schranke) ist substanziell
   korrekt, aber **nicht im ADR-Log nachgezogen** — ein Folge-ADR (0043) fehlt.

---

## 1. Fachlichkeit — Steuerzahlen (verifiziert, korrekt)

### 1.1 §32a-Grundtarif — alle Koeffizienten richtig
Geprüft gegen die im Code zitierten Fundstellen:

| VZ | Grundfreibetrag | Zone 2 | Zone 3 | Zone 4 | Zone 5 |
|---|---|---|---|---|---|
| 2024 | 11.784 ✓ | (954,80·y+1.400)·y ✓ | (181,19·z+2.397)·z+991,21 ✓ | 0,42·x−10.636,31 ✓ | 0,45·x−18.971,06 ✓ |
| 2025 | 12.096 ✓ | (932,30·y+1.400)·y ✓ | (176,64·z+2.397)·z+1.015,13 ✓ | 0,42·x−10.911,92 ✓ | 0,45·x−19.246,67 ✓ |
| 2026 | 12.348 ✓ | (914,51·y+1.400)·y ✓ | (173,10·z+2.397)·z+1.034,87 ✓ | 0,42·x−11.135,63 ✓ | 0,45·x−19.470,38 ✓ |

- 2026 gegen `gesetze-im-internet.de/estg/__32a.html` direkt verifiziert (Wortlaut stimmt exakt).
- 2024 gegen BGBl 2024 I Nr. 386 (rückwirkende Fassung; die vorläufigen 11.604/922,98 sind korrekt
  NICHT verwendet — `tarif.ts:75-90` nutzt die rückwirkende 11.784/954,80-Fassung, wie im Kopf zitiert).
- 2025 gegen SteFeG (BGBl 2024 I Nr. 449); Grundfreibetrag 12.096 mehrfach bestätigt.
- Rundungsregeln korrekt: zvE **vor** der Formel abgerundet (§32a Abs.1 S.1, `Math.floor` in
  `incomeTax`), Steuerbetrag **nach** der Formel abgerundet (§32a Abs.1 S.6). Splitting
  (§32a Abs.5) als `2 × incomeTax(⌊(zveA+zveB)/2⌋)` — korrekt.
- „throw, don't approximate" für nicht unterstützte Jahre (2023/2027 werfen) — konsistent mit der
  kaan/321-Vorlage.

### 1.2 Soli + KiSt — korrekt
- Freigrenzen §3 Abs.3 SolZG: 18.130/36.260, 19.950/39.900, 20.350/40.700 — korrekt (2026er-Wert
  20.350/40.700 extern bestätigt).
- §4 SolZG: 5,5 % mit Milderungszone-Deckel 11,9 % des (Bemessungsgrundlage − Freigrenze) —
  korrekt (seit VZ 2021 11,9 %).
- KiSt (§51a) ausschließlich als Aufrufer-Faktor `0 | 0.08 | 0.09` — keine erfundene Konstante,
  `kirchensteuer` wirft für Werte außerhalb der geschlossenen Menge. KiSt auf ESt (nicht ESt+Soli)
  gerechnet — korrekt.

### 1.3 PV-Schranke (45 % × Lohnersatz) — belastbar und konservativ
`veranlagungsartenvergleich.ts:122-141`. Die Behauptung im Kopf („§32b erhöht die Steuer höchstens
um den Spitzengrenzsteuersatz mal Lohnersatz") ist **mathematisch haltbar**: die PV-Wirkung ist
`y·[s(y+P)−s(y)]` mit `s'(u)=(T'(u)−s(u))/u ≤ 45%/u`, also `≤ 45%·y·ln(1+P/y) ≤ 45%·P`. Da der
PV beide Seiten (einzel/zusammen) nur erhöht, ist `|Δdelta| ≤ 45%·P`. Die Verwendung als
Obergrenze von `|delta|` ist daher eine **konservative, zitierbare** Schranke (Spitzensatz aus
§32a Abs.1 Nr.5), keine Gefühlsschwelle — im Geist von ADR-0034 „computed, not chosen". Die
Zuordnung `|delta| ≤ obergrenze ⇒ 'zu-knapp'` und `kind==='unbestimmt' ⇒ nie 'eindeutig'` ist
ehrlich (zu-knapp ≠ unbestimmt bleiben korrekt getrennt).

---

## 2. Findings (REQUEST-CHANGES)

### F1 — Fabrizierter Nullwert in der PV-Schranke → falsches `eindeutig`
- **Ort:** `apps/api/src/veranlagungsartenvergleich/veranlagungsartenvergleich.service.ts:57-61`
  (`progressionsvorbehaltAus`), unterstützt durch `intAus` (`:50-54`, default 0 bei absent/leer/nicht-numerisch).
- **Befund:** `answers.lohnersatz === 'Ja'` wird immer zu
  `{ art: 'lohnersatzleistungen', betrag: intAus(answers['lohnersatz-betrag']) }`. Ist der
  Betrag noch nicht erfasst (mid-flow, abgebrochen) oder leer/nicht-numerisch, liefert `intAus`
  **0** → `progressionsvorbehaltSchranke` gibt `obergrenze: 0` → die Vergleichslogik kann
  `eindeutig` liefern, obwohl der Progressionsvorbehalt tatsächlich **unbestimmt** ist.
  Das ist ein fabrizierter Nullwert (ADR-0032) und kehrt ein ehrliches `unbestimmt` in ein falsches
  `eindeutig` um. Der Happy-Path-Test (`seed(..., true)` setzt `lohnersatz='Nein'`) deckt den
  `'Ja'`-ohne-Betrag-Pfad nicht ab; im Core-Test wird `betrag` stets explizit gesetzt.
- **Vorschlag:** In `progressionsvorbehaltAus` den Fall `lohnersatz === 'Ja'` mit fehlendem/leerem/
  nicht-finite/`<=0` Betrag auf `{ art: 'nicht-angegeben' }` mappen (→ `unbestimmt`), statt
  `lohnersatzleistungen` mit `betrag: 0`. Test ergänzen: „lohnersatz='Ja' ohne betrag ⇒ unbestimmt".

### F2 — ADR-0034-Verfeinerung braucht ein Folge-ADR (0043)
- **Ort:** `docs/adr/0034-…-bounded-comparison.md:101-118` (Decision 3) vs.
  `packages/core/src/veranlagungsartenvergleich.ts:13-20` + `:122-141`.
- **Befund:** ADR-0034 Decision 3 beschreibt Soli/KiSt als **unberechnet** und Teil von
  `unschaerfe` („an upper bound … arithmetic over numbers this module already holds"), PV als
  unboundbar. Die Implementierung **berechnet** Soli/KiSt und faltet sie in `einzel`/`zusammen`/
  `delta` ein; `unschaerfe` ist jetzt **nur noch** der PV, mit einer neuen Schranke
  (45 % × Lohnersatz), und PV wird über ein **neues Eingabeobjekt** (`ProgressionsvorbehaltEingabe`)
  doch begrenzbar. Die Kern-Invariante (bounded comparison, `aussage` zuerst, `empfehlung` nur auf
  `eindeutig`) bleibt **vollständig gewahrt** — es ist eine Verfeinerung, kein stiller Widerspruch,
  und ADR-0034s „Consequences" („until Soli and Kirchensteuer are computed …") hat genau diesen
  Schritt antizipiert. **Aber:** der ADR-Text zu Decision 3 beschreibt jetzt einen Mechanismus, den
  es nicht mehr gibt, und die PV-Schranke ist eine neue, nicht im ADR-Log dokumentierte Ableitung.
  Der Modul-Kopf-Vermerk ist kein Ersatz für das ADR-Log (ADR-0033 „citation form").
- **Vorschlag:** ADR-0043 anlegen (Status Accepted), das (a) die Einfaltung von Soli/KiSt und deren
  Entfernung aus `unschaerfe` festhält, (b) die PV-Schranke `45 % × Lohnersatz` samt Herleitung
  (Spitzengrenzsteuersatz als Obergrenze) dokumentiert und (c) ADR-0034 Decision 3 supersediert/
  präzisiert. Damit wäre auch das DoD-Item „ADR-0034-Folge (falls nötig)" erfüllt — „falls nötig"
  ist hier gegeben.

---

## 3. Standards & Struktur (ok)

- **Hoheitsgebiete unangetastet:** `berechnung.ts`, `einkunftsarten.ts`, `interview.ts` sind nicht
  im Diff — bestätigt. Kernänderungen beschränken sich auf zwei neue Dateien + `index.ts`-Exporte.
- **Kein Eigenbau:** Service spiegelt `CockpitService`-Muster (explizite DI-Tokens, ein Prisma-Pfad
  über die bestehenden LStB/Interview/TaxYear-Repositories, `UserContextGuard`, `ParseSteuerjahrPipe`,
  `CurrentUser`). Kein zweiter Prisma-Pfad.
- **API sauber integriert:** `GET /v1/steuerjahre/{jahr}/veranlagungsartenvergleich`, flaches
  `kind`-Union-DTO (wie `CockpitStandDto`), `null` als ehrlicher Leerzustand. `openapi.json` und
  orval-generierte Dateien (`veranlagungsartenvergleich.ts/.schemas.ts/.msw.ts/.faker.ts`) samt
  `orval.config.ts`-Target, `index.ts` und `msw.ts`-Exporten konsistent — regeneriert, nicht
  handgeschrieben.
- **Warum-Kommentare:** durchgängig vorhanden und fundiert; keine KI-/Tool-Attribution in den
  handgeschriebenen Dateien (nur die erwarteten orval-Header in den generierten Dateien).
  `Co-authored-by: Robin` und keine Tool-Footer — Konvention eingehalten.
- **DoD/Posture-Zeile:** im Commit-Body vorhanden („Security/performance posture: n/a — …"), mit
  Begründung. TDD-Tests liegen auf allen drei Ebenen.

### Screen-Gate & Typ-Erzwingung (ok)
- `PlausibilitaetScreen.tsx:115-119` (`onDone` → `veranlagungsartenvergleich`) + `App.tsx:301-306`:
  Screen erscheint erst **nach** dem Plausibilitäts-Screen. `aussage`/`kind` wird im `Ergebnis` zuerst
  gelesen; `empfehlung` existiert nur auf `eindeutig`.
- Der `@ts-expect-error`-Test (`veranlagungsartenvergleich.test.ts:119-130`) ist eine **legitime
  Compile-Zeit-Kontrolle** (kein Trick): `result.empfehlung` ohne Narrowing ist ein echter
  Typfehler; schlüge er nicht an, fiele der Build. Genau ADR-0034 „unrepresentable to skip".

### REQ-022 / Register (ok)
- Register-Eintrag vorhanden mit Tier-Zitaten (`Tarif`/`Veranlagungsartenvergleich` core · acceptance ·
  mobile-web) und Trace zu ADR-0034/0032/0004. Kein Konflikt mit 10.4: `10-4-rentner.md` referenziert
  REQ-022 nicht (REQ-022 ist in diesem Branch exklusiv 10.2s); ein Kollisionsvermerk ist daher nicht
  nötig.

---

## 4. Nicht re-verifiziert

- **Gates (typecheck/lint/Test-Suiten) nicht neu ausgeführt** (Auftrag). Die Grün-Behauptungen
  (core 19+8, acceptance 4, mobile-web 6) werden als plausibel akzeptiert, aber nicht neu bestätigt.
- Die exakten Test-Literale (z. B. `incomeTax(100000, 2026)=30864`, `einzel 32115`, `delta −11019`)
  wurden von Hand nachgerechnet und stimmen; der Stetigkeitstest (`toBeLessThanOrEqual(2)` an der
  Zone-4-Grenze) ist wegen des Floor am Knick geringfügig locker, aber akzeptabel.

---

## Fazit

Tarif-Arithmetik und Unschärfe-Modell sind fachlich sauber und quellen-verifiziert. Freigabe blockieren
zwei behebbare Punkte: der **fabrizierte PV-Nullwert** (F1, kann falsches `eindeutig` erzeugen) und das
**fehlende Folge-ADR 0043** (F2, ADR-0034 Decision 3 ist nun stale).
