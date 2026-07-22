# ADR-010 — Einkunftsarten statt Profiltyp

**Status:** Akzeptiert (Grilling R1, delegiert) · 2026-07-22

**Kontext:** Jan–Jun angestellt, ab Jul selbstständig — ein „Profiltyp pro Person" bricht an jedem Mischfall. Die Steuer selbst kennt keine Profiltypen, nur Einkunftsarten (§ 2 EStG).

**Entscheidung:** Der „Profiltyp" ist nur eine Onboarding-Abkürzung. Fachlich hat ein **Steuerjahr eine Menge von Einkunftsarten** (Nichtselbstständig, Gewerbe/Selbstständig, Vermietung, Kapital, Ausland/Grenzgänger …) — mehrere gleichzeitig erlaubt. Gates (Gewerbe-Gate, Grenzgänger-Erkennung) fügen Einkunftsarten hinzu, statt den Nutzer umzutypen.

**Konsequenzen:** Kein „neues Onboarding" bei Lebensänderung — nur „+ Einkunftsart" im laufenden Jahr. Navigation und Prüf-Screen gruppieren nach Einkunftsart. Glossar: „Profiltyp" wird als UI-Begriff gestrichen, bleibt nur im Onboarding-Text.

# ADR-011 — Löschschutz für eingereichte Fassungen

**Status:** Akzeptiert (Grilling R1, delegiert) · 2026-07-22

**Kontext:** DSGVO-Löschrecht vs. Beweisfunktion: was beim Finanzamt liegt, muss der Nutzer belegen können (Frist bis Bestandskraft + Aufbewahrung).

**Entscheidung:** Entwürfe und ungebundene Belege: jederzeit löschbar (mit Warnung). Eingereichte Fassungen samt zugeordneter Belege: **löschgeschützt** — einzeln nicht löschbar; nur die Konto-Volllöschung (DSGVO Art. 17) entfernt alles, mit expliziter Warnung „Du verlierst deine Nachweise gegenüber dem Finanzamt" und Pflicht-Export-Angebot davor.

**Konsequenzen:** UI: Papierkorb-Symbol auf eingereichten Objekten entfällt, stattdessen Schloss + Erklär-Popover (Eule). Konto-Löschung bekommt Export-Zwischenschritt.
