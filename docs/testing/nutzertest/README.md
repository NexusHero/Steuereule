# Nutzertest Navigation alt ↔ neu (#450 Teil 2B, D12)

Ziel: Herausfinden, ob die neue Navigation (#443, Hub-Cockpit) Menschen tatsächlich schneller und sicherer durch die Erklärung bringt als der alte Tunnel. Die automatische Messung (Teil 2A) zählt Klicks; dieser Test misst Zeit, Fehler und Stellen, an denen jemand nicht weiterweiß.

| Datei | Wofür |
| :--- | :--- |
| [protokoll.md](protokoll.md) | Ablauf je Sitzung, Rolle der Moderation, Vorlage für die Notizen |
| [aufgaben.md](aufgaben.md) | Die vier Aufgaben mit Testdaten und Erfolgskriterium |
| [sus-fragebogen.md](sus-fragebogen.md) | System Usability Scale (10 Fragen) mit Auswertung |
| [auswertung.md](auswertung.md) | Tabelle für die Ergebnisse und den Bericht |

## Aufbau

- **10 Personen**, 5 je Variante (**between-subjects**: jede Person sieht nur eine Variante, damit sie nicht aus der ersten lernt).
  - **Alt:** Tag `baseline/pre-443` (Commit `1990ed3`), der Stand vor #443.
  - **Neu:** aktueller `main`.
- Gleiche Aufgaben, gleiche Testdaten, gleiche Reihenfolge, gleiches Gerät (Laptop, Chrome, 1280 px).
- Dauer je Sitzung etwa 40 Minuten: 5 Begrüßung, 25 Aufgaben, 5 SUS, 5 Nachgespräch.
- Rekrutierung durch den Product Owner. Mischung je Variante möglichst gleich: mindestens 2 Personen, die ihre Erklärung bisher selbst machen, mindestens 1 Person über 55, höchstens 1 Person aus dem Team oder mit Kenntnis der App.

## Datenschutz

- Nur **synthetische Testdaten** aus [aufgaben.md](aufgaben.md). Die Personen tragen nie eigene Daten ein.
- Testkonten werden vorher angelegt und danach gelöscht.
- Keine Bild- oder Tonaufnahme ohne schriftliche Einwilligung. Ohne Einwilligung: nur Notizen und Stoppuhr.
- In den Ergebnissen stehen Kürzel (A1–A5, N1–N5), keine Namen.

## Vorbereitung (je Variante einmal)

1. Stack starten (siehe `e2e/harness/README.md`), für **Alt** vorher `git worktree add ../steuereule-alt baseline/pre-443`.
2. Je Person ein frisches, bestätigtes Konto anlegen (E-Mail `nutzertest-<kürzel>@beispiel.de`), noch ohne Angaben.
3. Browser: neues Profil, kein Autofill, Zoom 100 %, Fenster 1280 × 800.
4. Stoppuhr, ausgedruckte Aufgabenkarten, ausgedruckter SUS-Bogen, Notizvorlage aus [protokoll.md](protokoll.md).
