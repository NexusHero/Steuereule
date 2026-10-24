# Review — Ticket 09, Phase 1b Grenzgänger-CH, Slice 1

- **Branch:** `ticket-09-p1b-grenzgaenger-ch` (Worktree `/Users/suhaysevinc/source/Steuereule-t09`)
- **Basis:** `563e076` · **HEAD:** `199dfdf` (3 Commits)
- **Reviewer:** Musti (Lead/Architect) — read-only

## Verdikt

**REQUEST-CHANGES**

Zwei Punkte müssen vor Merge korrigiert werden: (1) die entry-aware `postAnswer`-Änderung
gibt **Segment 2** stillschweigend serverseitig frei — das war per #321 explizit „R2s Job" und
wird im Core-Header weiterhin als „not yet admitted server-side" geführt (stale Doku + Grenz-
Übertritt ohne Test/REQ/Entscheid); (2) der ADR-0041-Entwurf kollidiert mit t08s `0041-lstb-…`
und markiert diese Kollision **nicht** offen, obwohl das ausdrücklich gefordert war. Der Rest —
Wechselkurs-Kern, 45-Tage-Status (abgeleitet), Lohnausweis-Maske, Beleg-`art`-Migration,
REQ-016/017-Done/018-in-progress — ist fachlich sauber, ehrlich benannt und gut getestet.

---

## Findings

### F1 (blockierend) — Entry-aware `postAnswer` gibt Segment 2 ungefragt frei

`apps/api/src/interview/interview.service.ts:95-97,115` ersetzt die Minimal-Gate-Bindung
`isReachable(…)` durch `entryForStep(questionId)` + `isReachableFor(ENTRIES[entryId], …)`.
`entryForStep` ist generisch über **alle** Entries, nicht nur `minimal-gate`+`segment-ch` —
also wird auch `partner`/`homeoffice`/`weg`/… (Segment 2) jetzt am selben Endpoint zugelassen.
Vorher lieferte `isReachable({}, 'partner')` → `false` → 409.

Warum das ein Grenzübertritt ist, nicht nur Kosmetik:

- `packages/core/src/interview.ts:2-3` sagt weiterhin wörtlich *„Segment 2 declared here,
  not yet admitted server-side — that is R2's job"* — diese Aussage ist durch die
  Service-Änderung **faktisch falsch** geworden, der Header wurde nicht angepasst.
- `packages/core/src/interview.ts:87-88` fixiert die Absicht: D3 ist *„under names R2 opts
  into **deliberately rather than inheriting silently**"*. Genau dieses stille Erben passiert
  jetzt — als Seiteneffekt von segment-ch, nicht als R2-Entscheid.
- Kein Test deckt die API-Admission von Segment 2 (Reihenfolge `partner→…→einkuenfte→Branches`).
  Der einzige Pin ist `packages/core/src/interview.test.ts:259` (`isReachable({}, 'partner')
  === false`), der von der Service-Änderung unberührt bleibt und daher grün bleibt — er beweist
  die alte Grenze, nicht die neue.

**Vorschlag:** entweder die Admission explizit auf die heute zugelassenen Entries begrenzen
(z. B. Allowlist `minimal-gate`/`segment-ch`, oder ein Guard, der segment-2 bis R2 abweist),
oder — falls „one engine, every entry" bewusst gewollt ist — (a) den Core-Header
(`interview.ts:2-3`, `87-88`) umschreiben, (b) einen API-Test für die segment-2-Admission
nachziehen und (c) die Grenz-Verschiebung im Commit/ADR offen als Entscheid festhalten. Im
jetzigen Zustand ist es ein stiller Verhaltenswechsel auf einem geteilten Endpoint.

### F2 (blockierend) — ADR-0041-Kollision mit t08 nicht markiert

`.scratch/roadmap-1.0/adr-drafts/0041-grenzgaenger-ch-vertikale.md` beansprucht die Nummer 0041,
t08 hält `.scratch/roadmap-1.0/adr-drafts/0041-lstb-angestellte-vertikale.md` (im Worktree
`Steuereule-t08`). Der t09-Entwurf trägt zwar `<!-- adr-check-ignore -->` und „Status: Draft",
erwähnt aber **nirgends**, dass 0041 doppelt vergeben ist und bei Promotion aufgelöst werden muss.
Der Prüfauftrag verlangte genau diese Offen-Markierung.

