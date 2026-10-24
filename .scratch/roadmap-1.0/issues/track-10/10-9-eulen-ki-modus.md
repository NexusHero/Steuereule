# 10.9 — Eulen-KI-Modus (Produkt-ADR-037–041); KI hinter dem P0.4-Port

**What to build:** Der „Eulen-Modus" — eine **opt-in Stufe** über dem reaktiven Berater, **ein
Wesen** (kein zweiter Charakter): der Berater-Tab bekommt im Eulen-Modus die aktive Fragen-Funktion
dazu. Opt-in-Moment: letzter Schritt nach dem Interview („Soll ich ab jetzt mitdenken?"), Profil-
Schalter zum Abschalten. **Stufe 1 (reaktiver Berater) bleibt unverändert.**

Vier zulässige Auslöser (ADR-038): (1) Lücke im Muster, (2) Vergleich mit ähnlichen Fällen,
(3) neues Gesetz/Urteil betrifft vorhandene Posten, (4) Beleg deutet auf nicht angelegte
Lebenslage. **Proaktiv ins Cockpit** nur Gesetzes-/Urteils-Funde, die den konkreten Fall betreffen,
mit Betrag und **ab ≈ 50 €** — alles andere wartet auf Abruf. Quellen menschlich übersetzt + Link,
„Rechtsstand: TT.MM.JJJJ"-Zeile (ADR-039); sicherer Weg bei Unsicherheit, „Empfehlen" nur bei
eindeutiger Rechtslage (StBerG-Grenze, ADR-040); „Stimmt nicht"-Knopf, verworfene Karten nur bei
neuen Fakten (ADR-041); Archiv-Wache über abgegebene Jahre im Einspruchsfenster (ADR-042);
**Violett ausschließlich für KI-Output** (ADR-002).

**Blocked by:** **10.1–10.8** (die Fakten, über die die Eule räsoniert — insbesondere Trigger 4
braucht die Beleg-Inbox, Trigger 3 braucht Posten/Jahre) · Engineering-Entwurf 0038
(`ki-port.ts`, promotet) · **Produkt-ADR-037–042 müssen akzeptiert werden** (aktuell „Vorgeschlagen")
· **KI-Datenschutz (ADR-048) ist offen**.

**Status:** ready-for-agent (hinter den Querschnitts-Blockern — kann nicht starten, bis die ADRs
promotet/akzeptiert sind)

- [ ] Opt-in als letzter Interview-Schritt; Profil-Schalter zum Abschalten; Stufe 1 unverändert
- [ ] Vier Auslöser, proaktiv nur Gesetzes-Funde ≥ 50 € mit Betrag + Fallbezug; Rest auf Abruf
- [ ] Quellen menschlich übersetzt + Link; Rechtsstand-Zeile; ehrlicher Leerlauf („Nichts offen")
- [ ] Sicherer Weg bei Unsicherheit; „Empfehlen" nur bei eindeutiger Rechtslage (StBerG)
- [ ] „Stimmt nicht"-Knopf; verworfene Karten nur bei neuen Fakten zurück
- [ ] Archiv-Wache: Einspruchsfrist-Karte für abgegebene Jahre
- [ ] Violett ausschließlich für KI-Output; LLM hinter dem Port, Kern bleibt deterministisch (ADR-048)
- [ ] TDD, typecheck + lint grün, Posture-Zeile (KI-Datenschutz-Boundary)
