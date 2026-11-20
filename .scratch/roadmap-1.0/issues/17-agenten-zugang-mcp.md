# 17 — Agenten-Zugang: der eigene KI-Assistent füllt die Erklärung aus (ADR-0052)

**What to build:** Ein Nutzer verbindet seinen eigenen KI-Assistenten (Claude, Gemini, DeepSeek …)
über einen MCP-Server mit OAuth mit seinem Konto. Der Assistent füllt alle Steuerfakten aus und lädt
Belege hoch; alles bleibt „unbestätigt“, bis der Nutzer es je Anlage in der App bestätigt. Erst dann
sind Ausdruck und Bezahlung möglich. Kontoaktionen, Einwilligungen und das Bezahlen selbst bleiben
beim Menschen.

**Blocked by:** ADR-0052 akzeptiert (Review Musti) · Dateiablage (17.4) hängt an #292 (Infrastruktur)

**Status:** in Arbeit — 17.1 und 17.3b fertig (PR #539); Entscheidungen in ADR-0052 und den Amendments 1–3
(Lesesicht gegrillt am 20.11.2026); Refinement für 17.6–17.13 (REQ, Given–When–Then) steht aus

**Blocks:** 11 (Go-Live wartet laut ADR-0052 auf diesen Block) · **Board:** Epic #383

## Slices (in Abhängigkeitsreihenfolge)

- [x] #384 **17.1 Herkunft und Bestätigung für jede Maske** — Kennzeichnungs-Schicht aus ADR-0049
      verallgemeinern (Herkunft + Bestätigungsstand je Wert); Vorprüfung, Ausdruck und Bezahlung
      behandeln „unbestätigt“ wie offen; Bestätigungs-Screen je Anlage; Konfliktregel „Nutzer
      gewinnt“ (Agent-Wert wird Vorschlag). Tier T1.
- [ ] #385 **17.2 OAuth-Provider** — better-auth-Plugin, Scopes, Einwilligungsseite mit Assistenten-Name
      und Drittland-Hinweis, Übersicht „Verbundene Assistenten“ (Widerruf wirkt sofort), Bearer-Token
      in Guards, Rate-Limits und Audit; ausgeschlossene Aktionen serverseitig verweigert. Tier T1.
- [ ] #386 **17.3 MCP-Server** — fachliche Werkzeuge (Stand, Vorprüfung, je Maske eintragen, Beleg
      hochladen, Eulen-Hinweise, Zahllink); Maskierung von Steuer-ID, IBAN, Adresse und Namen Dritter
      beim Lesen; CI-Test mit echtem MCP-Client (Verbinden → Eintragen → Bestätigen → Widerruf). Tier T1.
- [x] #539 **17.3b Beratung, Person B, Kinder, Anmeldung, Rücknahme** (ADR-0052 Amendment 2) — 11
      deterministische Beratungswerkzeuge, `steuerbericht`, `offene_fragen` (alle Bereiche),
      `auswirkung_simulieren`, `maske_felder`; `person` A/B samt Bestätigung für Person B; Kinder
      anlegen/auflisten/entfernen; `eintrag_zuruecknehmen`; Anmeldung für Standard-MCP-Clients
      (RFC 9728/8414/8707, JWT mit Widerruf über die Einwilligung); Login/Registrierung führen zur
      Freigabe. Mit echtem MCP-Client lokal geprüft, Echtdatenlauf 2024.
- [ ] #387 **17.4 Dateiablage für Belege** — EU-Objektspeicher, Verschlüsselung, Typ-/Größenprüfung,
      Virenscan, DSGVO-Export und Löschung. Tier T1, abhängig von #292.
