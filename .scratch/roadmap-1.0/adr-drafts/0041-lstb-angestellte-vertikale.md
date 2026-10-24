# ADR-0041 — Angestellte-Vertikale: LStB-Scan-Fallback-Maske + On-Demand-Katalog-Einträge (Entwurf) <!-- adr-check-ignore -->

- **Status:** Draft — not yet promoted to `docs/adr/`
- **Date:** 2026-10-24
- **Deciders:** Kaan (backend/FE, Ticket 08) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-036 (Scan-Fallback-Maske statt OCR), Produkt-ADR-031 (5 Lebenslagen),
  Produkt-ADR-016/035 (on-demand Sonderausgaben-Katalog), Produkt-ADR-008 (sichtbarer Konflikt,
  nie stilles Überschreiben)
- **Builds on** ADR-0008 (Feldverschlüsselung), ADR-0007/0012 (userId-Seam), REQ-004 (Audit),
  ADR-0031 §3 (ein Katalog-Walker, kein zweiter Codepfad), ADR-0033 (Graph in `packages/core`,
  Server validiert), ADR-0032 (nichts verspricht mehr als der Slice liefert)
- **Context tags:** architecture, lstb, interview, catalog, honesty principle, encryption

> **⚠ Nummern-Kollision (offen — hier NICHT auflösen):** `0041` ist auch vom parallelen
> Grenzgänger-CH-Zweig (Ticket 09) belegt, der in seinem eigenen Worktree (nicht in diesem Branch)
> den Entwurf `0041-grenzgaenger-ch-vertikale.md` führt. Beim Merge sind dieser Entwurf und der
> t09-Entwurf auf `0041`/`0042` aufzulösen; die endgültige Nummer ist DANN in diesem Titel und allen
> Verweisen nachzuziehen. Dieser Entwurf behält `0041` bewusst bei, damit beide Branches textuell
> mergebar bleiben; der `adr-check-ignore`-Marker im Titel trägt den Entwurf bis zu dieser
> Umnummerierung durch den ADR-Nummern-Check.

## Context

Phase 1a (Ticket 08) baut die Angestellte-Vertikale auf dem geteilten Kern (Phase 0.4). Zwei
Datenaufnahmen sind neu und brauchen eine Architektur-Entscheidung, weil sie beide den
Ehrlichkeits-Grundsatz (ADR-0032/ADR-032) auf der Persistenz-Seite umsetzen müssen:

1. **LStB-Datenaufnahme** (Produkt-ADR-036): Der Nutzer überträgt die drei gedruckten LStB-Werte
   feldweise in eine geführte Maske. Scan/OCR ist bewusst NICHT hier (Produkt-ADR-045, später).
   Die Maske muss drei ehrliche Zustände pro Feld abbilden — `erfasst`, `offen`, `unklar`
   ("hingesehen, nicht lesbar") — und einen sichtbaren Widerspruch (Produkt-ADR-008), nie ein
   stilles Korrigieren.
2. **Interview Segment 2 / Katalog** (Produkt-ADR-031/016/035): Die 5 Lebenslagen und die
   Sonderausgaben (Spenden, KV/PV, Riester) kommen als WEITERE Katalog-Einträge über die SAME
   Engine, die schon das Minimal-Gate läuft (ADR-0031 §3). Die Server-Zulassung darf kein zweiter
   Codepfad werden.

## Decision

1. **`packages/core/lstb.ts` — das reine LStB-Modell.** Drei Felder, je eines von
   `erfasst` (Ganzzahl-Euro) | `offen` | `unklar`. Der abgeleitete `LstbZustand`
   (`unvollstaendig` | `widerspruch` | `vollstaendig`) ist eine reine Funktion der drei
   Feldzustände und wird bei jedem Lesen neu gerechnet, **nie gespeichert** (ADR-014/048:
   eine gespeicherte Kopie eines ableitbaren Zustands kann nur driften). Der Widerspruch
   ("Lohnsteuer/SV übersteigt Brutto") ist benannt, nie still korrigiert (ADR-008).

