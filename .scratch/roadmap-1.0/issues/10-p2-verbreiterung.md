# 10 — Phase 2: Verbreiterung

**What to build:** Die Breite der 1.0-Vision auf dem stabilen Kern: ganzjährige Beleg-Inbox,
Günstigerprüfung Zusammen/Einzel, Bescheidprüfung (PDF + manuell), Rentner, Kapital,
Vermietung (einfach), Fristen-Warnmodus, Jahresübernahme und rückwirkende Jahre, Eulen-KI-Modus.
Was die Kapazität reißt, bleibt ehrlich gegated (NexusHero-Entscheidung, sichtbar im Register).

**Blocked by:** 08 — Phase 1a: Angestellte-Vertikale · 09 — Phase 1b: Grenzgänger-CH-Vertikale

**Status:** ready-for-agent

- [ ] Beleg-Inbox ganzjährig (M3): Saison-Zustand im Belege-Tab, Upload ohne Jahresbindung,
      Zuordnung als Vorschlag (ADR-007)
- [ ] Günstigerprüfung Zusammen/Einzel als Screen: zwei Zahlen + Empfehlung (M1)
- [ ] Bescheidprüfung 1.0: PDF-Import + manueller Betrag, Abgleich (M7); Einspruch-Flow
      nach Bescheid vs. Korrektur davor (ADR-009)
- [ ] Rentner (ADR-034, Anlage R), Kapital inkl. ausländische Broker (ADR-032; Krypto
      explizit 2.0), Vermietung einfach (ADR-033; Verkauf/möbliert bleibt Gate)
- [ ] Fristen-/Verspätungszuschlag-Warnmodus ab 60 Tage vor Frist (M6, § 152 AO);
      Jahresübernahme als Kopie mit „unbestätigt"-Marker (ADR-021); rückwirkende Jahre
      bis 4 (ADR-022)
- [ ] Eulen-Modus (ADR-037–041): 4 Auslöser, proaktiv nur Gesetzes-Funde ≥ 50 €, Quellen
      menschlich übersetzt + Link, Rechtsstand-Zeile, „Stimmt nicht"-Knopf, sicherer Weg
      bei Unsicherheit (StBerG); Violett ausschließlich für KI-Output (ADR-002)
- [ ] Register: alle neuen REQs nach REQ-DoD abgenommen; gegatete Punkte als solche markiert

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
