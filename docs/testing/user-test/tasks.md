# Aufgaben

Dieselben vier Aufgaben wie in der automatischen Messung (#450 Teil 2A). Jede Aufgabe steht auf einer eigenen Karte, die die Person erst bekommt, wenn die vorige erledigt oder abgebrochen ist. Die Moderation liest die Karte vor und startet die Stoppuhr, wenn die Person die Maus berührt.

**Zeitlimit je Aufgabe:** 8 Minuten. Danach gilt die Aufgabe als nicht geschafft.

## Testperson „Lena Probe“ (synthetisch)

| Angabe | Wert |
| :--- | :--- |
| Steuerjahr | 2025 |
| Beruf | angestellt, ledig, keine Kinder, wohnt in Deutschland |
| Lohnsteuerbescheinigung | Bruttoarbeitslohn 45.000 €, Lohnsteuer 6.100 €, Sozialversicherung 9.200 € |
| Arbeitsweg | 18 km einfach, Auto, 5 Tage pro Woche, 30 Urlaubstage, 5 Krankheitstage |
| Spenden | 150 € |

Diese Werte liegen ausgedruckt als „Lohnsteuerbescheinigung“ auf dem Tisch (Vorlage: `e2e/fixtures/synthetic-documents.mjs`, `syntheticLstbLines`).

---

## Aufgabe 1 — Erster Durchlauf

> „Sie wollen Ihre Steuererklärung für 2025 vorbereiten. Beantworten Sie die Einstiegsfragen, tragen Sie Ihre Lohnsteuerbescheinigung und Ihren Arbeitsweg ein und gehen Sie so weit, bis die App Ihnen sagt, dass Sie die Abgabe vorbereiten können.“

- **Start:** angemeldet, leeres Cockpit 2025.
- **Erfolg:** Die Seite „Abgabe vorbereiten“ ist erreicht, die Erstattungsspanne wird angezeigt.
- **Fehler zählen:** falscher Betrag gespeichert, falsche Antwort im Interview, Hilfe der Moderation nötig.

## Aufgabe 2 — Korrektur

> „Ihnen fällt auf, dass auf der Lohnsteuerbescheinigung eigentlich 46.200 € Bruttoarbeitslohn stehen. Korrigieren Sie den Wert.“

- **Start:** Ende von Aufgabe 1.
- **Erfolg:** Bruttoarbeitslohn ist 46.200 €, alle übrigen Werte sind unverändert.
- **Fehler zählen:** anderer Wert verändert, Interview neu begonnen, Wert nicht gespeichert.

## Aufgabe 3 — Unterbrechung

> „Sie tragen gerade Ihre Spenden ein, da fällt Ihnen ein, dass Sie den Spendenbeleg erst suchen müssen. Schauen Sie nach, wo Sie in der App Belege ablegen können, und kehren Sie dann zu den Spenden zurück. Tragen Sie 150 € ein.“

- **Start:** Die Moderation öffnet die Spenden-Frage.
- **Erfolg:** Belege-Bereich wurde geöffnet, danach sind 150 € Spenden gespeichert.
- **Fehler zählen:** Eingabe verloren, Rückweg nicht gefunden, Spenden doppelt oder gar nicht gespeichert.

## Aufgabe 4 — Wiedereinstieg

> „Machen Sie eine Pause: Schließen Sie das Browserfenster. Öffnen Sie die App danach wieder und machen Sie dort weiter, wo Sie aufgehört haben.“

- **Start:** Die Moderation öffnet mitten in der Arbeitsweg-Maske, nachdem die Person die Kilometer geändert, aber nicht weitergeklickt hat.
- **Erfolg:** Die Person landet ohne Umweg wieder beim offenen Schritt; die vorher gespeicherten Angaben sind da.
- **Fehler zählen:** Angaben fehlen, Person beginnt von vorn, braucht Hilfe.

---

## Was je Aufgabe notiert wird

| Messgröße | Wie |
| :--- | :--- |
| Zeit | Stoppuhr, Sekunden, vom Start bis zum Erfolg oder Abbruch |
| Erfolg | ja / mit Hilfe / nein |
| Fehler | Anzahl, mit Stichwort |
| Stockstellen | Bildschirm und Sekunde, an der die Person länger als 10 Sekunden nicht weiterweiß |
| Zitate | wörtlich, kurz („Wo war das nochmal?“) |
