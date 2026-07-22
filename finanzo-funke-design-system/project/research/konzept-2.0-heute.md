# SteuerEule 2.0 — Konzept „Heute": adaptive Navigation
Stand 07/2026 · Status: **Konzept für später — nicht bauen, bevor 1.0-Nutzungsdaten vorliegen.**
Kontext: 1.0 fährt das 5-Tab-Modell (Übersicht · Belege · Berater · Jahr · Profil) mit Phasen-Stepper
im Jahr-Tab. Dieses Dokument beschreibt die nächste Ausbaustufe und die Bedingungen, unter denen
sie gebaut werden darf.

## 1. Die These
Eine Steuer-App hat zu jedem Zeitpunkt genau **eine** wichtigste Handlung pro Nutzer. Die App weiß
Phase (Interview → Sammeln → Übertragen → Warten → Bescheid), Persona (GG ja/nein, Kinder, KAP/V)
und Saison. 2.0 wendet unsere Regel „genau eine Primäraktion pro Screen" auf die Navigationsebene an:
**3 Tabs — Heute · Jahr · Profil.** „Heute" zeigt die eine Primäraktion der aktuellen Situation;
Belege und Berater sind keine Orte mehr, sondern Werkzeuge, die im Kontext aufgehen.

## 2. Warum nicht in 1.0 (Entscheidung vom 16.07.2026)
1. **Keine Daten, acht Zustände zu raten** — adaptive Navigation, die falsch rät, ist schlechter als statische.
2. **Jahr-Tab liefert ~70 % des Nutzens** (Phase hat festen Ort, keine toten Tabs, GG-Chip personalisiert).
3. **Vertrauen schlägt Eleganz**: Zielgruppe ausdrücklich auch ältere Nutzer; bei Geld + Behörde ist
   Vorhersagbarkeit ein Feature. Orte werden gelernt, Zustände nicht.
4. **Doppelte Umbaukosten**: Deep-Links, Instruction, Verifier-Stand hängen am 5-Tab-Modell.

## 3. Zielbild im Detail

### 3.1 Tab-Struktur
- **Heute** — der adaptive Startscreen (ersetzt Übersicht als Default-Tab).
- **Jahr** — unverändert aus 1.0: Phasen-Stepper, Übertragen/Abgabe/Bescheid, Statistik, Alle Jahre.
  Kollabiert nach Abgabe auf versiegelte Karte + „2027 vormerken".
- **Profil** — unverändert schlank (Konto, Einstellungen, Daten, Rechtliches).
- **Belege**: kein Tab mehr. Erreichbar aus „Heute"-Karten („3 Belege prüfen"), aus dem Scan-FAB
  und aus jeder Zeile in Übertragen (Herkunft → Beleg öffnen).
