# Navigation vorher/nachher (#450 Teil 2A)

Stand: 11.11.2026. **Vorher** = Tag `baseline/pre-443` (Commit `1990ed3`, der Tunnel vor #443), **nachher** = `main` mit #443 (Hub-Cockpit, Sheets, URL je Maske). Gemessen mit `e2e/navigation-efficiency/measure.mjs` gegen beide Stände, je mit eigenem API- und Web-Build; Rohdaten in `e2e/navigation-efficiency/results/`.

## Was gemessen wird

| Aufgabe | Ablauf |
| :--- | :--- |
| Erster Durchlauf | Das Szenario-Skript der Persona aus dem jeweiligen Commit (01, 02, 04, 05, 07), von der Registrierung bis zum Ausdruck. Beide Commits haben eigene Skripte für ihre eigene Oberfläche. |
| Korrektur | Vom Cockpit aus den Hauptbetrag ändern (Bruttolohn, beim Grenzgänger der Bruttolohn im Lohnausweis, beim Rentner die Kapitalerträge) und zurück ins Cockpit. |
| Unterbrechung | In der zweiten Maske (Arbeitstage, beim Rentner Kapital) einen Wert tippen, zu Belege wechseln, zurück, die Maske abschließen. |
| Wiedereinstieg | In dieser Maske den Browser schließen, die zuletzt offene Adresse wieder öffnen, zählen bis dieselbe Maske wieder da ist. |

- **Interaktionen:** Klicks plus Tastendrücke (eine Eingabe zählt ein Zeichen je Ziffer). Öffnen der Adresse zählt nicht.
- **Bildschirme:** neu eingehängte Bildschirme und Sheets (`screen-container`). Die alte App hatte für alle Masken dieselbe URL, deshalb nicht über URLs gezählt.
- **Zeit:** Wanduhr der automatischen Ausführung, kein Menschentempo. **Langsamste Interaktion:** Event Timing des Browsers (Annäherung an INP).

## Ergebnis

| Persona | Aufgabe | Interaktionen vorher | nachher | Δ | Bildschirme vorher | nachher | Zeit vorher (s) | nachher (s) | langsamste Interaktion vorher (ms) | nachher (ms) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lena (#01) | Erster Durchlauf | 257 | 261 | +4 | 30 | 30 | 15.6 | 16.1 | 80 | 80 |
| Lena (#01) | Korrektur | 10 | 7 | -3 | 10 | 2 | 2.7 | 0.1 | 32 | 48 |
| Lena (#01) | Unterbrechung | 11 | 9 | -2 | 11 | 3 | 4.1 | 1.6 | 24 | 32 |
| Lena (#01) | Wiedereinstieg | 3 | 0 | -3 | 11 | 5 | 1.7 | 0.8 | 56 | 0 |
| Brenner CH (#02) | Erster Durchlauf | 511 | 514 | +3 | 27 | 25 | 5.6 | 6.3 | 80 | 80 |
| Brenner CH (#02) | Korrektur | 9 | 8 | -1 | 7 | 3 | 1.8 | 0.2 | 24 | 32 |
| Brenner CH (#02) | Unterbrechung | 9 | 9 | 0 | 8 | 3 | 3.2 | 1.6 | 24 | 32 |
| Brenner CH (#02) | Wiedereinstieg | 3 | 0 | -3 | 10 | 5 | 1.7 | 0.8 | 56 | 0 |
| Weber Ehepaar (#04) | Erster Durchlauf | 522 | 528 | +6 | 42 | 36 | 6.8 | 11.5 | 80 | 2296 |
| Weber Ehepaar (#04) | Korrektur | 10 | 7 | -3 | 10 | 2 | 2.7 | 0.1 | 32 | 48 |
| Weber Ehepaar (#04) | Unterbrechung | 11 | 9 | -2 | 11 | 3 | 4.1 | 1.6 | 24 | 32 |
| Weber Ehepaar (#04) | Wiedereinstieg | 3 | 0 | -3 | 11 | 5 | 1.7 | 0.8 | 56 | 0 |
| Meyer Rentner (#05) | Erster Durchlauf | 210 | 212 | +2 | 26 | 25 | 5.9 | 5.6 | 80 | 56 |
| Meyer Rentner (#05) | Korrektur | 6 | 6 | 0 | 3 | 2 | 0.9 | 0.1 | 32 | 32 |
| Meyer Rentner (#05) | Unterbrechung | 8 | 7 | -1 | 5 | 3 | 2.3 | 1.6 | 32 | 32 |
| Meyer Rentner (#05) | Wiedereinstieg | 2 | 0 | -2 | 6 | 5 | 0.8 | 0.8 | 56 | 0 |
| Richter alleinerziehend (#07) | Erster Durchlauf | 216 | 219 | +3 | 28 | 25 | 3.7 | 4.2 | 80 | 72 |
| Richter alleinerziehend (#07) | Korrektur | 10 | 7 | -3 | 10 | 2 | 2.7 | 0.1 | 32 | 32 |
| Richter alleinerziehend (#07) | Unterbrechung | 11 | 9 | -2 | 11 | 3 | 4.1 | 1.5 | 24 | 48 |
| Richter alleinerziehend (#07) | Wiedereinstieg | 3 | 0 | -3 | 11 | 5 | 1.7 | 0.7 | 48 | 0 |


## Lesart

- **Erster Durchlauf:** nachher 2 bis 6 Interaktionen mehr. Das ist der erwartete Preis für „Nächster Schritt“ statt automatischem Weiterspringen (Hinweis im Ticket).
- **Korrektur, Unterbrechung, Wiedereinstieg:** nachher weniger Interaktionen und deutlich weniger Bildschirme. Beim Wiedereinstieg landet der Deep-Link direkt in der Maske (0 Interaktionen statt 2 bis 3).
- **Rentner (#05):** Die Kapital-Maske war schon vorher direkt aus dem Cockpit erreichbar, deshalb kaum Unterschied bei der Korrektur.
- **Grenzen:** Gleiches Gerät, lokaler Stack, eine Messung je Zelle. Zeiten schwanken, deshalb sind nur die Interaktionen ein Gate.

## Budgets (D5)

`e2e/navigation-efficiency/budgets.json` = gemessene Interaktionen nachher + 10 %, aufgerundet. Der Schritt „Navigation efficiency budgets“ im Job „Browser gates“ misst den neuen Stand bei jedem PR und bricht, wenn eine Persona-Aufgabe ihr Budget überschreitet. Nach einer gewollten Änderung: `node e2e/navigation-efficiency/measure.mjs --update-budgets` und die Begründung in den PR.

## Vorher-Stand neu messen

```bash
git worktree add ../steuereule-alt baseline/pre-443
# dort: pnpm install, eigene DB migrieren, API bauen und starten, Web exportieren und ausliefern (andere Ports)
NAV_VARIANT=baseline NAV_ROOT=../steuereule-alt API_ORIGIN=… WEB_ORIGIN=… DATABASE_URL=… node e2e/navigation-efficiency/measure.mjs
node e2e/navigation-efficiency/compare.mjs /tmp/navigation-efficiency/baseline.json /tmp/navigation-efficiency/neu.json
```