- [ ] #388 **17.5 Recht und Datenschutz** — StBerG-Abgrenzung, Datenschutz-Folgenabschätzung,
      Datenschutzerklärung (Drittland), AGB-Klausel zur Verantwortung für bestätigte Werte; Teil der
      1.0-Abnahme (#329, Ticket 11).

- [ ] #542 **17.6 Lesesicht und Datenminimierung** (Amendment 3, 1–6, 8–9) — `maske_lesen(screen, person)`
      mit Wert, Stand und Herkunft je Feld; `haushalt_ueberblick` ersetzt `steuerjahr_stand` (Alter,
      Bundesland, Familienstand/Veranlagung, Berufsgruppe, Kinder als Nummer und Alter); Belege lesen
      ohne Dateinamen; Dritte nur als Rolle und Land; Freitext nur „gesetzt“; Steuer-ID und IBAN nie.
      DSFA (`docs/legal/agenten-zugang-dsfa-stberg.md`) nachziehen. Tier T1.
- [ ] #543 **17.7 Kirchensteuerpflicht ohne Konfession** (Amendment 3, 7) — neue Angabe „kirchensteuerpflichtig
      ja/nein“ je Person; Schätzung nutzt sie, solange keine Konfession eingetragen ist; Konfession des
      Nutzers gewinnt, Widerspruch und fehlende Konfession als Lücke im Bericht; Religionsschlüssel über
      MCP nicht mehr beschreibbar. Tier T1 (Art. 9).
- [ ] #544 **17.8 Stapel-Eintrag** — `maske_eintragen_stapel(screen, person, instance, felder{})`: viele Felder
      einer Maske in einem Aufruf, Ergebnis je Feld (geschrieben / Vorschlag / abgelehnt mit Grund), keine
      Teil-Transaktion über Masken hinweg. Im Lauf 2024 waren es 134 Einzelaufrufe. Tier T2.
- [ ] #545 **17.9 Schätzung aufschlüsseln** — Rechenweg der App-Schätzung: Einkünfte und Werbungskosten je
      Person, Vorsorge nach Bausteinen, Sonderausgaben, Kinderfreibetrag gegen Kindergeld, § 35a,
      tarifliche Steuer, Anrechnungen, Vorauszahlungen. Im Lauf 2024 ließ sich 52.358 € ESt gegen 47.388 €
      Tarif nicht erklären. Blocks 17.10. Tier T2.
- [ ] #546 **17.10 Bescheid-Abgleich** — Bescheidwerte eintragen (Maske `assessment`), Unterschied zur
      Erklärung je Position mit Wirkung und Einspruchsfrist zurück (vorhandene Bescheidprüfung,
      Jahresverlauf). Blocked by #545 (17.9). Tier T2.
- [ ] #547 **17.11 Prüfregeln, Ausdruck-Plan, Aufgaben an den Nutzer** — feste Plausibilitätsregeln und der
      Plan „was schließt welche Lücke, wer tut es“ wie beim In-App-Berater; der Assistent legt Aufgaben
      in die App, die nur der Nutzer erledigen kann (Konfession, Einwilligung, Bestätigen), sichtbar im
      Cockpit. Tier T2.
- [ ] #548 **17.12 Komfort-Werkzeuge** — Veranlagungsvergleich aus den Falldaten; Szenario über mehrere
      Felder; amtliche Wechselkurse (Monat/Jahr); Vordruck-Zeilen je Wert; Feld finden per Stichwort;
      Vorjahreswerte (Jahresübernahme) und Fristen. Tier T3.
- [ ] #549 **17.13 Vermietung und Buchungen** — Vermietungsobjekte anlegen/entfernen (wie Kinder); Buchungen
      und Anlagegüter für Selbstständige als Entwurf wie `stage_booking_draft` (ADR-0101 §18). Tier T1.

## Nicht Teil davon

- Ein Agent, den SteuerEule selbst betreibt; Zugriff Dritter für viele Nutzer; Gast-Sitzungen.
- Serverseitiges Auslesen von Belegen (OCR) — das macht der Assistent.
- Konto löschen, Zugangsdaten, Geräte, Einwilligungen und Bezahlen über die Schnittstelle.
