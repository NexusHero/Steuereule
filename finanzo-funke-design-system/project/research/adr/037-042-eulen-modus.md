# ADR-037 — Eulen-Modus: die proaktive Stufe über dem Berater

**Status:** Vorgeschlagen (Grilling KI-Stufe R1–R3) · 2026-07-22

**Kontext:** Die KI soll vom Vorschlags-Helfer zum Steuerberater-Ersatz wachsen — Gesetze lesen, nachfragen, den Einzelfall beraten — ohne die bestehenden Vertrauensregeln (KI schlägt vor, entscheidet nie; Herkunft an jeder Zahl; Violett nur für KI) zu verlieren.

**Entscheidung:** „Eulen-Modus" ist eine **opt-in Stufe** über dem bestehenden Berater — **ein Wesen**, kein zweiter Charakter: der Berater-Tab bekommt im Eulen-Modus die aktive Fragen-Funktion dazu. Opt-in-Moment: **letzter Schritt nach dem Interview** („Soll ich ab jetzt mitdenken?"); der Profil-Schalter bleibt zum Abschalten. Stufe 1 (reaktiver Berater, Beleg-Vorschläge) bleibt unverändert erhalten.

# ADR-038 — Auslöser und Dosierung

**Entscheidung:** Vier zulässige Auslöser: (1) Lücke im Muster (Fortbildung ohne Fahrtkosten), (2) Vergleich mit ähnlichen Fällen, (3) neues Gesetz/Urteil betrifft vorhandene Posten, (4) Beleg deutet auf nicht angelegte Lebenslage. **Proaktiv ins Cockpit** kommen nur Gesetzes-/Urteils-Funde, die den konkreten Fall betreffen, **mit Betrag und ab ≈50 €** — alles andere wartet **auf Abruf**: „Was würdest du mich fragen?" im Berater-Tab (+ violette Einstiegs-Karte „Ich hätte 4 Fragen an dich" im Cockpit). Im Abruf: **eine Frage nach der anderen**, wie im Gespräch, mit „Nächste".

# ADR-039 — Quellen und Prüfstand

**Entscheidung:** Rechtsquellen erscheinen **menschlich übersetzt** („Gerichte haben entschieden, dass …") **+ Link** zur Quelle — kein Aktenzeichen im UI. Unter den Fund-Karten steht eine dezente Zeile **„Rechtsstand: TT.MM.JJJJ"**; der Leerlauf ist ehrlich: „Nichts offen. Zuletzt geprüft: heute, 14:02."

# ADR-040 — Unsicherheit und StBerG-Grenze

**Entscheidung:** Bei unklarer Rechtslage empfiehlt die Eule den **sicheren Weg** und zeigt den riskanteren **transparent daneben** (mit Differenzbetrag und Risiko-Satz). **Empfehlen** („bei dir lohnt X") darf sie nur bei **eindeutiger Rechtslage**; sonst rechnet sie beide Wege und zeigt sie („Weg A ergibt X €, Weg B ergibt Y €") — der Nutzer entscheidet immer per Tap. Das hält uns auf der Software-Seite des Steuerberatungsgesetzes.

# ADR-041 — Fehlerfall und Karten-Lebenszyklus

**Entscheidung:** Jede Fund-/Frage-Karte trägt einen **„Stimmt nicht"-Knopf** — die Eule bedankt sich, das Muster wird sichtbar seltener. **Verworfene** Karten kehren nur zurück, wenn **neue Fakten** auftauchen (neuer Beleg, neues Urteil); nie als bloße Wiederholung. Ton: Eulen-Stimme, frech & kurz („Mir fällt auf: Fortbildung ohne Fahrtkosten. Bist du geflogen?") — bei allem Kritischen gilt weiter ADR-023 (nüchtern).

# ADR-042 — Archiv-Wache

**Entscheidung:** Der Eulen-Modus wacht auch über **abgegebene Jahre**: Betrifft ein neues Urteil ein Jahr im Einspruchsfenster, erscheint eine **Einspruchsfrist-Karte** (nüchtern nach ADR-023, mit Frist und Betrag). Der stärkste „ersetzt den Steuerberater"-Moment — kein Mensch prüft alte Bescheide gegen neue Urteile.

# Violett-Regel (Ergänzung zu bestehender KI-Farbregel)

Kern-Aussagen der Eule sind violett (`--ki`), die Karten selbst bleiben neutral mit KI-Chip — die Ruhe-Hierarchie (normale Karten flüstern) bleibt trotz mehr KI-Fläche erhalten.
