# 11 — Phase 3: Go-Live-Readiness 1.0

**What to build:** Der Moment, in dem die App „zeigbar" ist: abgabe-bereit-Paket,
Marketing-Website, DSGVO-Final-Audit, Lasttest — und die 1.0-DoD wird gegen den
aufgezeichneten Stakeholder-Durchlauf abgenommen. Die ELSTER-Übermittlung aktiviert sich,
sobald das Zertifikat (Ticket 07) vorliegt; bis dahin Beta kostenlos (ADR-017).

**Blocked by:** 10 — Phase 2: Verbreiterung

**Status:** ready-for-agent

- [ ] Abgabe-bereit-Paket: PDF-Export pro Steuerjahr (ADR-026), Bescheid-Vorbereitung,
      Löschschutz-Semantik für eingereichte Fassungen (ADR-011) soweit ohne echte
      Übermittlung sinnvoll; UI verspricht keine Abgabe vor dem Zertifikat (ADR-005)
- [ ] Marketing-Website (M9) separat nach ADR-044, inkl. Anti-ELSTER-Argumentation
      („Das Amt kennt deine Fahrtkosten nicht")
- [ ] #170 geschlossen: echter Google-OAuth-Handshake mit realen Credentials (kein
      DEV_ONLY-Platzhalter); Register REQ-008 unterscheidet „Button + Plumbing nachgewiesen"
      von „echter Handshake" (Review-Finding I3)
- [ ] DSGVO-Final-Audit vor dem ersten echten Konto: Export/Löschung (REQ-011) gegen die
      echte Umgebung, Datenschutz-Folgeabschätzung mit den Erkenntnissen aus Ticket 07
- [ ] Pre-Go-Live-Lasttest bestanden (1.0-DoD-Kriterium 5)
- [ ] 1.0-DoD-Abnahme: Stakeholder-Durchlauf (Gast → Registrierung → Interview →
      Berechnung → Abgabe-bereit → Export) durch NexusHero + externen Tester, aufgezeichnet;
      alle 1.0-DoD-Kriterien abgehakt
- [ ] Nach Eingang von Ticket 07: ELSTER-Übermittlung aktiviert; Preismodell-Freischaltung
      folgt ADR-017 (zahlen bei Abgabe)

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
