# ADR-0051: Eulen-KI-Modus & Strikte Datenschutz-Grenze

**Status:** Akzeptiert (Ticket 10.9, Product ADRs 037–042) · 2026-11-03

## Kontext
SteuerEule soll über den rein reaktiven Vorschlags-Helfer hinauswachsen und im "Eulen-Modus" proaktiv mitdenken (Musterlücken erkennen, Vorjahresvergleiche ziehen, Gesetzes-/Urteilsänderungen ab 50 € melden). Dabei müssen zwingend eingehalten werden:
1. **Kein PII an externe KI-Modelle:** Keine Klarnamen, keine Steuer-IDs, keine IBANs, keine unredigierten Beleg-PDFs werden je an ein LLM gesendet.
2. **Determinismus-Grenze (ADR-014/048):** KI rechnet niemals Steuerbeträge; alle Beträge stammen deterministisch aus `@steuereule/core`.
3. **StBerG-Grenze (ADR-040):** Bei unklarer Rechtslage darf die KI keine einseitige Rechtsberatung simulieren, sondern stellt den sicheren Weg neben den riskanteren Weg (mit Differenzbetrag) und lässt den Nutzer entscheiden.
4. **Offline / Fallback:** Wenn kein LLM-API-Schlüssel konfiguriert ist oder das Netzwerk offline ist, schlägt der Eulen-Modus deterministisch auf Basis der statischen Wissensbasis an.

## Entscheidung
1. **Core-Engine (`packages/core/src/owl-mode.ts`):**
   - 4 Trigger:
     - `musterluecke` (z.B. Fortbildung erfasst ohne Fahrtkosten/Werbungskosten)
     - `vorjahresvergleich` (z.B. Abweichungen zu Vorjahresposten)
     - `rechtsaenderung` (Urteile/Gesetze mit Auswirkung >= 50 €)
     - `lebenslage_hinweis` (Belege deuten auf nicht angelegte Lebenslage hin)
   - Kartendisziplin: Nur Funde >= 50 € kommen proaktiv ins Cockpit; alles andere wartet auf Abruf im Berater-Tab.
   - Verworfene Karten werden per Fingerprint-Hash (`sha256`) dauerhaft unterdrückt, bis neue Fakten hinzukommen.
   - Archiv-Wache: Beobachtung von bestandskräftig noch offenen Jahren im Einspruchsfenster.

2. **API & Service-Grenze (`apps/api/src/ki/`):**
   - Eulen-Modus-Einstellungen (`optIn`, `aktiviertAm`) und Karten-Verwürfe (`fingerprint`) werden verschlüsselt gespeichert.
   - Anfragen an den LLM-Adapter werden strikt anonymisiert (nur aggregierte Posten und anonyme Metadaten).
   - Bei fehlendem API-Schlüssel liefert der deterministische Fallback exakt dieselben fundierten Regelsätze.

3. **UI (`apps/mobile-web`) — Update `#446` (Cockpit ↔ Eulen-Modus Split-Pane App-Agent):**
   - **Strikte Modus-Trennung:** Das **Cockpit** (`Cockpit`, `Belege`, `Profil`) bleibt ruhig ohne permanente Sidebars, Docks oder Diff-Overlays. Der aktive Co-Pilot lebt im dedizierten **Eulen-Modus** (`🦉 Eule` / Kachel im Cockpit).
   - **3-Breakpoint-Workbench (`OwlModeScreen`):** Desktop (62 % linke Werkbank mit Artefakten/Diff-Review & inline Fachmasken / 38 % KI-Chat rechts), Tablet (Split-View/Slide-Over-Drawer) und Mobile (maximierter Chat mit 20-%-Mini-Dock unten).
   - **Drafts, Stale-Check & Hard-Lock:** Entwürfe (`pending` / `superseded` / `applied` / `undone`) werden mit `expectedPreviousValue` per Stale-Check (`409`) einzeln oder per `apply-batch` atomar übernommen; `profil`, `stammdaten` und `kopplung` sind per `403 AI_WRITE_FORBIDDEN` hart für die KI gesperrt.
   - Violette Signalfarbe (`--ki`) ausschließlich für KI-Meinungen; Theme-Tokens konsequent über `useTheme()` (`tokens.dark`-kompatibel).

