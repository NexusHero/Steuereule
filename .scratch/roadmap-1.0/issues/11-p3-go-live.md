# 11 — Phase 3: Go-Live-Readiness 1.0

**What to build:** Der Moment, in dem die App „zeigbar" ist: abgabe-bereit-Paket,
Marketing-Website, DSGVO-Final-Audit, Lasttest — und die 1.0-DoD wird gegen den
aufgezeichneten Stakeholder-Durchlauf abgenommen. Die ELSTER-Übermittlung aktiviert sich,
sobald das Zertifikat (Ticket 07) vorliegt; bis dahin Beta kostenlos (ADR-017).

**Blocked by:** 10 — Phase 2: Verbreiterung

**Status:** ready-for-agent

**Umgeplant durch ADR-0050 (2026-10-28):** ELSTER ist kein 1.0-Kriterium mehr; 1.0 gibt auf Papier ab.

- [ ] **Formular-Ausdruck** pro Steuerjahr auf amtlichen Vordruck-Vorlagen (ESt 1 A + belegte
      Anlagen), Regeln nach BMF-Schreiben vom 12.08.2022; Vorlagen liegen unter
      `apps/api/assets/vordrucke/<jahr>/` (NexusHero beschafft sie), jede Feldposition gegen die
      Vorlage getestet; Download hinter `FreischaltungService.status()` — **wartet auf die Vorlagen**
- [ ] Klärung durch Steuerberater/Finanzamt: befülltes Portal-PDF („NET") vs. nichtamtlicher
      Vordruck (Graurasterung, Herstellerangabe)
- [x] Bezahlte Freischaltung pro Steuerjahr (Stripe Checkout, Webhook-Signatur, § 356 Abs. 5 BGB) — REQ-029
- [x] E-Mail-Versand produktiv (Brevo, EU) — #83
- [x] Rechtsseiten (Impressum, Datenschutz, AGB/Widerruf, Hinweise) im Produkt — **Entwurf**
- [ ] Rechtsseiten anwaltlich geprüft; Anbieterdaten (`EXPO_PUBLIC_BETREIBER_*`) gesetzt;
      AGB-URL im Stripe-Dashboard hinterlegt
- [x] DSGVO-Lücken vor dem Audit geschlossen: Löschung erfasst alle Steuerdaten, Export enthält sie
- [ ] Marketing-Website (M9) separat nach ADR-044
- [ ] #170 geschlossen: echter Google-OAuth-Handshake mit realen Credentials
- [ ] DSGVO-Final-Audit gegen die echte Umgebung (AV-Verträge Hosting/Brevo, DSFA)
- [ ] Pre-Go-Live-Lasttest bestanden (1.0-DoD-Kriterium 5)
- [ ] 1.0-DoD-Abnahme: Stakeholder-Durchlauf (Gast → Registrierung → Interview → Berechnung →
      Bezahlen → Ausdruck → Export) durch NexusHero + externen Tester, aufgezeichnet

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
