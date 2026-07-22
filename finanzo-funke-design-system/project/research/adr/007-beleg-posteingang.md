# ADR-007 — Beleg-Posteingang: Upload ohne Jahresbindung, Zuordnung als Vorschlag

**Status:** Akzeptiert (Grilling R1, delegiert) · 2026-07-22

**Kontext:** Nutzer fotografieren Belege im Moment des Erhalts, nicht beim Erstellen der Erklärung. Ein Zuordnungszwang beim Upload erzeugt Abbrüche; rein automatische Zuordnung erzeugt stille Fehler (Rechnungsdatum ≠ Zahlungsdatum, § 11 EStG Zufluss/Abfluss).

**Entscheidung:** Belege landen zunächst im **Posteingang** (ungebunden). Die Extraktion schlägt ein Steuerjahr vor (Zahlungsdatum > Belegdatum als Kriterium); ein Tap bestätigt. Ein Steuerjahr kann erst eingereicht werden, wenn sein Posteingang-Zähler für dieses Jahr leer ist oder der Nutzer die offenen Belege explizit übergeht („3 Belege bleiben unzugeordnet").

**Konsequenzen:** Posteingang wird eigene UI-Fläche (existiert als Dokumente-Tab-Bereich). Badge-Zähler nötig. Vorschlags-Chip trägt Herkunft „Regel: Zahlungsdatum".