- **Berater**: kein Tab mehr. Fixe Feder-Taste (FAB, Eulen-Glyphe) über allen Screens rechts unten,
  über dem GG-Chip. Öffnet als Sheet, nimmt Kontext automatisch mit: aktueller Screen, aktuelle
  Zeile/Beleg als vorbefüllter Chip („Frage zu: Zeile 44"). Violett bleibt exklusiv KI.

### 3.2 „Heute" — Anatomie
Von oben nach unten, maximal 4 Blöcke, nie scrollende Endlosliste:
1. **Kopf**: Begrüßung + Erstattungs-Held (aus Cockpit übernommen, kleiner), Herkunfts-Chip Pflicht.
2. **Die eine Primäraktion** — eine `.held`-Karte, einzige Kontur+Schatten-Karte des Screens.
   Auswahl per Prioritätenliste (3.3). Genau ein Button.
3. **Nebenbei erledigt** — max. 2 leise Karten (Hinweise mit Umsetzen/Verwerfen, wie Cockpit heute).
4. **Kontext-Zeile** — Frist-Countdown ODER GG-Stand ODER „Warten aufs Amt, Woche 3 von 4–8".
   Genau eine, nach Priorität.

### 3.3 Zustandskatalog (jeder Zustand = eigenes Design, vor Bau alle 10 designen)
| # | Situation | Primäraktion | Kontext-Zeile |
|---|-----------|--------------|---------------|
| Z1 | Neues Jahr, Interview offen | „5 Minuten: dein Steuerjahr starten" | Frist fern → keine |
| Z2 | Interview fertig, < 3 Belege | „Ersten Beleg scannen" | Schätzung |
| Z3 | Sammelphase, Review-Queue > 0 | „3 Belege prüfen" | Fund-Zähler |
| Z4 | Lücken-Liste < 3 offen | „Noch 2 Punkte bis zur Abgabe" | Frist |
| Z5 | Alles bestätigt, nicht abgeschickt | „Übertragen & abschicken" | Frist |
| Z6 | Abgeschickt, wartend | „Nichts zu tun — das Amt prüft" (ehrlich leer!) | Woche X von 4–8 |
| Z7 | Bescheid eingetroffen | „Bescheid vergleichen" | Einspruchsfrist 1 Monat |
| Z8 | GG: Reise erkannt/Monatsende | „Nichtrückkehrtage pflegen" | XX/60, ab 55 warn |
| Z9 | Frist < 60 Tage, unfertig | Warnmodus (25 €/Monat) | Countdown rot |
| Z10 | Gewerbe-Vorbereiten-Modus | „Angestellten-Teil vervollständigen" | „Abgabe wartet aufs Gewerbe" |
Priorität bei Konflikt: Z9 > Z7 > Z8 > Z5 > Z4 > Z3 > Z10 > Z2 > Z1 > Z6.
**Regel: „Heute" darf ehrlich leer sein (Z6).** Kein Füllcontent, keine erfundenen Aufgaben.

### 3.4 Was NICHT adaptiv wird
- Die Tab-Bar selbst: immer exakt 3 Tabs, nie ein-/ausblendend.
- Jahr- und Profil-Inhalte: feste Orte, gelernte Struktur.
- Sicherheits-/Geldaktionen (Abgabe, Löschen): nie nur über „Heute" erreichbar, immer auch am festen Ort.

## 4. Bau-Bedingungen (Gates — alle drei müssen erfüllt sein)
1. **Daten**: ≥ 3 Monate 1.0-Telemetrie. Kernmetriken: Tab-Wechsel-Pfade, Zeit bis Primäraktion,
   Anteil Sitzungen mit „verlaufen"-Muster (3+ Tab-Wechsel ohne Aktion).
2. **Beleg der These**: 5-Tab-Modell zeigt messbar Reibung (z. B. > 25 % der Sitzungen erreichen
   die situativ wichtigste Aktion nicht in 2 Taps). Sonst: 2.0 nicht bauen — These verworfen ist
   auch ein Ergebnis.
3. **Nutzertest**: Prototyp (siehe 5.) gegen 1.0 mit je 5 Nutzern pro Persona getestet, inkl.
   mindestens 2 Nutzer 60+. Abbruchkriterium: wenn 60+-Gruppe „Heute" als „kaputt/anders als
   gestern" beschreibt.

## 5. Migrationspfad (wenn Gates bestanden)
1. Prototyp als eigener Screen im UI-Kit (`ui_kits/app/heute-2.0.html`), nicht in index.html —
   Vergleichsgrundlage, 1.0 bleibt unangetastet.
2. A/B-fähig denken: „Heute" ersetzt zunächst nur den Cockpit-Inhalt (Tab-Bar bleibt 5), erst
   danach Tab-Reduktion auf 3 mit In-App-Ankündigung („Belege & Berater sind jetzt hier").
3. Deep-Links: alle 1.0-Hashes bleiben gültig (`#belege` öffnet Belege als Vollscreen-Werkzeug).
4. Berater-FAB kommt zuerst (geringstes Risiko, unabhängig testbar), Tab-Reduktion zuletzt.

## 6. Offene Fragen (vor Bau klären)
- Scan-FAB vs. Berater-FAB vs. GG-Chip: drei schwebende Elemente sind zwei zu viel — Stapel-Ordnung
  oder Zusammenführung (ein FAB mit Ausklapp)?
- Push-Strategie: „Heute"-Zustände sind natürliche Push-Anlässe (Z7, Z8, Z9) — Frequenz-Deckel nötig.
- Tablet/Desktop: „Heute" als linke Spalte neben Jahr-Inhalt statt eigener Screen?
- Barrierefreiheit: Zustandswechsel ankündigen (aria-live) ohne zu nerven.

## 7. Bezug zu 1.0-Bausteinen (Wiederverwendung)
Erstattungs-Held, Hinweis-Karten, Lücken-Liste, Frist-Warnmodus, GG-Chip, Phasen-Stepper und
Prüf-Report existieren alle in 1.0 (`ui_kits/app/`) — „Heute" ist im Kern eine **Neuordnung**
dieser Bausteine nach Situationspriorität, kein Neubau. Der Zustandskatalog (3.3) ist das einzige
echte Neuland.
