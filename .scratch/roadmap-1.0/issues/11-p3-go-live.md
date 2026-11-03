# 11 — Phase 3: Go-Live-Readiness 1.0

**What to build:** Der Moment, in dem die App „zeigbar" ist: abgabe-bereit-Paket,
Marketing-Website, DSGVO-Final-Audit, Lasttest — und die 1.0-DoD wird gegen den
aufgezeichneten Stakeholder-Durchlauf abgenommen. Die ELSTER-Übermittlung aktiviert sich,
sobald das Zertifikat (Ticket 07) vorliegt; bis dahin Beta kostenlos (ADR-017).

**Blocked by:** 10 — Phase 2: Verbreiterung

**Status:** in-progress — Entwurfs-PR #380 (release-1.0-papierweg); offen: NET-Vordruckfrage, Rechtsprüfung, Google-OAuth #170, DSGVO-Final-Audit, DoD-Abnahme

**Umgeplant durch ADR-0050 (2026-10-28):** ELSTER ist kein 1.0-Kriterium mehr; 1.0 gibt auf Papier ab.

- [x] **Formular-Ausdruck 2025, erster Schnitt:** ESt 1 A + Anlage N auf den amtlichen
      Vorlagen (vermessen, nicht getippt), Stammdaten-Erfassung (REQ-030), Download hinter der
      Freischaltung (REQ-031), Ausdruck-Seite im Web
- [x] Ausdruck Anlage R (gesetzliche/Witwen-/private Rente); Sperre + Vorprüfung vor der Zahlung
      für noch nicht druckbare Anlagen
- [x] Ausdruck Anlage V — braucht Objekt-Anschrift, Wohnfläche und aufgeschlüsselte
      Werbungskosten (heute nur eine Summe); Vorlage liegt vor
- [x] Ausdruck weitere Anlagen: KAP, Kind, N-Gre, Sonderausgaben (vermessen und implementiert auf
      amtlichen 2025 BMF-Vorlagen). Anlage Vorsorgeaufwand wird bewusst nicht gedruckt: ihre
      Arbeitnehmer-Zeilen (LStB Nr. 22/23/25–27) sind ⓔ-Zeilen, die das Finanzamt elektronisch hat;
      ein Wert dort übersteuert die Meldung. (Vorher landete die KV+PV-Summe aus dem Interview in Kz 320.)
- [x] Anlage AV: Kz 106 als Ziffer (1 = unmittelbar, 2 = mittelbar in Zeile 14), bei unmittelbar
      Kz 100 (beitragspflichtige Einnahmen des Vorjahres) aus zwei neuen Interview-Folgefragen;
      fehlen sie, sperrt der Ausdruck mit Weg zu den Sonderausgaben-Fragen. Offen: Person B (Kz 306/300)
      und die selteneren Zeilen 6–13 (Beamte, Entgeltersatz, Erwerbsminderungsrente u. a.)
- [x] Anlage Kind für minderjährige Kinder in Zusammenveranlagung: Familienkasse (Z. 7), Wohnsitz im
      Inland vom–bis (Z. 8), Kindschaftsverhältnis zu A und B (Kz 02/03); Nachname nur bei Abweichung.
      Fehlende Angaben sperren mit Weg zum Kinder-Screen (dort jetzt auch Bearbeiten).
- [x] Anlage Kind, anderer Elternteil außerhalb dieser Erklärung (Alleinerziehende, Einzelveranlagung,
      Stiefkind): Z. 11/12 mit Dauer des Kindschaftsverhältnisses, Z. 14 (verstorben, Kz 06),
      Z. 15 (nicht zu ermitteln, Kz 05)
- [x] Entlastungsbetrag für Alleinerziehende (§ 24b EStG, Anlage Kind Z. 45–48): ganzjährig gemeldet
      und Kindergeld ganzjährig erhalten (pro Kind), keine weitere volljährige Person (Interview-Eintrag
      „alleinerziehend“) → Kz 42/44 vom–bis, Kz 46/49 = 2. Teilzeiträume und „Ja“ in Z. 47/48 werden
      nicht beantragt (Hinweis im Kinder-Screen)
- [ ] Anlage Kind, noch ehrlich gesperrt: anderer Elternteil im Ausland (Z. 13), volljährige Kinder
      (Z. 16 ff.), Wohnsitz des Kindes im Ausland (Z. 9); Kinderbetreuungskosten werden nicht erfasst
- [x] Verheiratete: Veranlagungsart + Person B erfassen, dann Zeilen 19–24 ausdrucken
- [ ] Klärung durch Steuerberater/Finanzamt: befülltes Portal-PDF („NET") vs. nichtamtlicher
      Vordruck (Graurasterung, Herstellerangabe)
- [x] Bezahlte Freischaltung pro Steuerjahr (Stripe Checkout, Webhook-Signatur, § 356 Abs. 5 BGB) — REQ-029
- [x] E-Mail-Versand produktiv (Brevo, EU) — #83
- [x] Rechtsseiten (Impressum, Datenschutz, AGB/Widerruf, Hinweise) im Produkt — **Entwurf**
- [ ] Rechtsseiten anwaltlich geprüft; Anbieterdaten (`EXPO_PUBLIC_BETREIBER_*`) gesetzt;
      AGB-URL im Stripe-Dashboard hinterlegt
- [x] DSGVO-Lücken vor dem Audit geschlossen: Löschung erfasst alle Steuerdaten, Export enthält sie
- [x] Marketing-Website (M9) separat nach ADR-044 (apps/website)
- [ ] #170 geschlossen: echter Google-OAuth-Handshake mit realen Credentials
- [ ] DSGVO-Final-Audit gegen die echte Umgebung (AV-Verträge Hosting/Brevo, DSFA)
- [x] Pre-Go-Live-Lasttest bestanden (1.0-DoD-Kriterium 5, scripts/loadtest/loadtest.mjs)
- [ ] 1.0-DoD-Abnahme: Stakeholder-Durchlauf (Gast → Registrierung → Interview → Berechnung →
      Bezahlen → Ausdruck → Export) durch NexusHero + externen Tester, aufgezeichnet

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