## Nachtrag `#446` — Review-Befunde aus PR #447

Die Review deckte auf, dass „atomar“ und „strikt anonymisiert“ im Code nicht galten. Festgelegt wird:

4. **Übernahme als Unit of Work (`apps/api/src/prisma/transaction.ts`):**
   - `apply`, `apply-batch` und `undo` laufen in **einer** Datenbanktransaktion (`TransactionRunner`, Isolationsstufe *Repeatable Read*). Die Repositories bleiben unverändert: Der verschlüsselte Prisma-Client leitet Aufrufe per `AsyncLocalStorage` in die laufende Transaktion, und ihre eigenen `$transaction([...])`-Batches treten ihr bei. Kompensierende Rück-Schreibvorgänge entfallen.
   - Jeder geschriebene Wert ist ein **Compare-and-Set** gegen die beim Entwurf gelesene Rohwert-Baseline, auch für Begleitfelder (`companionExpectedValues`). Eine gleichzeitige Masken-Änderung zwischen Prüfung und Schreiben endet als `409 CONCURRENT_WRITE_CONFLICT` statt als verlorenes Update.
   - Ein `409 ADVISOR_ACTION_STALE_CONFLICT` nennt in `details.conflicts` alle betroffenen Felder mit ihrem aktuellen Wert. „Mit neuem Stand übernehmen“ schickt genau diese Werte als `acknowledgedCurrentValues` zurück. Das bleibt ein Compare-and-Set, kein Überschreiben ohne Prüfung.
   - `undo` stellt Wert **und** Herkunftsmarkierung exakt wieder her (`undoSnapshot`, serverintern) und verweigert sich, wenn das Feld nach der Übernahme manuell geändert wurde.
   - Die Feldsperre (`apps/api/src/confirmation/ai-write-policy.ts`) gilt auf dem **Schreibpfad**, nicht nur beim Vorschlag, und ebenso für Begleitfelder.
   - Nachvollziehbarkeit: Jede übernommene Aktion trägt `appliedAt` bzw. `undoneAt` neben Feld, Werten, Rechtsquelle und Engine (Modus/Anbieter/Modell) in ihren Nachrichten-Metadaten. Das Audit-Log bleibt bei „wer/was/wann“ ohne wertführende Spalte (REQ-004.5).

5. **Beleg-Isolation:** Ein Belegbild verlässt das System nur, wenn der Vision-Slot dafür ausdrücklich freigegeben ist (`AI_VISION_ALLOW_DOCUMENT_IMAGES`, nur für Anbieter mit EU-AVV). Andernfalls geht nur geschwärzter Text hinaus (Namen aus Profil und Kindern). Der Dateiname wird nie gesendet. Gespeichert und später dem Chat-Modell als Verlauf gezeigt wird ausschließlich eine Zusammenfassung aus validierten Strukturfeldern, nie Freitext aus Dokument oder Modell.

6. **Turn-Budget & Stream-Protokoll:** Timeout (25 s), Tool-Runden (5) und Tageskontingent (50) kommen aus `AiRuntimeConfigService.resolveLimits()`. Client-Abbruch und Timeout brechen den kostenpflichtigen Modellaufruf per `AbortSignal` ab. Tool-Argumente werden gegen dieselben Zod-Schemas geprüft, die das Modell sieht. Das SSE-Protokoll kennt zusätzlich `ui_command` (gesperrtes Feld → Werkbank öffnet die Maske zur manuellen Eingabe) und `error`. Eine abgebrochene Teilantwort wird nie als vollständige Antwort gespeichert. `done` trägt `mode`, damit die UI den **Basis-Modus** kennzeichnen kann.
