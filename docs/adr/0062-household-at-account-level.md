# ADR-0062 — Haushalt auf Kontoebene: Ehepartner und Kinder einmal anlegen, pro Jahr auswählen

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/household/`, `apps/api/prisma/schema.prisma`, `packages/core/src/common/household.ts`, Kinder-Maske, Stammdaten (Kopplung)
- **Ersetzt Teile von:** Produkt-ADR-006 (Kopplung je Steuerjahr) und ADR-0054 §3 (Einladungscode je Jahr)
- **Ticket:** #452 (Grilling 10.11.2026, Entscheidungen 1–12)

## Kontext

Ehepartner und Kinder werden heute pro Steuerjahr neu angelegt: `Kind` hängt an `userId` + `steuerjahr`,
die Kopplung (`SteuerjahrKopplung`) gilt für ein Jahr, ein Partner ohne Konto bekommt je Jahr einen neuen
Platzhalter `spouse_<user>_<jahr>`, und mit Konto braucht jedes Jahr einen neuen Einladungscode. Wer
jedes Jahr wiederkommt, tippt Name, Geburtsdatum und Steuer-ID erneut.

Die Steuerberechnung, der Ausdruck und der Veranlagungsartenvergleich lesen genau diese Jahreszeilen.
Ihre Ergebnisse dürfen sich durch die Umstellung nicht ändern (AC 10, alle 24 Szenarien).

## Entscheidung

### 1. Erweitern, nicht umbauen (ADR-0055, Expand)

Die Jahreszeilen bleiben, was die Berechnung liest: `Kind` (alle Felder der Anlage Kind) und
`SteuerjahrKopplung` (Veranlagungsart und Person B des Jahres). Daneben kommt der **Haushalt** als
Quelle für jedes neue Jahr. Keine Berechnung liest den Haushalt; deshalb sind die Ergebnisse vor und
nach der Migration identisch.

### 2. Neue Modelle

| Modell | Inhalt |
| :--- | :--- |
| `HouseholdPerson` (`HaushaltPerson`) | Ehepartner oder Kind, einmal je Haushalt. Stabile Angaben (Vorname, Nachname, Geburtsdatum, Steuer-ID, bei Ehepartnern das Sterbedatum) liegen in einem Umschlag, verschlüsselt mit einem **eigenen Schlüssel je Person** im Keystore (ADR-0059, Schlüssel-ID `household-person:<id>`). `leftFromYear` = „ab Jahr X nicht mehr dabei“. Bearbeiter und Zeitpunkt der letzten Änderung. |
| `TaxYearMembership` (`HaushaltJahr`) | Person × Steuerjahr, mit Verweis auf die Jahreszeile (`Kind.id` bzw. Person B der Kopplung). Die jährlichen Angaben (Kindergeld, gemeldet bei mir, KV/PV, Ausbildung ab 18, Veranlagungsart) bleiben in der Jahreszeile. |
| `PartnerLink` (`PartnerVerknuepfung`) | Ehepartner-Verknüpfung **ohne Jahr**: Person A, Person B (eigenes Konto oder Haushaltsperson ohne Konto), `validFromYear`, `endedFromYear`. |
| `HouseholdMergeCandidate` (`HaushaltDublette`) | Zwei Personen, die ähnlich, aber nicht gleich sind; die App fragt einmal „Sind das dieselben?“. |

Der Haushalt gehört dem Konto von Person A. Ein verknüpfter Partner mit eigenem Konto liest und
schreibt die gemeinsamen Kinder mit (Entscheidung 7); eigene Daten (Lohn, Steuer-ID, Stammdaten)
bearbeitet jeder nur selbst. Jede Änderung an einer Haushaltsperson protokolliert Bearbeiter und
Zeitpunkt; die Maske zeigt „geändert von …, Datum“.

### 3. Ehepartner

- Einmal angelegt bzw. einmal über den Einladungscode verknüpft, gilt die Verknüpfung ab
  `validFromYear` für alle folgenden Jahre, bis einer sie mit „ab Jahr X nicht mehr dabei“ beendet
  (AC 2). Kein Einladungscode mehr pro Jahr.
- **Wechsel der Veranlagungsart** (zusammen ↔ einzeln, Entscheidung des Product Owners vom
  10.11.2026): Die Verknüpfung bleibt bestehen. Die Veranlagungsart bleibt eine Angabe pro Jahr in
  `SteuerjahrKopplung`.
- Wählt Person A in einem neuen Jahr „zusammen“, wird die Jahreszeile aus der Verknüpfung befüllt:
  mit eigenem Konto direkt Person B, ohne Konto der Platzhalter des Jahres, vorbelegt aus der
  Haushaltsperson.
- Ein verstorbener Ehegatte bleibt im Folgejahr auswählbar (Gnadensplitting, § 32a Abs. 6 Nr. 1 EStG).

### 4. Neues Steuerjahr

Personen mit einer Zugehörigkeit im Vorjahr sind **vorausgewählt** und als „aus 2025“ gekennzeichnet;
ein Klick bestätigt und legt die Jahreszeile mit den stabilen Angaben an. Kinder, die im neuen Jahr
älter als 25 sind, sind nicht vorausgewählt, bleiben aber auswählbar. Ab 18 fragt die Maske nach der
Ausbildung; die Antwort wird gespeichert, verändert die Berechnung aber in dieser Umstellung nicht
(AC 10) und ist als solche gekennzeichnet.

### 5. Migration (wiederholbar, verliert nichts)

Die stabilen Felder sind feldverschlüsselt; eine SQL-Migration kann sie nicht lesen. Deshalb
migriert die API **beim ersten Zugriff auf den Haushalt**, je Konto, idempotent:

1. Alle `Kind`-Zeilen und Partner-Platzhalter des Kontos werden nach normalisiertem Namen
   (Groß/Klein, Umlaute, Leerraum) **und** Geburtsdatum gruppiert. Gleich → eine Person, jede
   Jahreszeile bekommt eine Zugehörigkeit.
2. Ähnlich, aber nicht gleich (Abstand im Namen ≤ 2 bei gleichem Geburtsdatum, oder gleicher Name
   bei einem Tag/Monat Abstand im Geburtsdatum) → zwei Personen und **ein** Kandidat.
3. Schon zugeordnete Jahreszeilen werden übersprungen. Keine Jahreszeile wird geändert oder gelöscht.

Die Gruppierung ist eine reine Funktion in `packages/core` und unit-getestet.

### 6. Entfernen

- „Ab Jahr X nicht mehr dabei“ setzt `leftFromYear`; frühere Jahre bleiben unverändert (AC 5).
- „Endgültig löschen“ löscht die Jahreszeilen der Person in allen Jahren, ihre Zugehörigkeiten und
  ihren Schlüssel im Keystore (Crypto-Shredding, ADR-0059). Die Maske warnt deutlich, dass auch
  abgeschlossene Jahre betroffen sind.

### 7. Was nicht kommt

- **Familienkasse aus der Kindergeldnummer (Entscheidung 9):** Das Format ist amtlich belegt
  (11 Zeichen, `xxxFKxxxxxx`, Merkblatt Kindergeld KG 2 der BA, abgerufen am 10.11.2026). Dass die
  ersten drei Ziffern die Familienkasse angeben, steht in keiner amtlichen Quelle, und es gibt keine
  amtliche Zuordnungsliste. Nach der Vorgabe des Product Owners entfällt dieser Helfer.

## Konsequenzen

- Kontolöschung, DSGVO-Export und die Liste der verschlüsselten Felder decken die neuen Modelle ab.
- Ein späterer Contract-Schritt (ADR-0055) kann die stabilen Felder aus `Kind` entfernen, sobald alle
  Konten migriert sind und die Berechnung sie aus dem Haushalt liest. Das ist nicht Teil von #452.
- Die Regression über alle 24 Szenarien ist das Abnahme-Gate: gleiche Spanne vor und nach der
  Migration.
