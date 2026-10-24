# 10.3 — Bescheidprüfung 1.0 (M7): PDF + manuell, Abgleich, Korrektur/Einspruch

**What to build:** Der Bescheid (Steuerbescheid) kommt als PDF in die Inbox und/oder wird manuell
eingetippt; seine Beträge werden gegen die berechneten Beträge abgeglichen. Die Zustandsmaschine
verzweigt am Punkt „Bescheid eingegangen" (Produkt-ADR-009): **vor** dem Bescheid „Korrigieren"
(Fassung n+1 als Kopie der eingereichten Fassung, Diff markiert), **nach** dem Bescheid ein eigener
**Einspruch-Flow** mit Fristen-Countdown, Grund-Auswahl und Diff der strittigen Posten — und
kein „Korrigieren"-Button mehr (das Wort wäre eine falsche Zusage, ADR-032).

**Blocked by:** **10.1** (Beleg-Inbox für das Bescheid-PDF) · **15** (Posten-Kern für den
Abgleich Bescheid vs. berechnet) · Engineering-Entwurf 0039 (Zustandsmaschine mit
`bescheid`-Zustand, promotet).

**Status:** ready-for-agent

- [ ] Bescheid-PDF importierbar (Inbox-Dokumenttyp), manuelle Betrag-Eingabe als Fallback (ADR-036)
- [ ] Abgleich: Bescheid-Beträge vs. `berechne`, Abweichungen als Diff sichtbar, nie still
- [ ] Vor Bescheid: „Korrigieren" = Kopie der *eingereichten* Fassung (nicht Arbeitsstand), Fassung n
      unveränderlich sichtbar, Abweichungen als Diff
- [ ] Nach Bescheid: Einspruch-Flow mit Fristen-Countdown ab Bescheiddatum, Grund-Auswahl, Diff nur
      der strittigen Posten; kein „Korrigieren"-Button
- [ ] Zustandsmaschine: `bescheid`-Zustand erreichbar + Übergänge server-validiert (Entwurf 0039)
- [ ] TDD, typecheck + lint grün, Posture-Zeile (Bescheid = Steuerdaten)
