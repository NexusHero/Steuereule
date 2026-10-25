# 10.8 — Jahresübernahme (Produkt-ADR-021) + rückwirkende Jahre (Produkt-ADR-022)

**What to build:** Ein neues Steuerjahr **kopiert alles** aus dem Vorjahr — aber jeder kopierte
Posten trägt Herkunft „Übernahme aus {Vorjahr}" und gilt als **unbestätigt**, bis er angetippt
oder durch einen Beleg gedeckt wird (ADR-021). Zusätzlich werden **bis zu 4 Rückjahre** unterstützt
und aktiv beworben („Hol dir 4 Jahre auf einmal"); Jahresregelwerke (Pauschalen, Freibeträge) sind
Backend-Konfiguration pro Jahr, die UI zeigt immer die Regeln des gewählten Jahres (ADR-022).

**Blocked by:** **15** (Posten-Kern für den `unbestätigt`-Zustand + Kern-Regelwerke) ·
Engineering-Entwurf 0037 (Steuerjahr-/Jahr-Modell), promotet. Kein Dep auf 10.1.

**Status:** in-progress — **M1+M2 fertig** (Kern + Kennzeichnungs-Schicht + ALLE Fakten + Cockpit-Summen); ADR-022-UI-Follow-ups benannt

- [x] **M1:** Neues Jahr = Kopie des Vorjahrs, jeder Posten mit `unbestätigt`-Herkunft (grau, ruhiger Ton)
      — Kern: `Quelle.uebernahme {vorjahr}` + `Posten.unbestaetigt` (berechnung.ts), Kopier-/Bestätigungs-Vertrag
      `uebernommenerPosten`/`bestaetigePosten`/`uebernahmeHerkunft` (uebernahme.ts, pur, ADR-0004); API: generische
      Kennzeichnungs-Schicht `UebernahmeKennzeichnung` (Migration 20261025130000) + `POST /v1/steuerjahre/{jahr}/uebernahme?von=`
      kopiert die **LStB-Zeile** unverändert (Tracer-Bullet, 409 bei Doppelkopie, 404 ohne Vorjahr, 400 bei ungültigem `von`)
      + `PUT .../uebernahme/{postenKey}/bestaetigen` + GET-Status. REQ-028, ADR-0049.
- [x] **M1:** Unbestätigte Posten zählen in die Spanne, nicht in den Punktwert —
      `berechne` versagt den Punktwert und benennt `unbestaetigte`/`unbestaetigteSumme` ruhig (nie Konflikt, ADR-008);
      `cockpitSpanne` trägt die Summe als Unsicherheit; CockpitService integriert die Kennzeichnung. **Prüf-Screen-Sammlung = Follow-up.**
- [ ] Bis 4 Rückjahre; Jahr-Auswahl prominenter Einstieg (Onboarding + Cockpit) — **Follow-up (ADR-022-UI)**
- [ ] Jahresregelwerke pro Jahr: UI zeigt Regeln des gewählten Jahres, nie „aktuelle" Werte (ADR-022) —
      **Follow-up** (der Fristen-Baustein 10.7 setzt das Muster: per-Jahr-Tabellen, nie "aktuelle" Werte)
- [ ] Herkunfts-Chips mit Jahresbezug („Pauschale 2023: 1.230 €") — **Follow-up** (`uebernahmeHerkunft(vorjahr)` im Kern liegt bereit)
- [x] **M2:** Rente/Kapital/Vermietung in die Übernahme aufnehmen — `POST …/uebernahme` kopiert ALLE Fakten
      (LStB + Rente + Kapital + jedes Vermietungsobjekt, je eine Kennzeichnung `lstb`/`rente`/`kapital`/
      `vermietung-<id>`); 409 bei bereits übernommenem Jahr, 404 nur wenn das Vorjahr GAR NICHTS Übernehmbares
      hat („der Fakt zählt, nicht die Anlage"); Cockpit-Spanne summiert ALLE unbestätigten erfassten Beträge.
      **Follow-up:** Cockpit-Hinweis („X € aus dem Vorjahr"), Prüf-Screen-Sammlung.
- [x] TDD, typecheck + lint grün, Posture-Zeile — Kern 477 Tests, API 436, mobile-web 462, alle Gates grün (lokal; CI im PR)