2. **Persistenz: drei nullable String-Spalten, eine Encoding-Stelle.** `null` = `offen`, der
   reservierte Marker `unklar` = "nicht lesbar", jede andere Zeichenkette = Ganzzahl-Euro
   (`erfasst`). Die Abbildung Feldzustand ↔ String lebt an GENAU einer Stelle
   (`serialisiereLstbFeld`/`deserialisiereLstbFeld` in `packages/core/lstb.ts`), damit das
   API-Repository und seine Tests nicht auseinanderdriften (ADR-0033-Instinkt). Der Marker kann
   nie mit einem echten Wert kollidieren, weil erfasste Werte Ganzzahlen sind und der Marker
   keine Zahl ist. **Warum ein String, keine drei Spalten pro Zustand:** eine Spalte pro Feld
   trägt den Zustand inklusive Betrag, ohne dass eine "Zustands-Spalte" neben einer
   "Betrags-Spalte" auseinanderlaufen kann.

3. **Alle drei Werte sind feldverschlüsselt at rest** (ADR-0008). Tatsächliches Einkommen ist die
   sensibelste personenbezogene Tatsache, die eine Steuer-App hält — über dieselbe `userId`
   verknüpfbar mit der Steuer-ID im `Profile` — anders als `TaxYear` (nur Zähler) oder die
   `Beleg`-Daten (die die Vorschlagsregel im Klartext braucht). Das `Lstb`-Modell (`schema.prisma`)
   dokumentiert diese Begründung am Modell.

4. **API: `GET /v1/steuerjahre/{jahr}/lstb` + `PUT .../lstb/{feld}`.** Ein Row pro
   `(userId, steuerjahr)`; der GET liefert die drei Feldzustände plus den abgeleiteten `zustand`
   (Wiedereinstieg, derselbe "Server entscheidet, was wahr ist"-Seam wie das Interview). Der PUT
   ist ein Upsert EINES Felds. `@RequiresAccount()` (kein Gast-Pfad), WRITE-Audit atomar mit dem
   Upsert (REQ-004), READ-Audit nur bei vorhandener Zeile.

5. **Katalog-Einträge: ein Walker, eine Registry (ADR-0031 §3).** `ENTRIES['lebenslagen']` und
   `ENTRIES['sonderausgaben']` sind Einträge desselben `CatalogueEntry`-Typs; nur die
   Betrags-Follow-ups sind namensgeprägt (`dhf-miete`, `umzug-kosten`, `spenden-betrag`, …), die
   Top-Level-Ids (`dhf`, `umzug`, `spenden`, …) sind bewusst nackt — das ist ein Namens-Merkmal,
   kein Namespace. Die Kollisionssicherheit gegen die parallele Grenzgänger-CH-Vertikale (Ticket 09) kommt
   strukturell aus der geschlossenen `EntryStepId`-Union plus dem `buildStepIndex`-Throw (D3), nicht
   aus der Benennung: ein zweiter Claim derselben Id lässt sich so nicht bauen. Der Server leitet den
   besitzenden Eintrag aus der nackten `questionId` ab (`entryForStep`, D3 in `interview.ts`),
   statt einem Client-gelieferten Scope zu vertrauen — dieselbe Admission, nur der Eintrag
   unterscheidet sich. Das `eintrag`-Query auf dem GET ist die Wiedereinstiegs-Oberfläche; ein
   unbekannter Id ist ein 400.

## Consequences

- **Ehrlichkeit ist strukturell:** ein nicht-lesbarer LStB-Wert kann nicht als "vergessen"
  dargestellt werden und ein Widerspruch nicht als korrigiert — beides ist ein benannter Zustand,
  kein Default.
- **Ein Rechenweg:** der `LstbZustand` (und später der `AngestelltenStand`/die
  `Plausibilitäts-Prüfung`) wird ausschließlich in `packages/core` gerechnet; die API mappt nur.
- **Client bleibt dumm:** mobile-web rendert die Maske aus dem GET; keine zweite Zustandslogik im
  Client (ADR-0033). MSW-Handler sind generiert (orval), nie handgeschrieben.
- **Bewusst NICHT hier:** Scan/OCR (Produkt-ADR-045), die Steuerformeln (Tarif, Fünftelregelung,
  Progressionsvorbehalt, zumutbare Belastung), die Arbeitstage-/Pendlerpauschale-Anbindung an die
  API und die Cockpit-Echtdaten — das sind spätere Slices; dieser Slice erfasst und faltet ehrlich,
  was erfasst und faltbar ist (derselbe "partial truth as partial truth"-Schnitt wie
  `berechnung.ts`).
- **Migration:** eine additive `Lstb`-Tabelle, `@@unique([userId, steuerjahr])`; keine Änderung an
  bestehenden Tabellen (Interview/TaxYear/Beleg unberührt) — die Interview-Änderungen (R2) sind
  rein additiv im Katalog-Layer.
