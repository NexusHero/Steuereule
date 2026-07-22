# ADR-023 — Fehlerton: warm beim ersten Mal, nüchtern wenn es ernst wird

**Status:** Akzeptiert (Grilling R3, delegiert) · 2026-07-22

**Kontext:** Der Funke-Ton ist frech-warm. Beim dritten gescheiterten Upload oder bei Geld-/Frist-/Datenthemen kippt Charme in Hohn.

**Entscheidung:** Zweistufig:
- **Erste Fehlinstanz, harmlos** (Upload klemmt, Netz weg): Eulen-Ton erlaubt — „Das hat nicht geklappt. Nochmal?" Technik-Detail einklappbar.
- **Wiederholung (ab 2. Fehlversuch) oder kritisch** (Einreichung, Fristen, Löschung, Geld): **nüchtern und präzise** — was ist passiert, was tun, keine Pointe. Nie Schuld beim Nutzer.

**Konsequenzen:** Fehler-Copy-Katalog braucht beide Register; Toast/Banner-Komponenten bekommen `ernst`-Variante (bereits vorhandener Fehler-Stil, nur Copy-Regel neu). Regel wandert in CONTENT FUNDAMENTALS (readme).

# ADR-024 — Push nur ereignisbasiert + eine Saison-Erinnerung

**Status:** Akzeptiert (Grilling R3, delegiert) · 2026-07-22

**Kontext:** Steuer-Apps sterben an Einmal-Nutzung; Push ist Gegenmittel und Deinstallations-Grund zugleich.

**Entscheidung:** Push nur für **echte Ereignisse**: Bescheid da, Rückfrage vom Finanzamt, Frist < 30 Tage, Partner-Kopplung angefragt. Dazu genau **eine** Reaktivierung pro Steuersaison („Dein 2025er-Jahr wartet — 12 Belege liegen schon drin"), abschaltbar. Nichts sonst — keine Tipps, kein Marketing, keine Streaks.

**Konsequenzen:** Benachrichtigungs-Einstellungen mit 2 Schaltern (Ereignisse / Saison-Erinnerung). Jede Push nennt das Ereignis konkret und führt per Deep-Link direkt zum betroffenen Objekt.
