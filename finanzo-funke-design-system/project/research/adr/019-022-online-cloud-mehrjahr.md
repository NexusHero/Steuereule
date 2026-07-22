# ADR-019 — Reine Online-App

**Status:** Akzeptiert (Grilling R3) · 2026-07-22

**Kontext:** Offline-first bedeutet Sync-Konfliktauflösung — teuer und fehleranfällig bei maximal sensiblen Daten. KI-Extraktion und BMF-Kurse brauchen ohnehin Netz.

**Entscheidung:** 1.0 ist **online-only**. Ohne Netz: Splash + ehrlicher Hinweis („SteuerEule braucht Internet — deine Daten liegen sicher auf EU-Servern"). Einzige Ausnahme: ein bereits angefangenes Beleg-Foto wird lokal gepuffert und beim nächsten Netz hochgeladen (kein Datenverlust im Funkloch).

**Konsequenzen:** Offline-Zustand ist ein Screen, kein Feature. Kamera-Puffer als einzige Offline-Logik. Kein Sync-Konflikt-UI nötig.

# ADR-020 — Daten in der EU-Cloud, Multi-Device inklusive

**Status:** Akzeptiert (Grilling R3) · 2026-07-22

**Kontext:** Steuerdaten sind Art.-9-nah (Religion, Behinderung). Kopplung (ADR-006) und Gerätewechsel brauchen einen Server.

**Entscheidung:** Daten leben in der **EU-Cloud**, Ende-zu-Ende-Verschlüsselung wo technisch möglich (Belege, Freitexte). Multi-Device ist Standard. Die UI verspricht konkret: „EU-Server · verschlüsselt · kein Verkauf von Daten" — und nichts darüber hinaus.

**Konsequenzen:** Vertrauens-Zeile im Onboarding + Einstellungen (existiert teils). Kein „lokal only"-Modus, keine Wahl-UI. Konto-Volllöschung (ADR-011) löscht serverseitig, mit Export-Zwischenschritt.

# ADR-021 — Jahresübernahme: alles kopieren, aber als „unbestätigt" markiert

**Status:** Akzeptiert (Grilling R3) · 2026-07-22

**Kontext:** Leer starten nervt, blind kopieren erzeugt stille Fehler (Jobwechsel, Umzug).

**Entscheidung:** Neues Jahr **kopiert alles** aus dem Vorjahr. Schutz gegen stille Fehler: jeder kopierte Posten trägt Herkunft „Übernahme aus 2025" und gilt als **unbestätigt**, bis der Nutzer ihn antippt oder ein Beleg ihn deckt. Unbestätigte Posten zählen in die Spanne (ADR-015), nicht in den Punktwert; Einreichung listet sie im Prüf-Screen gesammelt.

**Konsequenzen:** Neuer Posten-Zustand „unbestätigt" (gleiche Mechanik wie Konflikt, ruhigerer Ton — grau, nicht Amber). Prüf-Screen bekommt Kategorie „Aus dem Vorjahr übernommen — stimmt das noch?".

# ADR-022 — Rückwirkende Jahre als beworbener Einstiegspunkt

**Status:** Akzeptiert (Grilling R3) · 2026-07-22

**Kontext:** Freiwillige Abgabe geht 4 Jahre zurück — oft mehrere Erstattungen auf einmal; stärkster Akquise-Hebel (Zasta-Modell). Kosten: 4 Jahresregelwerke (Pauschalen ändern sich jährlich).

**Entscheidung:** 1.0 unterstützt **bis zu 4 Rückjahre** und bewirbt es aktiv („Hol dir 4 Jahre auf einmal"). Jahresregelwerke (Pauschalen, Freibeträge pro Jahr) sind Backend-Konfiguration; die UI zeigt immer die Regeln des gewählten Jahres, nie „aktuelle" Werte.

**Konsequenzen:** Jahr-Auswahl wird prominenter Einstieg (Onboarding + Dashboard). Herkunfts-Chips zeigen Jahresbezug („Pauschale 2023: 1.230 €"). Statistik-Seite profitiert direkt (mehrjährige Daten ab Tag 1).
