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
