# SteuerEule — Design System „Funke"

**Funke** ist die zweite Design-Sprache von SteuerEule — der KI-gestützten Steuer-App für
Privatpersonen in Deutschland (Belege scannen → Kategorisierungs-Vorschlag → feldgenaue
Übertragungshilfe für Mein ELSTER). Die erste Sprache, **„Klar"**, war bewusst ruhig:
Papier-Beige, Tannengrün, Haarlinien. Der Auftrag für Funke war das Gegenteil:
**Energie, Spaß, ein junges Publikum** — Steuererklärung, die sich nach Fortschritt und
gewonnenem Geld anfühlt, nicht nach Amt. Anderes Team, andere Aura, gleiche Produkt-Substanz.

## Quellen

- GitHub: **https://github.com/NexusHero/Finanzo** — Produkt-Kontext, Screens, Copy und die
  tragenden Produktregeln stammen aus diesem Repo. Zum Vertiefen besonders lohnend:
  - `docs/design/ui-ux-concept.md` — das „Klar"-Konzept (F1–F6, Prinzipien)
  - `frontend/src/styles/klar.css` — das alte Token- & Komponentensystem
  - `frontend/src/screens/*.tsx` — echte Screens, echte Copy
  - `frontend/src/components/{kern,logo}.tsx` — Kern-Komponenten (und die alte „Klar"-Tanne)
- GitHub: **https://github.com/NexusHero/myDevTime** — frühere Bildmarken-Quelle (Zeitblöcke):
  `docs/design/brand/` enthält Mark, Lockup, Splash und die Motion-Spezifikation;
  Kopien liegen unter `assets/mydevtime/`.
- Wer Designs für dieses Produkt baut, sollte das Repo weiter erkunden — Roadmap, ADRs und
  Mock-Store erklären, warum die UI-Regeln so sind, wie sie sind.

## Was Funke von Klar übernimmt (Produktregeln, nicht Deko)

1. **Der Beleg ist das Atom.** Nutzer werfen Dokumente rein; Formulare sind ein Export.
2. **Eine Farbe = KI.** In Klar war Bernstein exklusiv für KI-Output. Funke behält die Regel,
   wechselt die Farbe: **Violett `#7C5CFF` ist ausschließlich KI** (Vorschläge, Berater, Chat).
   Limette ist die App; Violett ist eine Meinung. KI-Elemente tragen `data-ai="true"`.
3. **Jede Zahl ist anfassbar.** Herkunfts-Chip: Beleg, Regel-ID, Rechenweg — ein Tap.
4. **Ein nächster Schritt.** Jeder Screen hat genau eine Primäraktion.
5. Zahlen immer `tabular-nums`. Touch-Ziele ≥ 44px. `prefers-reduced-motion` wird beachtet.

## CONTENT FUNDAMENTALS

- **Sprache:** Deutsch, konsequent **du** („Frag zu deinem Steuerjahr …", „Deine 8 Basis-Fragen").
- **Ton in Funke:** kurz, direkt, feiernd. Erfolge werden ausgesprochen: „312 € gefunden",
  „+80 €" als Delta-Sticker. Kein Behördendeutsch, aber auch kein Clown: bei Geld und Recht
  bleibt die Copy präzise und ehrlich („Schätzung — noch ungenau: 3 Angaben offen").
- **Ehrlichkeit ist Stil:** Der Fund-Zähler zählt nur umgesetzte Hinweise; Grenzen werden
  benannt („kein Ersatz für Rechts- oder Steuerberatung", „Werte bitte in Mein ELSTER prüfen").
- **Fachbegriffe bleiben deutsch und amtlich:** Anlage N, Zeile 31, Nichtrückkehrtage,
  Übertragungshilfe. Die Energie kommt aus Rhythmus und Größe, nicht aus Verniedlichung.
- **Satzbau:** Verb nach vorn, ein Gedanke pro Satz. Buttons sind Verben oder Ergebnisse:
  „Übertragung starten", „Übernehmen (+80 €)", „Trifft nicht zu".
- **Keine Emoji.** Energie kommt aus Typo, Farbe und Bewegung.
- **Fehlerton (ADR-023):** zweistufig. Erste, harmlose Fehlinstanz — Eulen-Ton erlaubt
  („Das hat nicht geklappt. Nochmal?", Technik-Detail einklappbar). Ab dem zweiten Fehlversuch
  oder bei allem Kritischen (Abgabe, Fristen, Löschung, Geld): nüchtern und präzise — was ist
  passiert, was tun, keine Pointe, nie Schuld beim Nutzer.
- **Beispiele (aus dem Repo, weiterverwendbar):** „Deine Steuer. Klar." → Funke-Claim:
  **„Steuern? Zack, erledigt."** · „Was fehlt noch zur Abgabe? Frag mich." ·
  „Gast-Modus — deine Angaben sind nur auf diesem Gerät."

## VISUAL FOUNDATIONS

- **Farben:** Warmer heller Grund `#F4F2E9`, Karten Weiß, Tinte `#191B12`.
  Marken-Energie: **Funke-Limette `#C9F229`** für Primäraktionen und Erfolgsmomente.
  Dunkler Held `#191B12` („Nacht") für die Erstattungs-Karte und Kamera — Limette leuchtet darauf.
  **Violett `#7C5CFF` = ausschließlich KI.** Semantik: ok `#1F9D55` · warn `#E07B00` · fehler `#E0362C`.
- **Typografie:** Display **Bricolage Grotesque** (eng, schwer, `letter-spacing -0.03em`),
  Text **Schibsted Grotesk**, Metadaten/Zeilen **Space Mono** (uppercase, `+0.08em`).
  Skala 12/14/16/18/24/32/44/60. Werte fett und groß; der Erstattungs-Held ist 60px.
- **Konturen & Schatten:** Karten und Controls haben **2px Tinte-Kontur** und **harte
  Versatz-Schatten** (`4px 4px 0 Tinte` — Sticker-Optik). Keine weichen Schatten, keine Haarlinien
  auf Kartenrändern; innere Trennlinien nutzen `--linie-weich`.
- **Radien:** deutlich rund — 12 (klein) / 20 (Karte) / 28 (groß) / Pille für Buttons & Chips.
- **Hintergründe:** flächige Farben, keine Verläufe, keine Texturen. Kontrast entsteht durch
  den Wechsel Hell ↔ Nacht-Flächen und Limetten-Akzente. Ein leicht gedrehter „Sticker"
  (2–3° Rotation, Limette, harte Kontur) markiert Erfolgsmomente (Delta, „gefunden").
- **Bewegung:** federnd und kurz. `--feder: cubic-bezier(.34,1.56,.64,1)` für Auftritte/Pop,
  `--zack` für Micro-Transitions (120–220ms). Count-ups auf gefundenen Werten. Screens treten
  mit `funke-auftritt` auf (10px Rise + Scale). Alles hinter `prefers-reduced-motion`.
  - **Tab-Wechsel:** die Limetten-Pille der Tab-Bar **gleitet** hinter den aktiven Tab
    (0,42 s `--feder`, Rail: vertikal — gleicher Code), das Ziel-Icon poppt einmal; der
    Screen-Inhalt gleitet 24 px aus der Richtung des neuen Tabs herein (0,3 s, Orte in einer
    Reihe — die Bewegung bestätigt das räumliche Modell). Kein Parallax, kein Screen-Zoom.
- **Hover:** Element hebt an — `translate(-2px,-2px)` + Schatten wächst auf `6px/7px`.
- **Druck:** Element drückt AUF seinen Schatten — `translate(2px,2px)` + Schatten `0 0`.
- **Transparenz/Blur:** nur der Sheet-Hintergrund (`rgba(25,27,18,0.5)`); sonst deckend.
- **Karten:** Weiß, 2px Tinte-Kontur, Radius 20, harter Schatten, Innenabstand 16–24.
- **Layout:** Mobile-first 420px-Shell, Bottom-Tab-Bar als schwebende Pille; Desktop ≥900px
  gleiches Muster mit Sidebar. 8pt-Raster (`--s1…--s7`).
- **Dark Mode:** bewusst noch nicht definiert (Klar hatte einen; Funke-Invertierung steht aus).

## ICONOGRAPHY

- **Bildmarke:** die **Eule mit Brille** — sie prüft genau, bevor sie unterschreibt. Eigenentwurf
  in Funke-Geometrie mit einem Erbstück der alten Marke: der **rechte Brillenring ist gestrichelt**
  (das „geplant"-Element der myDevTime-Blöcke) — links geprüft, rechts noch offen.
  Tinte auf Hell (`assets/marke-tinte.svg`, Brillenrand Limette) · Limette auf Nacht
  (`assets/marke-funke.svg`). **Nie in KI-Violett.**
  - Historie: die frühere Marke (myDevTime-Zeitblöcke) liegt als Referenz in `assets/mydevtime/`.
  - **Marken-Animation:** Kopf poppt (`--feder`, +100 ms), die Brille setzt sich von oben auf
    (+550 ms), ein Lidschlag (+1,3 s). `prefers-reduced-motion` → statische Marke.
    Live in `splash.html`/`onboarding.html`, Spezifikation in `guidelines/marke-animation.html`.
- **Icons:** Das Repo nutzt handgeschriebene 24px-Stroke-Pfade (1.8px, round caps) inline in
  `App.tsx` — kein Icon-Font, keine PNGs. Funke übernimmt das Prinzip mit kräftigerem Strich
  (2.2px); vier der fünf Tab-Pfade sind Original (Übersicht, Belege, Berater, Profil), der
  „Jahr"-Tab (Kalender) ist eine Funke-Ergänzung in gleicher Geometrie — alles in
  `components/navigation/TabBar.jsx`. Für neue Icons: gleiche Geometrie (24er-Grid, round).
- **Keine Emoji, keine Unicode-Icons** außer funktionalem ✓ (Checkbox) und ✕ (Schließen),
  wie im Quell-Repo.
- **Der KI-Punkt:** KI-Absender bleibt der runde „B"-Punkt (jetzt Violett) — die Kennzeichnung
  hängt nie nur an Farbe.

## Index

- `styles.css` — Einstieg, importiert alle Tokens (`tokens/*.css`)
- `assets/` — Bildmarke (2 Funke-Varianten) + `assets/mydevtime/` (Original-Brand aus myDevTime)
- `research/marktanalyse.md` — Wettbewerbs-Analyse (07/2026) mit Umsetzungsstatus;
  daraus notiert: **ELSTER-Hersteller-Zertifikat kommt mit 1.x** (Zertifikat fehlt noch).
  Portierte Maßnahmen M1–M9: Günstigerprüfung (`Veranlagung.jsx`), Prüf-Moment vor Abgabe
  (Übertragen), Ganzjahres-Beleg-Inbox (Belege), Arbeitstage-Assistent + Einkünfte-Frage
  mit Vermietungs-Gate (Interview), KAP/V-Zeilen (Übertragen/Cockpit), Frist-Warnmodus ab
  60 Tagen (Cockpit), Website-Sektion „Warum nicht ELSTER" + Bescheidprüfung-kostenlos.
  1.0-Lücken geschlossen: Datenschutz-Screen (DSGVO plakativ), Abgabe-Abschluss („Zack.
  Drüben."), Kauf-Flow in der Paywall (inkl. Fehlerzustand), Systemzustände-Muster
  (`guidelines/systemzustaende.html`), Website-Datenschutz-Sektion.
- `research/persona-simulation.md` — 9 Persona-Durchgänge (3 Gruppen × leicht/normal/heavy),
  alle 6 abgeleiteten Fixes umgesetzt (GG-Kipp-Gate, Gewerbe-Vorbereiten, Belege-Suche+Gruppen,
  CHF-Kurs-Regel, ehrliche Schätzung, springende Lücken-Liste).
- `research/konzept-2.0-heute.md` — Konzept adaptive Navigation „Heute" (3 Tabs) für 2.0:
  Zustandskatalog Z1–Z10, Bau-Gates (Telemetrie, These-Beleg, Nutzertest 60+), Migrationspfad.
  Bewusst NICHT in 1.0 gebaut — Begründung im Dokument. 1.0 fährt 5 Tabs mit Jahr-Phasen-Stepper.
- `guidelines/` — Specimen-Karten (Farben, Typo, Raum, Effekte, Marke, Zustände, Dunkel);
  dazu „Die Eule erklärt's" (`components/wissen/Begriff`): nachschlagbare Begriffe —
  gepunktet = Wissen/Fakt, gestrichelt-violett bleibt KI; max. 1–2 pro Screen, nie automatisch;
  dazu `guidelines/tech-direktion.md` — verbindliche Tech-Richtung: React Native + React Web,
  gemeinsamer TS-Logik-Kern, Chart-Regeln (keine Chart-Libs in V1; Pflichten für jede
  Visualisierung), QS-Checks; `guidelines/qa-checkliste.md` — Prüfliste vor jedem „fertig"
  (eine Zahlenquelle `ui_kits/app/demo-daten.js`, Format-Helfer, Persona-Element-Regel,
  bewusste 1.0-Nicht-Ziele)
- `templates/pitch-deck/` — Pitch-Deck-Vorlage: Titel (Nacht), Abschnitt (Limette), Inhalt, große Zahl
- `components/`
  - `actions/` — **Button**, **Chip**, **Pill**
  - `forms/` — **Input**, **Feld**, **Option**, **SchalterZeile**
  - `ai/` — **AiChip**, **BeraterLeiste**, **HerkunftsChip**, **KiWert** (alles Violett-Territorium)
  - `feedback/` — **Banner**, **Toast**, **Ring**, **Balken**, **Sticker**
  - `overlay/` — **Sheet**
  - `navigation/` — **TabBar**
  - `wissen/` — **Begriff** („Die Eule erklärt's": nachschlagbare Fachbegriffe, nie Violett)

Dunkles Design: `tokens/dunkel.css`, aktiviert über `<html data-theme="dunkel">` — Limette und
KI-Violett bleiben, Tinte/Flächen tauschen; Umschalter im Profil (localStorage `funke.theme`).

- `ui_kits/app/` — die SteuerEule-App im Funke-Kleid, interaktiv: Cockpit, Belege, Berater,
  Übertragen, Profil; dazu `auth.html` (Login mit Google/Apple, E-Mail, Gast-Modus),
  `registrierung.html` (Konto + ehrlicher Verifizierungs-Hinweis), `onboarding.html` (Splash + Maske vorfüllen),
  `interview.html` (F1 inkl. Arbeitstage-Rechner), `scan.html` (Beleg-Scan + PDF-Upload),
  `gg-tracker.html` (Grenzgänger), `paywall.html` (Abgabe-Paket + Kauf-Flow),
  `splash.html` (App-Start), `bescheid.html` (Bescheid-Vergleich + Einspruch),
  `jahre.html` (Vorjahresübernahme + Archiv), `jahr-2025.html` (versiegeltes Jahr),
  `statistik.html` (alle Jahre, skalierende Slots), `veranlagung.html` (Günstigerprüfung),
  `datenschutz.html` (DSGVO), `abgabe.html` (Abgabe-Abschluss)
- `ui_kits/website/` — Marketing-Landingpage: Hero mit animierter Marke, 3 Schritte,
  „KI, die sich zu erkennen gibt", Preis (kein Abo), ehrliches FAQ
- `SKILL.md` — Einstieg für Agenten
- `research/adr/index.md` — 37 Entscheidungs-Records (ADR 001–042) aus den Grilling-Sessions:
  Datenmodell (Steuerjahr pro Person, Posteingang, Konflikt, Fassungen), Grenzgänger (CH-only,
  volle Tiefe: Lohnausweis-Scan, Quellensteuer, Vorsorge), Abdeckung (Lebenslagen-Katalog,
  Eulen-Modus (opt-in KI-Stufe 2: proaktive Funde ≥50 €, Abruf-Gespräch, Archiv-Wache),
  Rente/Anlage R, KAP-Ausland, Mehr-Objekte-V), KI-Grenzen, Zustandsmaschine, Beta statt Paywall
- `research/glossar.md` — verbindliche Begriffe (Posten, Herkunft, Fassung, Konflikt,
  Kopplung, Rückfrage, Spanne …) — ein Begriff = ein Wort, überall

## Intentional additions / Abweichungen

- Farb- und Formwelt ist bewusst NEU (Auftrag) — Struktur, Copy und Produktregeln sind aus dem Repo.
- Webfonts: das Repo lieferte keine Font-Dateien (Klar = System-Stack). Funke nutzt Google Fonts
  (Bricolage Grotesque / Schibsted Grotesk / Space Mono) — Substitution, bitte finale Marken-Fonts liefern.
