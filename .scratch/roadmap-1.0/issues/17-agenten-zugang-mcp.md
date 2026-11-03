# 17 — Agenten-Zugang: der eigene KI-Assistent füllt die Erklärung aus (ADR-0052)

**What to build:** Ein Nutzer verbindet seinen eigenen KI-Assistenten (Claude, Gemini, DeepSeek …)
über einen MCP-Server mit OAuth mit seinem Konto. Der Assistent füllt alle Steuerfakten aus und lädt
Belege hoch; alles bleibt „unbestätigt“, bis der Nutzer es je Anlage in der App bestätigt. Erst dann
sind Ausdruck und Bezahlung möglich. Kontoaktionen, Einwilligungen und das Bezahlen selbst bleiben
beim Menschen.

**Blocked by:** ADR-0052 akzeptiert (Review Musti) · Dateiablage (17.4) hängt an #292 (Infrastruktur)

**Status:** ready-for-refinement — Entscheidungen aus der Grilling-Session 2026-11-05 in ADR-0052;
Refinement je Slice (REQ, Given–When–Then, Risiko-Tier) steht aus

**Blocks:** 11 (Go-Live wartet laut ADR-0052 auf diesen Block) · **Board:** Epic #383

## Slices (in Abhängigkeitsreihenfolge)

- [ ] #384 **17.1 Herkunft und Bestätigung für jede Maske** — Kennzeichnungs-Schicht aus ADR-0049
      verallgemeinern (Herkunft + Bestätigungsstand je Wert); Vorprüfung, Ausdruck und Bezahlung
      behandeln „unbestätigt“ wie offen; Bestätigungs-Screen je Anlage; Konfliktregel „Nutzer
      gewinnt“ (Agent-Wert wird Vorschlag). Tier T1.
- [ ] #385 **17.2 OAuth-Provider** — better-auth-Plugin, Scopes, Einwilligungsseite mit Assistenten-Name
      und Drittland-Hinweis, Übersicht „Verbundene Assistenten“ (Widerruf wirkt sofort), Bearer-Token
      in Guards, Rate-Limits und Audit; ausgeschlossene Aktionen serverseitig verweigert. Tier T1.
- [ ] #386 **17.3 MCP-Server** — fachliche Werkzeuge (Stand, Vorprüfung, je Maske eintragen, Beleg
      hochladen, Eulen-Hinweise, Zahllink); Maskierung von Steuer-ID, IBAN, Adresse und Namen Dritter
      beim Lesen; CI-Test mit echtem MCP-Client (Verbinden → Eintragen → Bestätigen → Widerruf). Tier T1.
- [ ] #387 **17.4 Dateiablage für Belege** — EU-Objektspeicher, Verschlüsselung, Typ-/Größenprüfung,
      Virenscan, DSGVO-Export und Löschung. Tier T1, abhängig von #292.
- [ ] #388 **17.5 Recht und Datenschutz** — StBerG-Abgrenzung, Datenschutz-Folgenabschätzung,
      Datenschutzerklärung (Drittland), AGB-Klausel zur Verantwortung für bestätigte Werte; Teil der
      1.0-Abnahme (#329, Ticket 11).

## Nicht Teil davon

- Ein Agent, den SteuerEule selbst betreibt; Zugriff Dritter für viele Nutzer; Gast-Sitzungen.
- Serverseitiges Auslesen von Belegen (OCR) — das macht der Assistent.
- Konto löschen, Zugangsdaten, Geräte, Einwilligungen und Bezahlen über die Schnittstelle.
