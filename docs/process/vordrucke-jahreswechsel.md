# Vordrucke: neues Steuerjahr und geänderte Vorlagen

Der Formular-Ausdruck (ADR-0050) schreibt auf die amtlichen PDF-Vordrucke. Die Positionen werden nie
von Hand eingetragen: `felder-<jahr>.spec.json` beschreibt jedes Feld über einen Anker auf dem Vordruck
(Kennzahl, Zeilennummer, Beschriftung), `scripts/vordrucke/vermessen.mjs` findet daraus den Kasten.
Was ein Anker *bedeutet*, prüft das Skript nicht — dafür gibt es den Lagebericht.

## Ablauf (jedes Jahr, und wann immer eine Vorlage ausgetauscht wird)

Voraussetzung: poppler (`pdftotext`, `pdftocairo`), z. B. `brew install poppler`.

1. **Vorlagen einchecken** — die NET-Vordrucke des Jahres von formulare-bfinv.de nach
   `apps/api/assets/vordrucke/<jahr>/`, Dateinamen wie im Vorjahr; `vordrucke-<jahr>.json` mit den
   Formularschlüsseln ergänzen.
2. **Spec übernehmen** — `felder-<vorjahr>.spec.json` nach `felder-<jahr>.spec.json` kopieren, dann
   `node scripts/vordrucke/zeilen-abgleich.mjs <vorjahr> <jahr>`: Es sucht für jedes Feld die Zeile des
   neuen Vordrucks mit demselben Text und schreibt Zeile (und Seite) um. Wichtig, weil eine Zeilennummer
   in beiden Jahren existieren kann und dann still in der falschen Zeile landet. Was es mit „prüfen“
   meldet (gleich lautende Zeilen, leere Zeilen), im Vordruck nachsehen. Einmal ausführen, nicht zweimal.
3. **Vermessen** — `node scripts/vordrucke/vermessen.mjs <jahr> --alle` listet jedes Feld, das sich
   nicht vermessen lässt; danach `node scripts/vordrucke/vermessen.mjs <jahr>`. Hat sich eine
   Zeilennummer, Kennzahl oder Beschriftung geändert: im neuen Vordruck nachsehen und den Anker in der
   Spec anpassen, nie Koordinaten eintragen. Hat der Vordruck eines Jahres ein Feld nicht (2024: kein
   Beruf in der Anlage N-Gre), das Feld aus der Spec nehmen und in `NOT_ON_FORM` (form-renderer.ts)
   eintragen.
4. **Lagebericht erzeugen und lesen** — `node scripts/vordrucke/lagebericht.mjs <jahr>` und
   `felder-<jahr>.lage.txt` gegen den Bericht des Vorjahres lesen: Steht jedes Feld in der Zeile,
   neben der Beschriftung und unter der Spalte, die sein Name verspricht? Ein Betrag neben
   „Bezeichnung …“, ein EUR-Feld unter „CHF“ oder eine Kennzahl einer Nachbarzeile ist ein Fehler.
5. **Ⓔ-Zeilen prüfen** — Zeilen mit dem ⓔ-Symbol meldet der Arbeitgeber bzw. Rentenversicherer
   elektronisch; ein Eintrag dort übersteuert die Meldung. Neue ⓔ-Kennzeichnungen gegenüber dem
   Vorjahr mit der Zuordnung in `ausdruck-werte.ts` abgleichen.
6. **Probeausdruck ansehen** — die Tests „renders every field the mapping writes“ rendern alle
   Faktenarten; einmal einen echten Probeausdruck erzeugen und Seite für Seite ansehen.
7. **Jahreswerte** — Freibeträge, Kindergeld, AfA-Sätze und die Sätze der Anlage N-Gre (AHV/IV, EO,
   ALV und deren Höchstbetrag) stehen im Core bzw. auf dem Vordruck; mit dem neuen Jahr abgleichen.

CI (`.github/workflows/ci.yml`, Job „Vordrucke“) führt Schritt 3 und 4 mit `--check` aus: Er wird rot,
wenn `felder-<jahr>.json` nicht mehr dem entspricht, was Vorlagen und Spec ergeben (auch bei einer
ausgetauschten Vorlage, über deren Prüfsumme), oder wenn sich der Lagebericht ändert. Ein roter
Lagebericht ist kein Fehler an sich, sondern die Aufforderung, Schritt 4 für die geänderten Zeilen zu
machen und den neuen Bericht mit einzuchecken.
