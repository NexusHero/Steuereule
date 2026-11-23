# ADR-0043 — Veranlagungsartenvergleich-Verfeinerung: Soli/KiSt eingefaltet, Unschärfe nur noch der Progressionsvorbehalt

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 10.2) — Verfeinerung von ADR-0034, ausgelöst durch Mustis
  Review des 10.2-Branches (REQUEST-CHANGES F2).
- **Refines** [ADR-0034](0034-veranlagungsartenvergleich-returns-a-bounded-comparison.md) Decision 3
  (und dessen Consequences-Absatz „until Soli and Kirchensteuer are computed …").
- **Applies** [ADR-0032](0032-nothing-on-screen-promises-what-the-slice-does-not-deliver.md) (kein
  fabrizierter Nullwert) und [ADR-0033](0033-the-question-graph-lives-in-packages-core.md) § *citation
  form* — die PV-Schranke ist eine neue, zitierbare Ableitung und gehört ins ADR-Log, nicht nur in
  einen Modul-Kopf-Vermerk.
- **Context tags:** architecture, determinism boundary, honesty principle, tax computation

## Context

ADR-0034 regelte den Veranlagungsartenvergleich als **bounded comparison** und ließ dabei drei
Faktoren explizit **unberechnet** — Solidaritätszuschlag, Kirchensteuer und Progressionsvorbehalt.
Decision 3 modellierte Soli und KiSt als (berechenbare) obere Schranke über Zahlen, die das Modul
„already holds", und den Progressionsvorbehalt als **unboundable**: ohne Eingabe ist `unschaerfe`
`unbestimmt` und `aussage` kann nie `eindeutig` werden.

Ticket 10.2 (M1) hat zwei dieser drei Lücken geschlossen, und zwar anders, als ADR-0034 sie
antizipiert hatte:

1. **Soli und KiSt werden jetzt berechnet** (`packages/core/src/tarif.ts` — §4 SolZG mit Freigrenze +
   Milderungszone, §51a als Aufrufer-Faktor `0 | 0.08 | 0.09`), und in `einzel`/`zusammen`/`delta`
   eingefaltet. ADR-0034s Decision-3-Text („an upper bound … arithmetic over numbers this module
   already holds") beschreibt damit einen Mechanismus, den es nicht mehr gibt: Soli/KiSt sind nicht
   mehr Teil von `unschaerfe`.
2. **Der Progressionsvorbehalt wird begrenzbar**, über ein neues Eingabeobjekt
   (`ProgressionsvorbehaltEingabe`) mit einer Schranke, die ADR-0034 als nicht herleitbar
   bezeichnete. Die Kern-Invariante (bounded comparison, `aussage` zuerst, `empfehlung` nur auf
   `eindeutig`) bleibt dabei vollständig gewahrt — es ist eine Verfeinerung, kein stiller
   Widerspruch, und ADR-0034s Consequences-Absatz („until Soli and Kirchensteuer are computed and
   Progressionsvorbehalt is an input") hat genau diesen Schritt vorhergesehen. Aber der ADR-Text zu
   Decision 3 ist jetzt **stale**, und die neue PV-Schranke ist eine Ableitung, die im ADR-Log
   fehlt (ADR-0033: citation form).

## Decision

Decision 3 von ADR-0034 wird wie folgt präzisiert (nicht rückwirkend umgeschrieben — siehe
Consequences):

1. **`einzel`/`zusammen`/`delta` tragen die volle festgesetzte Steuer.** Die Zahlen sind
   Einkommensteuer **plus** Solidaritätszuschlag **plus** (optionaler) Kirchensteuer — exakt auf den
   Euro, für die zwei übergebenen zvE-Basen. Soli und KiSt sind **nicht mehr** Teil der Unschärfe:
   Sie sind monotone Zuschläge auf eine ESt, die sich zwischen den Veranlagungsarten unterscheidet,
   und können das Vorzeichen von `delta` nicht drehen — ein ausgeschlossener Faktor, der das
   Ergebnis nicht kippen kann, gehört nicht in die Fehlergrenze.

2. **`unschaerfe` ist ausschließlich der Progressionsvorbehalt (§32b EStG).** Der einzige
   ausgeschlossene Faktor, der das Ergebnis kippen kann. Seine obere Schranke ist
   `45 % × Lohnersatzleistungen`, aufgerundet auf den ganzen Euro
   (`Math.ceil(MAX_GRENZSTEUERSATZ * betrag)`, `MAX_GRENZSTEUERSATZ = 0.45` aus §32a Abs. 1 Nr. 5
   EStG). Herleitung: die PV-Wirkung ist `y·[s(y+P)−s(y)]` mit `s′(u)=(T′(u)−s(u))/u ≤ 45 %/u`,
   also `≤ 45 %·y·ln(1+P/y) ≤ 45 %·P`; da der PV beide Seiten (einzel/zusammen) nur erhöht, gilt
   `|Δdelta| ≤ 45 %·P`. Das ist eine **konservative, zitierbare** Obergrenze — der Spitzengrenz-
   steuersatz als oberer Deckel, keine aus dem Gefühl gewählte Schwelle (im Geist von ADR-0034
   „computed, not chosen").

3. **`nicht-angegeben` bleibt der ehrliche Unbestimmtheits-Fall.** Wenn der Progressionsvorbehalt
   nicht (oder nicht vollständig) erfasst ist — `ProgressionsvorbehaltEingabe` mit `art:
   'nicht-angegeben'` —, ist `unschaerfe` `unbestimmt` und `aussage` kann **nie** `eindeutig`
   werden. Das gilt auch für die Service-Ebene: ein `lohnersatz === 'Ja'` ohne erfassten (positiven)
   Betrag wird auf `nicht-angegeben` gemappt, **nicht** auf `lohnersatzleistungen` mit `betrag: 0`
   (ein fabrizierter Nullwert würde `obergrenze: 0` erzeugen und ein falsches `eindeutig` möglich
   machen — ADR-0032).

`aussage === 'eindeutig'` genau dann, wenn `unschaerfe.kind === 'bestimmt' && |delta| >
unschaerfe.obergrenze` — dieselbe Invariante wie in ADR-0034 Decision 3, mit der präzisierten
Bedeutung der beiden Terme.

## Consequences

- **ADR-0034 bleibt die Quelle der Invariante; Decision 3 ist dort nicht mehr wörtlich aktuell.**
  Dieses ADR **supersediert** den Soli/KiSt-Schranken- und den „PV ist unboundable"-Teil von
  ADR-0034 Decision 3. Der Rest von ADR-0034 (Decision 1 Namensdisziplin, Decision 2 Typ-Erzwingung,
  Decision 4 Schlussfolgerungs-Tabelle) bleibt unverändert in Kraft. ADR-0034 wird nicht rückwirkend
  umgeschrieben (Log-Regel: ein ADR, das ein anderes ersetzt, supersediert es, schreibt Geschichte
  nicht neu).
- **`unschaerfe` wird enger und ehrlicher.** Statt einer Schranke über drei nicht berechnete
  Faktoren ist sie jetzt die Schranke über genau den einen, der tatsächlich kippen kann. Der
  `zu-knapp`-Fall ist damit seltener falsch als unter ADR-0034: ein Delta innerhalb der
  PV-Rauschgrenze wird nicht mehr zusätzlich mit der Soli/KiSt-Unsicherheit belastet.
- **Die PV-Schranke ist eine Zahl, die jemand verteidigen können muss.** Deshalb steht sie hier mit
  Herleitung, nicht als Kommentar im Modul-Kopf. Ein Aufrufer, der `unschaerfe.obergrenze` liest,
  kann auf dieses ADR zeigen statt eine Konstante zu rechtfertigen.
- **Ebene 3 bleibt offen.** Wie in ADR-0034 §4 behauptet dieses Modul nichts über die Richtigkeit
  der eingegebenen zvE-Basen; `zveA`/`zveB` sind im M1-Slice eine Einnahmen-Basis, kein echtes
  zu versteuerndes Einkommen. Diese Verfeinerung ändert das nicht.

## Alternatives considered

- **Soli/KiSt weiter in `unschaerfe` modellieren statt zu berechnen.** Rejected: Ticket 10.2
  berechnet sie ohnehin (tarif.ts); sie als „unberechenbare" Schranke zu behandeln wäre eine
  Selbst-Auskunft über einen Faktor, den das Modul inzwischen exakt kennt, und würde `einzel`/
  `zusammen` weiter mit einer Unsicherheit belasten, die es nicht mehr gibt.
- **Die PV-Schranke als Teil von ADR-0034 nachdokumentieren statt ein Folge-ADR anzulegen.**
  Rejected: Das ADR-Log ist append-only (4-stellig, sequentiell, immutable); eine nachträgliche
  Änderung von Decision 3 würde Geschichte umschreiben. Ein Folge-ADR, das referenziert und
  präzisiert, ist die Regel.
- **Die PV-Schranke als Kommentar im Modul-Kopf belassen.** Rejected auf ADR-0021s These: ein
  Vermerk, den niemand zwingend lesen muss, ist keine Kontrolle und kein ADR-Log-Eintrag
  (ADR-0033 citation form). Die Ableitung gehört in das Dokument, das Architekturentscheidungen
  rechtfertigt.
