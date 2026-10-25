# Review — Ticket 10.3 (Bescheidprüfung 1.0, M7)

- **Branch:** `ticket-10-3-bescheidpruefung`, Worktree `/Users/suhaysevinc/source/Steuereule-t103`
- **Diff:** `0ab4c4a...4722924` (Read-only, keine git-Mutationen)
- **Ergebnis: APPROVE**

Der Slice erfüllt die verbindlichen ACs (Ticket `.scratch/roadmap-1.0/issues/track-10/10-3-bescheidpruefung.md`).
Kern `bescheid.ts` ist reine, I/O-freie Logik; Abgleich, Frist und Übergänge werden aus `@steuereule/core`
importiert, nie nachgebaut. Die Zustandsmaschine ist server-validiert (409), der Abgleich benannt und nie
still, die fünf Beträge sind feldverschlüsselt + auditiert. Die folgenden Findings sind Minor/Nits, keins
blockiert.

## 1. Befund

| Prüfpunkt | Ergebnis |
|---|---|
| `berechnung.ts` / `einkunftsarten.ts` unangetastet | ✅ diff leer; `bescheid.ts` importiert nur den `Berechnungsstand`-Typ. |
| `steuerjahr-status.ts` Erweiterung ohne Renames, ADR-0039/018-Übergang unangetastet | ✅ reiner Append; `UEBERGAENGE`/`SteuerjahrStatus` byte-identisch zum Base-Commit. |
| Zustandsmaschine server-validiert (409, kein stiller Übergang) | ✅ `bescheid.service.ts:226-230` + `241-243`; Acceptance P2 `req-023-bescheidpruefung.test.ts:163-169` belegt 409. |
| Abgleich benannt (Feld/Seite/Betrag), nie still | ✅ `gleicheBescheidAb` (`bescheid.ts:92-103`) → benannte `BescheidAbweichung`-Liste; UI zeigt Feld + `bescheid`/`berechnet`/`differenz`. |
| `offen`-Kern ehrlich benannt | ✅ `berechnungUnvollstaendig`-Flag + `bescheid.ts:22-23` + UI-Hinweis `BescheidScreen.tsx:240-242`. |
| Einspruchsfrist § 355 AO (Monatsfrist, kein 30-Tage-Kurzschluss) | ✅ `einspruchsfristEnde` (`bescheid.ts:212-224`): +1 Monat mit Tages-Clamp, Jahrrollover + Schaltjahr getestet. |
| Grund-Auswahl closed set | ✅ 3 Gründe (`bescheid.ts:191`), Server prüft `istEinspruchGrund` (`bescheid.service.ts:236`). |
| Kein „Korrigieren" nach Bescheid | ✅ Screen rendert nirgends „Korrigieren"; Test pinnt Abwesenheit im `geprüft`-Zustand. |
| 5 Felder feldverschlüsselt + Audit | ✅ `prisma-encrypted-fields.test.ts` + P5-Ciphertext `req-023-bescheidpruefung.test.ts:200-213` (Raw-SQL, `^v\d+\.aesgcm256\.`). |
| REQ-023 Register + Kollisionsvermerk | ✅ `register.md:33` REQ-023 Done; `REQ-022`/`REQ-024` fehlen (10.2/10.4 parallel), im Ticket vermerkt. |

## 2. Findings

### F1 (Minor) — Übergangstabelle nicht vollständig abgedeckt (Selbstschleifen fehlen)
`packages/core/src/steuerjahr-status.test.ts:95-120` pinnt den Happy-Path (2 Kanten) und 4 illegale
Quer-Sprünge, aber nicht die 3 Selbstschleifen (`eingegangen→eingegangen`, `geprüft→geprüft`,
`einspruch-eingelegt→einspruch-eingelegt`). Die AC „Deckt der Test die Übergangstabelle (nicht nur einen
Pfad)?" ist im Kern erfüllt (mehr als ein Pfad, inkl. illegaler Sprünge), aber nicht die volle 3×3-Matrix.
**Vorschlag:** `it.each` über die fehlenden 3 Reflexiv-Fälle ergänzen (`expect(istBescheidUebergangErlaubt(z, z)).toBe(false)`).

