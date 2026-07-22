# Tech-Direktion — SteuerEule App & Web (Stand 07/2026)

Verbindliche Richtung für die Umsetzung. Empfehlung mit Begründung — kein Beton:
wer mit besserem Argument (oder besserem Team) abweicht, dokumentiert es hier als Nachtrag.
Was NIE verhandelbar ist, sind die Produkt-Verträge des Design-Systems (unten).

## Plattform-Strategie
- **Mobile:** iOS + Android aus einer Codebasis mit **React Native**. Stores sind Pflicht
  (saisonale App-Store-Discovery, Kamera-Scan, Push für Frist/Bescheid/GG-Tracker).
- **Web:** vollwertige **React-Web-App** — nicht optional. Prüfen & Abgeben passiert am
  großen Bildschirm; ältere Zielgruppe arbeitet am Desktop; reine App-Anbieter verlieren
  genau dort (siehe `research/marktanalyse.md`).
- **Arbeitsteilung:** Handy = reinwerfen (Scan/Upload, Interview, Tracker, Push) ·
  Web = prüfen & abgeben (Übertragen, Günstigerprüfung, Bescheid-Vergleich). Ein Konto,
  ein Stand.
- **Warum React Native statt Flutter:** das Design-System IST React (Komponenten-Verträge,
  UI-Kit als Referenzimplementierung 1:1 übernehmbar); gemeinsamer Logik-Kern mit Web;
  ein Talent-Pool für App + Web + DS; native Plattform-Controls für Text-Rendering und
  Screenreader — wichtig für die ältere Zielgruppe. Flutter gewönne nur ohne Web-Ambition.

## Gemeinsamer Kern (App + Web teilen sich)
- **TypeScript strikt** überall.
- Logik-Layer als eigenes Paket: Steuer-Regeln, Validierung, Herkunfts-Metadaten,
  Interview-Branching — UI-frei, damit RN und Web denselben Kern rendern.
- Design-Tokens aus `tokens/` sind die einzige Style-Quelle. Keine Ad-hoc-Hexwerte;
  RN bekommt die Tokens generiert (Style-Dictionary o. ä.), Web nutzt die CSS-Properties direkt.

## Charts & Datenvisualisierung
- **Kein Chart-Framework für V1.** Statistik nutzt bewusst einfache Formen — `Ring`
  (conic-gradient), `Balken`, Bilanz-Zeilen existieren als DS-Komponenten (~100 Zeilen,
  null Abhängigkeiten). Recharts/ECharts & Co. bringen fremde Designsprache (Tooltips,
  Achsen, Antialiasing) mit, die gegen Funke kämpft.
- **Wenn echte Charts nötig werden** (Verlaufskurven, gestapelte Flächen):
  **victory-native** (eine API für RN + Web) oder Web-only **visx** (low-level genug,
  dass Tokens und Konturen durchgreifen). Keine Lib, deren Theme sich nicht vollständig
  auf Funke-Tokens mappen lässt.
- **Chart-Pflichten (nicht verhandelbar, gelten wie für jede Zahl):**
  1. Jede dargestellte Zahl trägt Herkunft — antippbar (Sheet/HerkunftsChip, kein Lib-Tooltip).
  2. `tabular-nums` für alle Werte und Achsen.
  3. Farben ausschließlich aus den Tokens; **Violett `--ki` nur, wenn die Werte KI-berechnet
     sind** (`data-ai="true"`).
  4. Harte Konturen/Schatten gemäß Ruhe-Hierarchie — Charts flüstern wie normale Karten.
  5. Animation nur mit Bedeutung (`--feder`/`--zack`), hinter `prefers-reduced-motion`;
     Aufbau-Animation wie Statistik-Seite (zählen, wachsen), nie dauerhaftes Gezappel.
  6. Keine Endlos-Skalen: feste Slots, ältere Perioden aggregieren (siehe Statistik-Screen).

## Qualitätssicherung (der eigentliche Hebel)
- Storybook (o. ä.) gegen die **definierten Zustände**: hover, press, focus, disabled,
  leer, Fehler, Laden — pro Komponente, Pflicht vor Merge.
- Playwright-Flows auf 375 / 768 / 1280 px für jeden Kern-Flow (Interview → Cockpit →
  Übertragen; Scan/Upload; Bescheid).
- CI-Checks: keine Hexwerte außerhalb `tokens/` · `data-ai` ⇔ `--ki`-Nutzung ·
  `prefers-reduced-motion`-Pfad vorhanden · Touch-Ziele ≥ 44 px.
- A11y: Screenreader-Durchgang je Release (native Controls machen das billig — Grund für RN).

