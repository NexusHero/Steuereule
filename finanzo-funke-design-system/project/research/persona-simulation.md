# Persona-Simulation — wer wird gut bedient? (07/2026)

9 Durchgänge: 3 Gruppen × leicht / normal / heavy. Grundlage: Code-Walkthrough aller Screens
(Interview, Cockpit, Belege, Übertragen, GG-Tracker, Statistik, Jahre/JahrDetail, Paywall).
Bewertung: 🟢 gut bedient · 🟡 bedient mit Reibung · 🔴 schlecht bedient / Sackgasse.

## Angestellte

**Leicht — „Lisa, 24, erste Steuererklärung, nur Pauschbeträge"** 🟡
- Gut: Interview trägt sie (9 Fragen, du-Form, Begriff-Hilfen), Gates greifen nicht, Cockpit → Übertragen ist kurz.
- Reibung 1: Die Schätzung ist `1200 € + km·12` — Lisa ohne Homeoffice, ohne Fortbildung, 3 km Weg
  sieht trotzdem „≈ 1.200 €". Das verletzt unsere eigene Ehrlichkeits-Regel (Overpromise beim
  schwächsten Fall). Schätzformel müsste aus den Antworten fallen können — auch auf „≈ 150 €".
- Reibung 2: Cockpit-Balken (Anlage N 80 / Vorsorge 70 / Sonderausg. 60) sind statisch — Lisas
  „Vollständigkeit" sieht identisch aus wie die eines Heavy-Users. Für sie ist 68 % demotivierend,
  obwohl sie faktisch fast fertig wäre.

**Normal — „Jonas, 34, Homeoffice + Pendeln + 1 Fortbildung, ~10 Belege"** 🟢
- Der gesamte Bau zielt auf ihn: Interview-Impacts, Beleg-Review mit Konfidenz + „weil",
  Lücken-Liste, Prüf-Moment, Übertragen mit Herkunft, Bescheid-Vergleich, Vorjahresübernahme.