### F2 (Minor) — „Ehrlich im Register vermerkt" stimmt nicht: Register ist stumm, nicht vermerkt
Ticket-AC 3 (`10-3-bescheidpruefung.md:22`) sagt „Ehrlich im Register vermerkt". `register.md:33`
(REQ-023) erwähnt die Korrektur-vor-Bescheid-Grenze (`korrigiereFassung` = reiner Kern ohne
Fassungs-/Einreichungs-Modell, ohne Endpoint) **nicht**. Das Register überverspricht nichts (die
REQ-023-Formulierung enthält den VOR-Bescheid-„Korrigieren"-Flow gar nicht), aber der Vermerk, auf den
das Ticket verweist, existiert dort nicht. Die ehrliche Grenze ist damit in Ticket + Code-Kommentar
sichtbar, aber nicht dort, wo das Ticket sie verortet.
**Vorschlag:** Einen Satz in der REQ-023-Registerzeile (oder einer Notes-Zeile) ergänzen: „Korrektur VOR
Bescheid (`korrigiereFassung`) ist reiner Kern ohne Persistenz/Endpoint; das Fassungs-/Einreichungs-Modell
liegt beim Einreichungs-Flow, nicht hier." Oder den Ticket-Verweis auf „Ticket + Code-Kommentar" statt
„Register" präzisieren.

### F3 (Minor, fachlich) — Fristen-Countdown rechnet „heute" in UTC, nicht lokaler Zeit
`apps/api/src/bescheid/bescheid.service.ts:260-262` (`heuteIso()` = `new Date().toISOString().slice(0,10)`)
zieht UTC als Referenztag für `verbleibendeTage`. Für deutsche Nutzer zwischen 00:00 und 02:00 CEST
(01:00 CET) liegt UTC einen Tag zurück: an dem Tag, an dem die Frist tatsächlich abgelaufen ist, zeigt der
Countdown noch „0 Tage" statt „abgelaufen". Der Code benennt „UTC" zwar (`bescheid.service.ts:259`), aber
nicht die Off-by-one-Folge. Die Monatsfrist selbst ist korrekt; nur der Tag-Nullpunkt driftet.
**Vorschlag:** Lokalen Kalendertag statt UTC verwenden (z. B. Europe/Berlin), oder die UTC-Wahl samt der
Off-by-one-Folge im Kommentar ehrlich benennen — konsistent zur bereits benannten § 108 Abs. 3-AO-Lücke.

### F4 (Nit) — `istGueltigerBescheidBetrag` redundanter `Number.isFinite`-Zweig
`packages/core/src/bescheid.ts:253-257`: nach dem vorgeschalteten `Number.isInteger(wert)` ist
`Number.isFinite(wert)` im `signiert`-Zweig immer wahr. Nicht falsch, aber der Zweig liest sich, als ließe
er nicht-ganzzahlige `erstattung` zu. **Vorschlag:** `return def?.signiert === true ? true : wert >= 0`
(oder den Zweig klar kommentieren, dass der Integer-Check schon gate-t).

### F5 (Nit) — inkonsistente Exception-Typen bei der Kodierung
`serialisiereBescheidFeld` wirft `RangeError` (`bescheid.ts:264`), `deserialisiereBescheidFeld` wirft
`Error` (`bescheid.ts:275`) für denselben Fehlerklasse (ungültiger Betrag). **Vorschlag:** beide `RangeError`
für konsistentes Catch-Verhalten an der Boundary.

### F6 (Beobachtung, kein Fix nötig) — keine Edit-Sperre nach `einspruch-eingelegt`
`setFeld`/`setDatum` bleiben nach dem terminalen Sub-Zustand schreibbar. Die AC verlangen das nicht, und
der Code benennt `einspruch-eingelegt` explizit als „terminal WITHIN this phase" (`steuerjahr-status.ts:61`),
die Finanzamt-Antwort ist ein späterer Slice. Als bewusste Grenze akzeptabel; ggf. im Ticket als offener
Punkt für den Einspruchs-Antwort-Slice vormerken.

## 3. Nicht re-verifiziert

- **Gates (typecheck / lint / Test-Suiten):** nicht neu ausgeführt (Prüfauftrag „nicht neu laufen lassen").
  Befund aus den Testdateien plausibel: Core-Unit-Suite (`bescheid.test.ts`, `steuerjahr-status.test.ts`)
  deckt die deterministischen Regeln; Service-Unit (`bescheid.service.test.ts`) + Acceptance
  (`req-023-bescheidpruefung.test.ts`, real Postgres + real Socket, GWT + P2–P5 + Audit) belegen die
  vertikale Kette. Nicht selbst grün gesehen.
- **Produkt-ADR-009-Treue des Einspruch-Grund-Sets:** ADR-009 („Korrektur VOR / Einspruch NACH Bescheid")
  liegt als Produkt-ADR außerhalb von `docs/adr/` und war im Repo nicht auffindbar; die drei Gründe
  (`betrag-falsch`, `beleg-nicht-beruecksichtigt`, `sonstiges`) sind die Agent-Interpretation. Ob das closed
  set wortlautgetreu zu ADR-009 ist, konnte ich nicht gegen die Quelle prüfen.
