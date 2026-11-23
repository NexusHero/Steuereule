# ADR-0049 — Jahresübernahme: Quelle `uebernahme`, unbestätigte Posten zählen in die Spanne, Kennzeichnungs-Schicht (Entwurf)

- **Status:** Draft — promotion needs Musti review (ticket 10.8 review)
- **Date:** 2026-10-25 (M2: Übernahme ALLER Fakten; M3: Jahr-Auswahl + Hinweis + 4-Rückjahre-Validierung)
- **Deciders:** Suhay (agent, Ticket 10.8) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-021 (Jahresübernahme: alles kopieren, aber als „unbestätigt"
  markiert), Produkt-ADR-022 (Jahresbezug der Herkunft)
- **Builds on** ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0037 (Steuerjahr-Modell),
  ADR-0014/015 (Herkunft/partielle Wahrheit), ADR-0008 (Feldverschlüsselung)
- **Context tags:** architecture, uebernahme, determinism boundary, honesty principle, security

## Context

Produkt-ADR-021: ein neues Steuerjahr KOPIERT alles aus dem Vorjahr, aber jeder kopierte Posten
trägt die Herkunft „Übernahme aus {Vorjahr}" und gilt als **unbestätigt**, bis er angetippt oder
durch einen Beleg gedeckt wird; unbestätigte zählen in die Spanne, nicht in den Punktwert — ein
ruhiger, grauer Ton, nie ein Konflikt (ADR-008 ist für Widersprüche da). Der Ticket-Umfang
(Jahresübernahme + bis 4 Rückjahre + prominente Jahr-Auswahl + Jahresregelwerke) ist zu groß für
einen Schnitt — dieser Entwurf legt die Schnitte fest: M1 (LStB-Tracer, gemergt) → M2 (alle
Fakten + Cockpit-Summen, dieser Stand) → Rest (ADR-022-UI, benannte Follow-ups).

## Decision

1. **Der Kern trägt den Übernahme-Zustand (`berechnung.ts`)** — `Quelle` wächst um
   `{ art: 'uebernahme'; vorjahr: number }` (die Herkunft mit Jahresbezug, ADR-022), `Posten` um
   `unbestaetigt?: boolean` (absent = bestätigt). `berechne` zählt unbestätigte Posten MIT in die
   Buckets (es sind echte Zahlen), versagt aber den Punktwert und benennt sie im `offen`-Zweig
   ruhig: `unbestaetigte` (Anzahl) + `unbestaetigteSumme` (Einnahmen-Summe) — nie als Konflikt.
   `cockpitSpanne` trägt `unbestaetigteSumme` als Unsicherheit in die Spanne.

2. **Der Kopier-/Bestätigungs-Vertrag (`uebernahme.ts`)** — `uebernommenerPosten(posten,
   vorjahr)` (Quelle `uebernahme`, `unbestaetigt: true`), `bestaetigePosten(posten)` (Flag weg,
   Herkunft BLEIBT — eine bestätigte Tatsache ändert ihre Herkunft nicht, ADR-0012 §4-Instinkt),
   `uebernahmeHerkunft(vorjahr)` (der Herkunfts-Chip).

3. **Eine generische Kennzeichnungs-Schicht statt unbestaetigt-Spalten in jedem Fakten-Modell**
   — `UebernahmeKennzeichnung { userId, steuerjahr, vorjahr, postenKey, bestaetigt }` mit
   `@@unique([userId, steuerjahr, postenKey])`. Die Fakten bleiben in ihren Modellen (Lstb/…);
   die Kennzeichnung ist die Schicht, die sagt, was wovon kopiert wurde und ob es bestätigt ist.
   Ein zweiter Kopierversuch ist ein 409 (DB-Unique als zweite Kontrolle), eine Bestätigung ohne
   Kennzeichnung ein 404.

