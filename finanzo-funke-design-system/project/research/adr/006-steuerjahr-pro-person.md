# ADR-006 — Steuerjahr gehört der Person, Kopplung bei Zusammenveranlagung

**Status:** Akzeptiert (Grilling R1) · 2026-07-22

**Kontext:** Zusammenveranlagung erzeugt EINE Erklärung für zwei Personen. Haushalt-Modell macht Einzelfälle (Trennung, Wechsel der Veranlagungsart) zum Migrationsproblem.

**Entscheidung:** Jede Person besitzt ihre eigenen Steuerjahre. Bei Zusammenveranlagung werden zwei Steuerjahre desselben Kalenderjahres **gekoppelt**; die Kopplung erzeugt eine gemeinsame Fassung, Belege und Posten bleiben personengebunden.

**Konsequenzen:** Entkopplung (Trennung, Wechsel zu Einzelveranlagung) löst nur die Kopplung, zerstört keine Daten. UI braucht einen sichtbaren Kopplungszustand („Gemeinsam mit Alex") und einen Partner-Einladungs-Flow.