- Einzige Reibung: Lücken-Liste-Zeilen schließen nur das Sheet, springen aber nicht zur Lösung
  (Copy verspricht „führt dich direkt zur Lösung") — Versprechens-Bruch im Detail.

**Heavy — „Miriam, 41, verheiratet, 2 Kinder, KAP + Vermietung, ~80 Belege"** 🟡
- Gut: KAP/V/Kind-Branches erscheinen echt (Interview → Cockpit → Übertragen), Günstigerprüfung,
  Statistik skaliert bewusst (Slots statt Listen).
- Schwach 1: **Belege skaliert nicht.** Flache Kartenliste, 4 Status-Filter, keine Suche, keine
  Kategorie-/Jahres-Gruppierung, kein Zähler pro Kategorie. Bei 80 Belegen: Scroll-Wüste —
  genau das, was wir in der Statistik bewusst vermieden haben, fehlt hier.
- Schwach 2: Kategorien-Lücken für Heavy-Angestellte: außergewöhnliche Belastungen
  (Krankheitskosten), doppelte Haushaltsführung, Umzug tauchen nirgends als Frage/Branch auf
  (Umzug existiert nur als Statistik-Rekord „+412 €" — Widerspruch: das Produkt hat ihn mal gefunden).
- Schwach 3: Übertragen bei 6+ Anlagen: Chip-Reihe scrollt, ok — aber es gibt keinen
  „alles einer Anlage abhaken"-Schritt; 40 Zeilen einzeln abhaken ist Fleißarbeit ohne Belohnung
  (nur 1 „Zack" ganz am Ende — Regel „max. 1 Sticker pro Journey" bleibt aber erfüllt).

## Grenzgänger (Schweiz)

**Leicht — „Peter, 52, pendelt täglich, übernachtet nie auswärts"** 🟢
- Interview-Frage → GG-Karte im Cockpit, 12/60 mit Puffer, Anlage N-Gre-Zeilen in Übertragen.
  Für ihn reicht das komplett; Tracker ignoriert er zu Recht.
- Detail: sein Tracker startet trotzdem bei 52/60 (Demo-`startTage`) — als leerer Zustand
  müsste er bei 0 beginnen, sonst erschrickt genau der User, der nie übernachtet.

**Normal — „Sandra, 38, Projektarbeit, ~30 Nichtrückkehrtage"** 🟢
- Kernfall des Trackers: Kalender-Tippen, 60er-Balken, Herkunfts-Chip mit Rechenweg,
  Warnmodus ab 55. Gut bedient.

**Heavy — „Marc, 44, Montage, reißt die 60-Tage-Grenze"** 🔴
- Der Tracker warnt („ab 60 kippt die Besteuerung in die Schweiz") — **und dann ist Schluss.**
  Kein Zustand für „gekippt": Was heißt das für Anlage N-Gre? Was muss Marc jetzt tun
  (Quellensteuer CH, Ansässigkeitsbescheinigung)? Die App malt die Klippe und schweigt ab Tag 60.
  Ehrlich wäre ein „Ab hier: Profi"-Gate wie beim Gewerbe.
- Fehlend für alle GG-Stufen, bei Heavy akut: **CHF→EUR-Umrechnung** (ESTV-Jahresmittelkurs).
  Der Schweizer Lohnausweis ist in CHF; Übertragen zeigt EUR-Zeilen, ohne den Rechenweg
  „CHF × Kurs" je zu erwähnen — Herkunfts-Regel verletzt an der wichtigsten GG-Zahl.
- Fehlend: nur die Schweiz. Frankreich/Österreich (andere DBA-Logik) werden im Interview
  gar nicht erst gefragt — okay als 1.0-Scope, aber nirgends ausgesprochen.

## Gewerbe / Selbstständige

**Leicht — „Aylin, 29, angestellt + 2.400 € Etsy-Nebengewerbe"** 🔴
- Sie wählt „Beides" → Gate. Ihre zwei Optionen: nur Angestellten-Teil oder warten.
  **Fachliches Problem:** Eine Steuererklärung ist unteilbar — „nur den Angestellten-Teil machen"
  erzeugt eine unvollständige (falsche) Erklärung. Der freundlichste Pfad ist der gefährlichste.
  Entweder der Pfad heißt ehrlich „Vorbereiten, abgeben erst wenn Gewerbe da ist" — oder er fällt weg.
- Dabei wäre sie die dankbarste Neukundin: Kleingewerbe unter 22 k€ (EÜR anlagefrei bis 17,5 k€ war mal;
  heute: EÜR light) ist die am schnellsten wachsende Gruppe (Etsy, Kleinanzeigen, Streaming).
  Bewusster 1.0-Verzicht ist okay — aber sie ist die größte real abgewiesene Gruppe.

**Normal — „Deniz, 35, Vollzeit-Freelancer"** 🟢 (im Rahmen des Verzichts)
- Gate ist ehrlich, erklärt warum (EÜR, G/S, USt), bietet Vormerken, Cockpit-Wartezustand existiert
  und lockt nicht mit falschem Mock. Er wird nicht bedient — aber er wird nicht betrogen. Genau richtig.

**Heavy — „Ruth, 58, GmbH-Geschäftsführerin + Beteiligungen"** 🟢
- Korrekt weggeschickt. Kein Handlungsbedarf.

## Quer-Befunde

1. **Die App ist exzellent für den normalen Angestellten gebaut** — jede Regel (Herkunft, eine
   Primäraktion, Ehrlichkeit) zahlt auf ihn ein. Das ist richtig so und bleibt der Kern.
2. **Skalierungs-Muster ist ungleich verteilt:** Statistik/Bilanz haben bewusste Slot-Layouts,
   Belege und Übertragen nicht — genau dort landet aber das Volumen der Heavy-User.
3. **Gates sind unsere Stärke — aber sie fehlen an einer Stelle (GG > 60) und sind an einer
   Stelle fachlich falsch (Gewerbe „Beides").**
4. **Statische Demo-Werte widersprechen Personas:** Schätzung 1.200 € Minimum, Tracker startet
   bei 52, Cockpit-Prozente fix. Für ein UI-Kit okay, aber die drei sind Ehrlichkeits-Muster —
   sie sollten aus den Interview-Antworten fallen, damit das Design den Grenzfall zeigt.

## Priorisierte Maßnahmen — Status: alle 6 umgesetzt (07/2026)

1. ✅ GG-Kipp-Gate: ab 60 Tagen ehrliches Gate mit 3 nächsten Schritten + Tracker-Export (GgTracker).
2. ✅ Gewerbe-„Beides": „vorbereiten statt abgeben" — Vorbereitungs-Modus-Banner im Cockpit,
   Abgabe-Block + Prüf-Report-Zeile in Übertragen (Erklärung ist unteilbar).
3. ✅ Belege: Suche + Kategorie-Gruppen (Arbeit & Job / Zuhause / Spenden & Versicherungen) — 80 Belege bleiben 4–5 Kapitel.
4. ✅ CHF-Kurs als Regel: Kurs-Karte im Tracker (Jahresmittel/Monatskurse, „vorläufig"-Zustand,
   nie Nutzereingabe), Rechenweg an GG-2-Zeilen (2026 vorläufig × 1,07 · 2025 amtlich × 1,065).
5. ✅ Schätzung fällt aus den Antworten (kann ehrlich klein sein, eigene Copy < 300 €);
   Cockpit liest sie + Anlage-N-Fortschritt aus dem Interview.
6. ✅ Lücken-Liste springt wirklich zur Lösung (Übertragen/Belege/Profil).

Kurs-Recherche (07/2026): amtlicher Grenzgänger-Kurs ist eine jährliche Verwaltungs-
veröffentlichung (2025: 100 CHF = 106,50 €; 2024: 104,50 €), keine API — Regel-DB jährlich
pflegen, Bundesbank/EZB-API nur als Plausibilitäts-Wächter, Januar-Lücke als „vorläufig" zeigen.