**Vorschlag:** im Entwurf einen Satz ergänzen, z. B. *„Nummer 0041 kollidiert mit t08s
`0041-lstb-angestellte-vertikale.md` — die endgültige Nummer wird bei Promotion vergeben,
nicht hier festgeschrieben."*

### F3 — „type-level invariant" (ADR-012) ist überzeichnet

`packages/core/src/wechselkurs.ts:14-21` modelliert `belegId?: string` **unabhängig** von `modus`
optional — `{ modus: 'tatsaechlich' }` ohne `belegId` ist damit *typ-konstruierbar*. Erzwungen
wird die Regel nur (a) an der Fabrik (`tatsaechlicherKurs`, `wechselkurs.ts:34-37`, wirft auf
leerer `belegId`) und (b) an der Plausibilität (`wechselkurs-tatsaechlich-ohne-beleg`). Die
Header-Kommentare (`wechselkurs.ts:5-7` „type-level invariant", „a type, not a hope") und
ADR-0041 §3 behaupten mehr, als der Typ hält. Die Plausibilitäts-Kommentare
(`grenzgaenger-plausibilitaet.ts:42-45`) sind dagegen ehrlich („unrepresentable on CONSTRUCTION,
but a persisted … can be inconsistent").

**Vorschlag:** entweder echtes Diskriminierten-Union
`{ modus:'amtlich' } | { modus:'tatsaechlich', belegId:string }` (macht `wechselkursQuelle`s
`as string`-Cast überflüssig), oder die Wortwahl auf „Fabrik-Invariante + Plausibilitäts-Check
für persistierte Daten" präzisieren. Fachlich ist die Unterscheidung *erzwungen*, nur eben nicht
im Typ selbst.

### F4 — `art`: `null` vs. `'Sonstiges'` sind zwei Repräsentationen desselben Begriffs

Drei Stellen beschreiben dasselbe „generic receipt" unterschiedlich: `schema.prisma:380`
(„null is the pre-CH undifferentiated receipt"), `belegart.ts:20` (`'Sonstiges'` = „the pre-CH
generic receipt"), `create-beleg.dto.ts:27` („Omitted = … (Sonstiges)"). Die Code-Pfade schreiben
bei Omission `null` und geben `null` zurück (`beleg.service.ts:38` `record.art ?? null`), nie
`'Sonstiges'`. `'Sonstiges'` ist damit ein Vokabular-Wert ohne schreibenden Pfad.

**Vorschlag:** klären, ob `'Sonstiges'` ein explizit wählbarer Wert (≠ „noch nicht klassifiziert")
ist oder redundant zu `null`. Falls redundant, entweder den Wert streichen oder die Doku auf
„`null` = nicht klassifiziert, `'Sonstiges'` = bewusst als Sonstiges klassifiziert" schärfen.

### F5 — GET-Status bleibt nicht entry-aware

`interview.service.ts:74-75` (`getState`) liefert weiterhin `nextStep`/`remainingSteps` des
Minimal-Gate; nur `postAnswer` ist entry-aware. Eine CH-Client-Antwort bekommt per GET also den
Minimal-Gate-`nextStep`, nicht den CH-Eintrag. Ist als Folge des bewusst fehlenden CH-Screens
plausibel, aber nirgends als Lücke benannt.

**Vorschlag:** eine Zeile Kommentar im Service oder im ADR („GET ist noch nicht entry-aware;
der CH-Screen braucht `nextStepFor(segment-ch)` clientseitig bzw. ein entry-aware GET"), damit
es nicht für vollständige Entry-Awareness gehalten wird.

### F6 — `ChPostenArt`-Mitglieder `AHV`/`Familienzulage` ohne Produzenten

`grenzgaenger.ts` deklariert `'AHV'` und `'Familienzulage'` im `ChPostenArt`-Union und
`feldZuPostenArt` hat einen `'ahv-beitraege' → 'AHV'`-Arm; aber `ahv-beitraege` ist
`postenRelevant: false` (wird von `chPostenAusLohnausweis` übersprungen) und Familienzulagen
laufen über `zulagenVerrechnen` (liefert eine Zahl, keinen `ChPosten`). Der `AHV`-Arm ist damit
toter Code; die Union ist eine ehrliche Vorausdeklaration, aber als solche nicht markiert.

**Vorschlag:** Kommentar „future-facing, noch kein Produzent in diesem Slice" an die beiden
Mitglieder; den toten `ahv-beitraege`-Arm entweder streichen oder explizit als Vorbereitung kennzeichnen.

---

## Fachliche Kernfragen — Antworten

1. **Wechselkurs (ADR-012):** Unterscheidung ist *erzwungen* (Fabrik + Plausibilität), aber
   nicht im Typ selbst — siehe F3. Der amtliche Kurs wird als `monat`+`kurs`-Eingabe geführt
   (`amtlicherMonatskurs('2026-01', 0.9412)`), nicht als ewige Konstante; die BMF-Quelle ist
   als „later backend slice" korrekt benannt (`wechselkurs.ts`-Header). ✓
2. **Grenzgänger-Status:** abgeleitet (`grenzgaengerStatus`, rein, nicht gespeichert),
   Nichtrückkehrtage werden erfasst, Status daraus berechnet; >45 Tage ist ein *Hinweis*,
   keine stille Korrektur (ADR-008 respektiert). ✓
3. **CH-Interview:** Engine wurde **nicht** aufgeweicht — `entryForStep`/`isReachableFor`/
   `nextStepFor` existierten bereits (#321). Der Acceptance-Test beweist unreachable → 409 ohne
   Row-Write (`req-017-ch-interview.test.ts`, „server-side order"-Test). ✓ — aber der generische
   Pfad gibt Segment 2 mit frei (F1).
4. **Beleg-`art`:** Migration expand-only (`ADD COLUMN "art" TEXT`, nullable, kein Default —
   bestehende Belege → `null`), `dateiname` bleibt `@encrypted?mode=strict`, `@IsIn` gegen
   `BELEGARTEN`. Audit unverändert (READ-Audit bei `list` erhalten; der `create`-Pfad hat —
   wie zuvor — kein WRITE-Audit). ✓
5. **Posten-Kern-Grenze:** sauber — nur `bruttolohnAlsKernposten` mappt auf den income-`Posten`;
   PK/Quellensteuer/3a/KK/Zulagen werden erfasst+konvertiert, aber nicht gefaltet; ehrlich als
   Koordination mit t08 benannt (ADR-0015-Lehre). Keine halben Posten. ✓
6. **Register REQ-016/017/018:** Status-Ehrlichkeit gegeben (016/017 Done, 018 „In progress"
   mit explizit benannter deferierter Faltung/API-Oberfläche); Tier-Zitate (core/unit/acceptance)
   vorhanden. Der untere Trace-Tabellen-Eintrag für REQ-018 sagt „green (unit) — core pur", was
   zum „In progress" der Summary-Zeile passt, weil er selbst den Umfang („core pur", deferiert)
   benennt. ✓

## Nicht re-verifiziert (Gates bewusst nicht neu gelaufen)

- Core-Tests (234), API-Tests (354+8+6), mobile-web (33), typecheck/lint/register/adr —
  Agent-Befund für **plausibel** befunden, aber **nicht neu ausgeführt** (per Auftrag).
- Keine Laufzeit-/Gates-Ausführung, kein `prisma migrate`-Dry-Run.

## Positive Beobachtungen

- Why-Kommentare mit ADR-Zitaten durchgehend; kein Eigenbau der Engine (F1 ausgenommen, dort
  wird die Engine korrekt *verwendet*, nur breiter als der Ticket-Scope).
- Commit-Konventionen sauber (Robin, `Co-authored-by` als Sign-off, kein Tool-Footer).
- Migration eindeutig (`20261024090000` folgt auf `…080000_add_beleg`), einzige `art`-Migration.
- Ehrlichkeit durchgehend: „offen statt Null-Fabrikation", „keine erfundene Formel", „kein
  Schätzwert" (ADR-032) konsequent.
