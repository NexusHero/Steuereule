# ADR-016 — Minimal-Gate: drei Fragen, Rest on-demand

**Status:** Akzeptiert (Grilling R2, delegiert) · 2026-07-22

**Kontext:** Vollinterview vorab ermüdet (Taxfix-Hauptkritik: „Fragenkatalog"); gar kein Gate zeigt anfangs eine falsche, zu simple App und das Gewerbe-Gate käme zu spät (EÜR-Pfad muss früh abzweigen).

**Entscheidung:** Onboarding stellt genau **drei Fragen**: (1) Woher kam dein Geld? (Anstellung / Selbstständig / beides / mehr), (2) Gearbeitet im Ausland? (→ CH-Gate), (3) Kinder? Alles Weitere (Vermietung, Kapital, Spenden …) wird on-demand hinzugefügt — durch „+ Einkunftsart", durch Beleg-Erkennung oder durch KI-Vorschlag (ADR-014).

**Konsequenzen:** Onboarding bleibt unter 60 Sekunden. Startansicht zeigt nur gewählte Bereiche + eine ruhige „Mehr hinzufügen"-Kachel. Gates 2 und 3 sind die einzigen harten Verzweigungen (Gewerbe → EÜR, Ausland → CH-only-Prüfung).

# ADR-017 — 1.0 kostenlos (Beta), Preis kommt mit ELSTER-Zertifikat

**Status:** Akzeptiert (Grilling R2) · 2026-07-22

**Kontext:** Ohne ELSTER-Zertifikat gibt es keine echte Abgabe — für ein unvollständiges Produkt Geld zu nehmen bricht das Ehrlichkeits-Prinzip.

**Entscheidung:** 1.0 ist **komplett kostenlos als Beta**. Kein Preis-Screen, keine Schloss-Zustände, kein „Premium"-Wording in der UI. Monetarisierung startet erst mit der echten Abgabefähigkeit; Modellentscheidung (pro Einreichung vs. Abo) wird dann getroffen — bewusst offen gelassen.

**Konsequenzen:** UI zeigt dezenten „Beta"-Badge (Einstellungen, nicht auf jedem Screen). Keine Paywall-Komponenten in 1.0 bauen. 2.0-Readme: Preisentscheidung als offener Punkt mit beiden Optionen.

# ADR-018 — Zustandsmaschine: vier Randzustände, zwei davon echte Zustände

**Status:** Akzeptiert (Grilling R2, delegiert) · 2026-07-22

**Kontext:** Happy Path: Entwurf → Prüfung → Eingereicht → Bescheid da → Abgeschlossen. Vier Randfälle standen zur Wahl.

**Entscheidung:**
- **Belege nachgefordert** (Finanzamt fragt nach): **echter Zustand** „Rückfrage" zwischen Eingereicht und Bescheid — eigene UI mit Upload-Aufgabe und Frist.
- **Extern erledigt** (Nutzer reicht direkt via ELSTER ein): **echter Zustand** — Jahr als „extern erledigt" markierbar, App wird Archiv statt leerem Mahnmal.
- **Einreichung scheitert technisch**: KEIN Zustand — die Fassung bleibt in „Prüfung bestanden", der Fehlversuch ist ein Toast + Retry. Ein technischer Fehler darf nie wie ein Steuer-Status aussehen.
- **Frist verpasst**: KEIN Zustand — ein Warn-Banner auf dem Entwurf (Countdown kippt auf Amber/Rot), denn das Jahr bleibt fachlich ein Entwurf.

**Konsequenzen:** Zustandsmaschine 1.0: Entwurf → Prüfung → Eingereicht → (Rückfrage ⇄) → Bescheid da → Abgeschlossen, plus Parallel-Ausgang „Extern erledigt". Fristen-Countdown-Banner existiert bereits, bekommt Kipp-Logik.