## Skalierungs-Prinzip: Erledigtes kollabiert, Offenes bleibt sichtbar
Die Übersicht wird nicht durch Menge zerstört, sondern durch **erledigte** Menge. Verbindlich für jede Liste:
1. **Zuklappen ist nie Verstecken**: Zähler + eine Zeile bleiben immer stehen („✓ 5 bestätigte Zeilen — anzeigen"). Ehrlichkeit gilt auch fürs Falten.
2. **Defaults**: Gruppen, in denen alles bestätigt ist, starten zu; ab 2 bestätigten Zeilen kollabieren sie zu einer Zeile. Offenes/Zu-Prüfendes startet IMMER offen.
3. **Serien statt Einzelkarten**: erkennt die KI ≥ 3 gleichartige Belege (Aussteller + Kategorie + Betrag), wird EIN Vorschlag gezeigt („12× Deutschlandticket — alle übernehmen?"), nie 12 Karten. Violett, wie jeder KI-Vorschlag.
4. **Duplikate beim Upload melden**, nicht still schlucken und nicht still löschen: Warn-Text + „Duplikat löschen / Behalten" — der Nutzer entscheidet.
5. **Slots statt Listen** für Aggregate (siehe Statistik): feste Anzahl Plätze + „Alle im Sheet", nie Endlos-Feed.
6. Suche ab ~10 Einträgen pro Liste; Filter-Chips zuerst, Suche ergänzt.
7. **Toast-Regel**: ~1,4 s für reine Bestätigungen („Kopiert"); ~5 s mit Aktions-Label — nach
   destruktiven Aktionen ist „Rückgängig" im Toast Pflicht. Toasts tragen NIE Lernstoff oder
   Erklärungen (die gehören inline, siehe Stepper-Hinweis im Jahr-Tab) und NIE Demo-Sackgassen
   im Endprodukt — „Demo — …"-Toasts im UI-Kit sind Platzhalter, keine Muster.
8. **Banner vs. Gate-Karte**: `Banner` für jede kurze semantische Meldung ohne eigene Aktionen
   (Warnung, Fehler, Modus-Hinweis) — nie von Hand als Warn-Karte nachbauen. Braucht die Warnung
   Handlungsschritte oder Buttons (GG-Kipp-Gate, Gewerbe-Gate), wird sie zur Karte mit
   Fehler-/Warn-Kontur. Zwei Muster, klare Grenze.
9. **Drei Unterstreichungen, drei Bedeutungen**: gestrichelt-violett = KI-Wert (`KiWert`, nach
   Bestätigung weg) · gepunktet = nachschlagbares Wissen (`Begriff`) · `Pill „Vorläufig"` =
   vorläufige Fakten (z. B. EZB-Kurs bis der amtliche kommt) — vorläufig ist NICHT KI, also nie
   violett stricheln.
10. **Eine Zahlenquelle**: Demo-/Beispielzahlen, die auf mehr als einem Screen auftauchen, leben
    in `ui_kits/app/demo-daten.js` (`window.FunkeDemo`) — nie zweimal als Literal. Ableitbares
    (Deltas, Summen, Ø) wird gerechnet, nie parallel gepflegt. Formatierung ausschließlich über
    `formatZahl`/`formatEuro`/`formatEuroCent` (de-DE). Vollständige Prüfliste:
    `guidelines/qa-checkliste.md`.
Referenz-Implementierungen: `ui_kits/app/Belege.jsx` (Gruppen, Serie, Duplikat), `Uebertragen.jsx` (Zeilen-Kollaps), `Statistik.jsx` (Slots).

## Nicht verhandelbar (überlebt jeden Stack-Wechsel)
Jede Zahl trägt Herkunft · Violett ausschließlich KI · eine Primäraktion pro Screen ·
du-Form, keine Emoji · Grenzen ehrlich benennen · Zustände vollständig definiert.

---

## Nachtrag 07/2026 — Architektur- & Deployment-Rahmen (aus Grilling-Session)

Diese Session hat den Technologie- und Deployment-Rahmen festgelegt, damit die *Umsetzung*
auf sicherem Boden startet. Details je Beschluss in `research/adr/043`–`050`.

**Sprach-Konvention.** Englisch ist der Standard im gesamten Entwicklungsprozess — Code,
Bezeichner, Kommentare, Commit-Messages, PR-Titel/-Beschreibungen, technische Doku. Die
**App-/Produktsprache ist Deutsch** — bewusste Ausnahme, weil SteuerEule gezielt für den
deutschsprachigen Raum ist: nutzerseitige Copy, Fachbegriffe (Anlage N, Herkunft, Fassung) und
die du-Form bleiben Deutsch, ebenso das bestehende deutsche Produkt-/Design-Doku-Korpus
(Guidelines, ADRs).

**Struktur & Werkzeug** (ADR-043)
- Ein **Monorepo** in diesem Repo, **pnpm + Turborepo**.
  `packages/` = `tokens` · `ui` · `core` (UI-freier TS-Fachkern) ·
  `apps/` = `mobile-web` (Expo) · `marketing` (React-DOM) · `api` (NestJS).

**Frontend & Design-System** (ADR-044, 045, 050)
- **Expo + React-Native-Web** — eine App-Codebasis für iOS/Android/Web; die **Marketing-Seite**
  ist **separat** als React-DOM (SEO/First-Paint). Präzisiert ADR-003.
- Das CSS-DS wird zur **visuellen Spezifikation** und einmalig in **RN `StyleSheet`** neu gebaut.
  Tokens über **Style Dictionary** aus `_ds_manifest.json` → CSS-Variablen (Marketing) + typisiertes
  RN-Theme (App). Keine Styling-Framework-Schicht (kein Tamagui/NativeWind) — die Funke-Effekte
  sind bewusst handgemacht.
- **Native (Expo Dev Builds):** Kamera-Scan + **On-Device-OCR**, Push, Biometrie, Secure-Store in
  1.0; Dynamic Island & In-App-Purchase später; Web-Fallbacks (`Platform.OS==='web'`).
- Adherence-Checks aus `_adherence.oxlintrc.json` in die CI (kein Hex/px außerhalb Tokens,
  `data-ai`⇔`--ki`, Touch ≥ 44px, `prefers-reduced-motion`).

**Backend & Daten** (ADR-046, 047)
- **NestJS + Fastify-Adapter**, **nur API** (Web deployt getrennt). **REST + OpenAPI**.
  **better-auth** (Google/Apple/E-Mail/Gast, Identität in eigener EU-Postgres).
- **Prisma** auf **managed EU-Postgres**; **Redis** für Scan-Queues (BullMQ). Fachlogik & jede Zahl
  deterministisch im Backend/`core`.

**KI — LangChain hinter Port, provider-agnostisch** (ADR-048)
- **Determinismus-Grenze:** `core` rechnet (alleinige Zahlenquelle); das LLM schließt nur über
  *aufbereitete* Daten und **füllt ein vorgegebenes Schema** (`withStructuredOutput(zod)`) —
  erfindet nie Zahlen. Architektur-Garantie, keine Prompt-Bitte.
- Hinter einem **`KiService`-Port**; *innen* orchestriert **LangChain.js** (ersetzt den Vercel
  AI SDK — keine zwei überlappenden Abstraktionen). Provider **agnostisch** über LangChains
  Chat-Model-Integrationen (OpenAI/Anthropic/Gemini/OpenRouter, je eigener Key, aktiver Provider
  per Config). **Agents & RAG via LangGraph.js** — v. a. der Eulen-Modus als Rechtsquellen-RAG
  (ADR-039/040/042). Bewusst als **Portfolio-Schaustück** gewählt (gefragte Frameworks).
- **Absicherung:** die aktuelle **v1.x-Linie** pinnen (Stand 07/2026: `langchain@1.5.3`,
  `@langchain/core@1.2.3`, `@langchain/langgraph@1.4.8`, Provider-Pakete entsprechend) und strikt
  hinter dem Port halten (LangChain.js ist mit v1.0 GA, aber jünger als Python — Updates
  kontrolliert, Wechsel bliebe möglich).
- **Datenschutz-Leitplanke:** US-Provider (OpenRouter/OpenAI/Gemini) nur für Dev/nicht-sensibel;
  Produktion mit sensiblen Belegen → EU-getermt/EU-gehostet (Mistral-EU, Gemini via Vertex-EU,
  Anthropic-EU). **Provider-Endwahl offen** bis zur Rechtsklärung — dank Agnostik ein Config-Wechsel.

**Deployment** (ADR-049)
- **k3s auf Hetzner** (EU/DE) — API/Redis/Web-Export/Marketing; **Postgres managed EU**. Das
  kopierte myDevTime-`k8s/`-Gerüst wird auf Steuereule umgebaut.

**Offene Klärung (nicht-technisch):** Datenschutz/Recht entscheidet über den KI-Provider —
ZDR vs. Retention · `inference_geo`+AVV vs. GCP-Bindung · kein Training auf Nutzdaten · ob Belege
überhaupt (auch EU) an ein LLM dürfen oder nur abgeleitete Felder.
