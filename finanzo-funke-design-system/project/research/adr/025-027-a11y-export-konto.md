# ADR-025 — Barrierefreiheit: Stand einfrieren

**Status:** Akzeptiert (Grilling R4) · 2026-07-22

**Entscheidung:** Kontraste und Textgrößen bleiben wie sie sind — kein AA-Programm, keine Systemtextgrößen-Anpassung in 1.0. Design gilt als gut genug; keine Änderungen am bestehenden Design aus A11y-Gründen ohne expliziten Auftrag.

**Konsequenzen:** Kein neuer UI-Aufwand. Offener Punkt für 2.0: Systemtextgröße (ältere Zielgruppe).

# ADR-026 — Export: PDF-Bericht pro Steuerjahr, jederzeit

**Status:** Akzeptiert (Grilling R4) · 2026-07-22

**Kontext:** Nutzer wollen ihre Erklärung dem Steuerberater zeigen, der Bank vorlegen, besitzen.

**Entscheidung:** Jedes Steuerjahr ist jederzeit als **PDF-Bericht** exportierbar: Fassung (alle Posten mit Herkunft) + Belegliste. Gestaltung: nüchtern-sauber mit dezenter Funke-Marke (Kopfzeile) — ein Dokument, das man einem Amt oder Berater vorlegen kann, kein Marketing-Stück. Der Pflicht-Export vor Konto-Löschung (ADR-011) nutzt dasselbe Format + ZIP der Beleg-Dateien.

**Konsequenzen:** Export-Aktion auf dem Steuerjahr-Screen (Teilen-Symbol). PDF-Layout als eigene Design-Aufgabe (2.0-fähig, 1.0 minimal).

# ADR-027 — Identität erst bei echter Abgabe; Multi-Device ohne Verwaltung

**Status:** Akzeptiert (Grilling R4) · 2026-07-22

**Entscheidung:** (a) E-Mail/Google/Apple-Login reicht für 1.0; Identitätsprüfung (IdNr-Abgleich, Zertifikat) kommt erst mit der echten ELSTER-Abgabe (2.0). (b) Multi-Device ohne Geräteverwaltung — wer eingeloggt ist, ist drin; keine Session-Liste, kein Remote-Logout, keine 2FA in 1.0.

**Konsequenzen:** Keine neuen Screens. 2.0-Readme: Identitäts-Flow + Geräteverwaltung als Voraussetzung der Abgabe notieren.
