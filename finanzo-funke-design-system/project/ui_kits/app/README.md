# UI Kit — SteuerEule App im Funke-Kleid

Interaktive Neufassung der vier Kern-Screens (F4 Cockpit, F2/F3 Belege, F5 Berater,
F6 Übertragen) aus `frontend/src/screens/` des Quell-Repos — Struktur, Copy und
Produktregeln original, Visual komplett Funke.

- `index.html` — Shell mit 5 Tabs (Übersicht · Belege · Berater · **Jahr** · Profil), Hash-Routing
  (Reload/Browser-Zurück echt), GG-Schwebe-Chip auf Arbeits-Screens (Übersicht, Belege, Jahr,
  Veranlagung — nie auf Profil/Statistik); Jahr-Tab = Phasen-Stepper
  (Interview → Sammeln → Übertragen → Abgegeben → Bescheid) + Statistik/Alle-Jahre-Zugriff;
  gemeinsamer Mini-Store (Hinweise, Zeilen, Chat)
- `demo-daten.js` — EINE Quelle für jede Screen-übergreifende Zahl (`window.FunkeDemo`) inkl.
  `formatZahl`/`formatEuro`/`formatEuroCent`; Regel 10 in `guidelines/tech-direktion.md`
- `interview.html` — Interview (F1): eine Frage pro Screen, Geld-Feedback als Sticker, erste Schätzung
- `registrierung.html` — Konto anlegen → ehrlicher Verifizierungs-Hinweis (kein Code-Gate, ADR-0012)
- `scan.html` — Beleg-Scan: Kamera-Mock → Scan-Linie → KI-Vorschlag (Stufe 2) → übernommen
- `gg-tracker.html` — Grenzgänger: Tage tippen, 60er-Grenze, ab 55 kippt die Karte auf Rot
- `bescheid.html` — Bescheid-Vergleich: Amt vs. wir, Abweichung erklärt (KI), Einspruch mit Frist
- `jahre.html` — Steuerjahre: Vorjahresübernahme („80 % vorausgefüllt") + Archiv
- `statistik.html` — Statistik über alle Jahre: Gesamt-Held, Jahres-Balken (ältere aggregiert),
  Top-4-Kategorien + Sheet, Kosten-Bilanz vs. Vorjahr (3 größte Bewegungen, Rest „stabil",
  alles im Sheet), 3 Rekord-Karten — feste Slots, skaliert ohne Endlos-Listen
- `paywall.html` — 2.0-Konzept, **nicht verlinkt**: 1.0 ist komplett kostenlos (Beta, ADR-017);
  der Kauf-Flow kommt erst mit der echten ELSTER-Abgabe
- `splash.html` — Splash beim App-Start mit Session: Marke zeichnet sich, grüßt
  namentlich (aus `funke.onboarding.profil`), geht nach 2,2 s selbst ins Cockpit
- `auth.html` — Login: Google & Apple (offizielle Button-Marken), E-Mail+Passwort,
  Gast-Modus (#61); Login → Onboarding, Gast → App; „Passwort vergessen?" →
  `passwort-reset.html`, „Konto anlegen" → `registrierung.html`
- `passwort-reset.html` — Passwort-Reset in zwei Schritten: anfordern → neutrale
  Bestätigung (bewusst identisch für jede Adresse — kein Ausspäh-Kanal), Link aus
  der Mail → neues Passwort → Erfolg mit „überall abgemeldet", zurück zur Anmeldung.
  Schritt 2 hier über `#neu`/`#abgelaufen`/`#verbraucht` erreichbar
- `passwort-reset-zustaende.html` — alle Reset-Zustände als Referenz, nicht nur der
  Idealfall: leer/getippt/Formfehler, gesendet, neues Passwort (+ zu kurz, ungleich),
  abgelaufen, schon benutzt, Erfolg
- `onboarding.html` — Splash (Marke zeichnet sich selbst) + 3-Schritt-Onboarding:
  Name → Steuer-ID → Steuernummer, live formatiert; füllt die Maske vor
  (localStorage `funke.onboarding.profil`) und mündet in `index.html`
- `lebenslagen.html` — Lebenslagen-Katalog (ADR-031/035/036): 10 kuratierte Einträge in
  Nutzersprache, jeder mit echtem Flow; Highlights: Abfindungs-Rechner (Fünftelregelung,
  Vorher/Nachher) + zumutbare-Belastung-Live-Schwelle mit Balken. In der Shell: Cockpit → „+ Lebenslage"
- `veranlagung.html` — Günstigerprüfung (M1): Zusammen vs. Einzeln, beide Tarife voll
  gerechnet, Empfehlung mit Herkunft — in der Shell via Cockpit-Karte (nur bei Partner: Ja)
- `datenschutz.html` — DSGVO plakativ + konkret: „Deine Daten. Deine Regeln.", Rechte mit
  Aktion (Art. 15/16/17/20), „was wir sehen — und was nie"; verlinkt aus Profil (Zeile + Footer)
- `abgabe.html` — Abgabe-Abschluss: „Zack. Drüben." — der emotionale Höhepunkt; eingereichte
  Summe mit Herkunft, ehrliche Timeline (4–8 Wochen), Bescheid-Wächter; in der Shell erreichbar,
  wenn in Übertragen alle Zeilen bestätigt sind („Ja, abgeschickt →")
- `jahr-2025.html` — versiegeltes Jahr: Übertragen-Layout im Fakten-Modus (Papier-Ton, keine
  Checkboxen, keine KI-Striche), Zeilen + Belege gebündelt, Kopieren/Herkunft bleiben;
  Korrektur nur als „Fassung 2" (§ 153 AO/Einspruch) — Muster: `guidelines/versiegelt.html`.
  In der Shell: Archiv-Jahr in Steuerjahre antippen.
- Abdeckungs-Ausbau (ADR 028–036): GG-Vollausbau (Lohnausweis-Scan-Maske mit CHF-führt-Regel,
  CH-Vorsorge-Karte: Quellensteuer 4,5 %, Pensionskasse, 3a, KK, Kinderzulage), Interview kann
  Rente (Anlage R inkl. Zeile in Übertragen), KAP-Verzweigung (ausländische Broker ja,
  Krypto-Gate mit Vormerken), Vermietung bis mehrere Objekte (Verkauf/möbliert bleibt Gate),
  Progressionsvorbehalt sichtbar im Spannen-Ticker, Gewerbe-Gate bestätigt.
- Login (`auth.html`, `Auth.jsx` + `AuthGeraete.jsx`) — drei Wege mit klarer Hierarchie:
  **E-Mail+Passwort ist die eine Primäraktion** (Limette „Einloggen"), Google/Apple sind schnelle
  Nebenwege darüber (Ghost/Nacht), die **Geräte-Kopplung** (Device Grant, RFC 8628) ist der
  eigene Desktop-Weg auf der Nacht-Fläche hinter dem „Anderer Weg"-Trenner — erst ab 700 px,
  am Telefon ist der Login selbst der kürzeste Weg. Ist Google nicht eingerichtet, verschwindet
  der Knopf nicht spurlos, sondern sagt es ehrlich (gestrichelte Zeile).
- `AuthGeraete.jsx` — `FunkeQrKopplung` mit allen 8 Zuständen (laedt, bereit, läuft ab ≤20 s,
  abgelaufen, fehler, wartet, bestätigt, abgelehnt): QR-Muster (Demo), Zeichen-Code darunter
  gepinnt (`A7K‑M2Q` + Kopieren, steuereule.de/koppeln), sichtbare Lebensdauer (2 min, Balken +
  Countdown, Vorwarnung in Amber), bekannte Geräte. Dazu `FunkeGeraetBestaetigen` — der
  Gegenpart auf dem Telefon („Warst du das?" mit Gerät/Ort/Zeit + Code-Abgleich / zugestimmt /
  abgelehnt). Referenzblatt: `auth-zustaende.html` (alle Zustände nebeneinander).
- Eulen-Modus (ADR 037–042): opt-in KI-Stufe 2 — Opt-in nach dem Interview („Soll ich ab jetzt
  mitdenken?"), Profil-Schalter, violetter Cockpit-Einstieg „Ich hätte 4 Fragen an dich" +
  proaktiver Gesetzes-Fund (≥50 €, Quelle menschlich übersetzt), Abruf-Gespräch im Berater
  („Was würdest du mich fragen?", eine Frage nach der anderen, „Stimmt nicht"-Knopf,
  ehrlicher Leerlauf mit Rechtsstand), Archiv-Wache mit Einspruchsfrist-Karte (Jahre).
- Abdeckungs-Grilling (ADR 028–036) eingebaut: Lebenslagen-Katalog (`lebenslagen.html` —
  10 kuratierte Einträge, Abfindungs-Rechner mit Fünftel-Effekt, agB-Live-Schwelle mit Balken),
  Cockpit-Branches für Anlage R / KAP (Ausland) / V (mehrere Objekte), Progressionsvorbehalt
  im Spannen-Ticker, GG-Vollausbau (Lohnausweis-Zeilen mit CHF-Herkunft, Quellensteuer 4,5 %),
  Rente als Interview-Einstieg. Gewerbe-Gate bleibt (ADR-028). Konflikt-Zustand (Beleg ≠ Eingabe,
  Amber, blockiert Abgabe — Belege + Prüf-Report), Spannen-Ticker statt Punktwert (Cockpit),
  Posteingang-Zuordnung per Vorschlags-Chip (Belege), Kopplung/Partner-Einladung (Veranlagung),
  CH-only-Gate mit Warteliste (Interview), tatsächlicher Wechselkurs belegpflichtig (GG-Tracker),
  Rückfrage-Zustand nach Abgabe (Jahr-Tab), Extern-erledigt-Jahre + Rückjahre-Karte (Steuerjahre),
  Beta statt Paywall (Profil), Push nur ereignisbasiert + Saison-Erinnerung (Profil),
  Offline-Hinweis (Splash), Export-Zwischenschritt vor Konto-Löschung (Profil).
- `Cockpit.jsx` · `Belege.jsx` · `Berater.jsx` · `Uebertragen.jsx` · `Onboarding.jsx` · `Auth.jsx`
  · `Interview.jsx` · `Registrierung.jsx` · `Scan.jsx` · `GgTracker.jsx` · `Paywall.jsx` · `Profil.jsx`
  · `Veranlagung.jsx`

Flow: `auth.html` → (`registrierung.html`) → `onboarding.html` → `interview.html` → `index.html`;
Wiederkehr: `splash.html` → `index.html`. Alles kostenlos (Beta — ADR-017); die frühere Paywall ist 2.0-Konzept.
Einstiege: Cockpit → GG-Tracker (NRT-Karte), Bescheid („ist da"-Karte) & Veranlagung (Partner-Karte);
Belege → Scan; Profil → Statistik, Steuerjahre, Bescheid. Interview-Antworten (localStorage
`funke.interview`) steuern die Branches: Schweiz Nein → GG ausgeblendet; Selbstständig/Beides →
Gewerbe-Gate; Kapitalerträge/Vermietung → Anlage KAP/V in Cockpit + Übertragen (komplexe
Vermietung → ehrliches Gate); Kinder → Anlage Kind (Kindergeld, Betreuungskosten; Günstiger-
prüfung-Hinweis im Cockpit); Partner Ja → Günstigerprüfung. Vorsorgeaufwand (KV/PV/RV aus der
LStB) ist immer dabei. Maßnahmen aus
`research/marktanalyse.md`: Prüf-Moment vor Abgabe (Übertragen), Beleg-Inbox (Belege),
Arbeitstage-Assistent (Interview), Frist-Warnmodus ab 60 Tagen (Cockpit), VaSt-Abruf (Jahre, Demo).

Interaktionen: Hinweis übernehmen/verwerfen (Erstattung springt + Delta-Sticker),
Lücken-Sheet, Chat senden, Zeilen kopieren/abhaken, Prüf-Report, Export-Sheets.
