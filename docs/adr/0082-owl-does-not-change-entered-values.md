# ADR-0082 — Die Eule ändert erfasste Werte nur auf Wunsch

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/advisor-overwrite-guard.ts`, `apps/api/src/advisor/advisor.service.ts`
- **Baut auf:** ADR-0066 (Feldkatalog), ADR-0073 (Person B)

## Kontext

Im Echtfall 2025 antwortete der Nutzer auf eine Rückfrage nur, dass die Partnerin selbst nichts zum
Krankentaggeld zahlt. Die Eule legte daraufhin für alle Prämienfelder der Partnerin neue Entwürfe an. Einer
setzte die NBU-Prämie, gelesen aus der Bestätigung des Arbeitgebers, auf das Zehnfache. Wer die Entwürfe
übernimmt, ohne jeden zu lesen, verliert so einen richtigen Wert.

## Entscheidung

1. **Leere Felder darf die Eule füllen**, auch Felder, die noch auf 0 stehen. Das ist der Zustand einer
   unberührten Maske.
2. **Ein erfasster Wert ändert sich nur auf Wunsch.** Ein Entwurf für ein Feld mit anderem Wert bleibt nur
   stehen, wenn die Nachricht des Nutzers den neuen Wert nennt (in jeder üblichen Schreibweise: „5.120“,
   „5’120,00“) oder um eine Änderung bittet („ändern“, „korrigieren“, „falsch“, „statt“ …).
3. **Ein Entwurf, der den vorhandenen Wert noch einmal schreibt, entfällt.**
4. **Die Antwort sagt, was unverändert blieb:** welches Feld, der erfasste Wert und was die Eule vorgeschlagen
   hätte. Ein Satz lädt den Nutzer ein, den richtigen Wert zu nennen.
5. Die Regel gilt für die Entwürfe des Modells, sowohl für die Live-Anzeige als auch für die gespeicherte
   Antwort. Entwürfe aus Belegen und Unterlagen bleiben ausgenommen, denn dort ist das Dokument der Wunsch. Für
   die festen Regeln ohne Modell gilt sie ebenfalls nicht, weil sie ihre Werte aus der Nachricht selbst lesen.

## Folgen

- Echtfall 2025: Die NBU-Prämie bliebe beim gelesenen Wert. Die Eule hätte ihren abweichenden Vorschlag genannt,
  statt ihn still vorzubereiten.
- Ein Wert, den die Eule aus Angaben ableitet (z. B. gefahrene Tage in Urlaubstage umgerechnet), geht nur in
  ein leeres oder auf 0 stehendes Feld. Will der Nutzer einen erfassten Wert so ändern, sagt er es.
