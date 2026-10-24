# 10.8 — Jahresübernahme (Produkt-ADR-021) + rückwirkende Jahre (Produkt-ADR-022)

**What to build:** Ein neues Steuerjahr **kopiert alles** aus dem Vorjahr — aber jeder kopierte
Posten trägt Herkunft „Übernahme aus {Vorjahr}" und gilt als **unbestätigt**, bis er angetippt
oder durch einen Beleg gedeckt wird (ADR-021). Zusätzlich werden **bis zu 4 Rückjahre** unterstützt
und aktiv beworben („Hol dir 4 Jahre auf einmal"); Jahresregelwerke (Pauschalen, Freibeträge) sind
Backend-Konfiguration pro Jahr, die UI zeigt immer die Regeln des gewählten Jahres (ADR-022).

**Blocked by:** **15** (Posten-Kern für den `unbestätigt`-Zustand + Kern-Regelwerke) ·
Engineering-Entwurf 0037 (Steuerjahr-/Jahr-Modell), promotet. Kein Dep auf 10.1.

**Status:** ready-for-agent

- [ ] Neues Jahr = Kopie des Vorjahrs, jeder Posten mit `unbestätigt`-Herkunft (grau, ruhiger Ton)
- [ ] Unbestätigte Posten zählen in die Spanne, nicht in den Punktwert; Prüf-Screen sammelt sie
- [ ] Bis 4 Rückjahre; Jahr-Auswahl prominenter Einstieg (Onboarding + Cockpit)
- [ ] Jahresregelwerke pro Jahr: UI zeigt Regeln des gewählten Jahres, nie „aktuelle" Werte (ADR-022)
- [ ] Herkunfts-Chips mit Jahresbezug („Pauschale 2023: 1.230 €")
- [ ] TDD, typecheck + lint grün, Posture-Zeile