4. **M2 (die Übernahme ALLER Fakten):** `POST …/uebernahme` kopiert LStB, Rente, Kapital und
   jedes Vermietungsobjekt — je Fakt eine Kennzeichnung (`lstb`, `rente`, `kapital`,
   `vermietung-<objektId>`); ein bereits übernommenes Jahr ist ein 409 (nie eine Halbkopie), ein
   Vorjahr ohne EINEN einzigen übernehmbaren Fakt ein 404 („Nothing to take over" — der Fakt
   zählt, nicht die Anlage). Die Cockpit-Spanne summiert ALLE unbestätigten erfassten Beträge
   (LStB-Brutto + Rente-Jahresbetrag + Kapitalerträge + je Objekt die Mieteinnahmen); ein offenes
   kopiertes Feld trägt keine Summe — offen bleibt offen, nie ein fabricated zero (ADR-032).

5. **M3 (ADR-022-UI):** die Cockpit-Appbar trägt eine prominente Jahr-Auswahl (Chips, aktuelles
   Jahr + bis 4 Rückjahre) — Screen-State, der Cockpit-Query läuft pro gewähltem Jahr (nie
   „aktuelle" Werte); der ruhige Übernahme-Hinweis erscheint im Cockpit, sobald unbestätigte
   Kennzeichnungen da sind — die Summe, die die Spanne trägt, wird ehrlich zitiert, jede Zeile
   trägt ihre Herkunft mit Jahresbezug („Lohnsteuerbescheinigung · Übernahme aus 2025",
   `uebernahmeHerkunft` aus dem Kern) und wird einzeln bestätigt (PUT bestaetigen → Refetch,
   der Hinweis verschwindet ehrlich). Die Übernahme validiert `von >= steuerjahr - 4`
   (MAX_RUECKJAHRE = 4, ein älteres Jahr ist ein 400 — nie eine stille Alt-Kopie).

6. **Rest-Grenze (ehrlich benannt):** der Jahr-Auswahl-Einstieg im ONBOARDING (die Chips leben
   bisher nur im Cockpit), die gesammelte Prüf-Screen-Sammlung, die Herkunfts-Chips in den
   Detail-Screens (LStB/Rente/Kapital/Vermietung) und die Jahresregelwerke-UI (Pauschalen/
   Freibeträge pro Jahr — das Muster liegt seit 10.7: per-Jahr-Tabellen, nie „aktuelle" Werte)
   sind benannte Follow-ups; die Kennzeichnungs-Schicht trägt ihre Schlüssel schon.

## Consequences

- **Ehrliche Grenze, einmal benannt:** unbestätigte sind weder „offene Pflichtfelder" noch
  Konflikte — ein dritter, ruhiger Zustand; der Punktwert bleibt versagt, die Spanne trägt die
  übernommene Summe als Unsicherheit (ADR-021 wortwörtlich).
- **Keine denormalisierten unbestaetigt-Spalten:** ein neues Fakten-Modell braucht keine
  Schema-Änderung — es braucht einen `postenKey` und den Service-Lesepfad.
- **Security posture:** die Kennzeichnung trägt keine Beträge/PII (nur userId + Jahre + Schlüssel),
  Klartext ist vertretbar (wie Beleg.art); die kopierten Fakten bleiben in ihren
  field-encrypted-Spalten (ADR-0008) — die Kopie bewegt verschlüsselte Feld-Strings unverändert,
  nie neu berechnet; WRITE auditiert (REQ-004).
- **Register:** REQ-028 (nächste freie Nummer nach 027).

## Alternatives considered

- **`unbestaetigt`-Spalte in jedem Fakten-Modell.** Verworfen: fünf Schema-Änderungen für einen
  Zustand, der über die Kennzeichnungs-Schicht generisch und mit Jahresbezug billiger lebt.
- **Unbestätigte wie Konflikte behandeln.** Verworfen: ADR-021 schreibt den ruhigen Ton vor; ein
  Konflikt blockiert die Einreichung hart, eine Übernahme wartet nur auf ein Antippen.
- **Die Übernahme ignoriert den offen/unklar-Zustand des Vorjahrs.** Verworfen: die kopierten
  Feld-Strings reisen UNVERÄNDERT — offen bleibt offen (kein fabricated zero, ADR-032).
