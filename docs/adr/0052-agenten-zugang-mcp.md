# ADR-0052 — Agenten-Zugang: der eigene KI-Assistent des Nutzers füllt die Erklärung aus (MCP)

- **Status:** Accepted (Stakeholder-Entscheidung NexusHero, 2026-11-03) — Entwurf aus der
  Grilling-Session mit NexusHero; Musti-Review läuft auf den Slice-PRs
- **Date:** 2026-11-05
- **Deciders:** NexusHero (Stakeholder) — Entscheidungen; Musti — Architektur-Review
- **Ändert / ergänzt:** Produkt-ADR-014/048 (KI schlägt vor, nie direkt), ADR-0051 (keine
  personenbezogenen Daten an externe KI), ADR-0049 (Kennzeichnungs-Schicht der Jahresübernahme),
  ADR-0009 (better-auth als Auth-Server), ADR-0050 (Papierweg, Bezahlung beim Ausdruck)
- **Verschiebt:** den 1.0-Go-Live (siehe Konsequenzen)

## Kontext

Nutzer wollen SteuerEule mit ihrem eigenen KI-Assistenten (Claude, Gemini, DeepSeek oder andere)
verwenden: Der Assistent soll Unterlagen auswerten und die Steuererklärung in der App
weitgehend selbstständig ausfüllen. Die App ist dafür heute nicht gebaut:

- Identität ist ein httpOnly-Session-Cookie (ADR-0007/0009); es gibt keinen Zugang für fremde Clients.
- Jede Maske kennt nur Werte, keine Herkunft. „Unbestätigt“ gibt es nur für übernommene
  Vorjahreswerte (ADR-0049).
- Produkt-ADR-014/048 lässt eine KI nur vorschlagen; erst die Bestätigung des Nutzers macht einen
  Posten. ADR-0051 verbietet personenbezogene Daten an externe Modelle — für *unsere* KI.
- Die Beleg-Inbox speichert nur Metadaten (Dateiname, Art, Datum), keine Dateien.

## Entscheidung

1. **Akteur: der eigene Assistent des Nutzers.** SteuerEule stellt eine Schnittstelle bereit; der
   Nutzer verbindet sie mit seinem Assistenten. Wir rufen kein fremdes Modell auf und betreiben
   keinen Agenten. Dritte, die Erklärungen für viele Nutzer bearbeiten (Lohnbüros, andere Apps),
   sind ausgeschlossen. Nur Konten, keine Gast-Sitzungen (ADR-0045).

2. **Schnittstelle: ein Remote-MCP-Server mit OAuth 2.1.** Autorisierung über das OAuth-/OIDC-
   Provider-Plugin von better-auth (ADR-0009): ein Login, eine Identität, kein zweiter Auth-Dienst.
   Der Nutzer erteilt den Zugang auf einer Einwilligungsseite, die den Namen des Assistenten aus
   der Client-Registrierung zeigt.

3. **Werkzeuge: wenige, fachliche Werkzeuge** in der Sprache der Erklärung — nicht aus der OpenAPI
   generiert. Mindestens: Stand eines Steuerjahres, was für den Ausdruck fehlt (Vorprüfung), je
   Maske ein Werkzeug zum Eintragen (Lohnsteuerbescheinigung, Interview-Antworten, Kinder,
   Vermietung, Kapital, Lohnausweis/N-Gre, Stammdaten, Kopplung), Beleg hochladen, Eulen-Hinweise
   lesen, Zahllink anfordern.

4. **Umfang.** Der Agent liest und schreibt alle Steuerfakten, Stammdaten und die Kopplung und lädt
   Belege samt Datei hoch. **Nicht über die Schnittstelle:** Konto löschen, E-Mail, Passwort,
   Passkeys, Geräte abmelden, jede Einwilligung (insbesondere Art. 9 DSGVO zur Religion, der
   Eulen-Modus, der Agenten-Zugang selbst) und das Bezahlen.

5. **Bezahlung.** Der Agent kann den Stripe-Checkout anstoßen und erhält den Zahllink; bezahlen und
   damit den Vertrag schließen tut der Mensch (ADR-0050).

6. **Gesammelte Bestätigung statt Bestätigung pro Wert** — ein Amendment, keine Aufhebung von
   Produkt-ADR-014/048. Alles, was der Agent schreibt, ist **unbestätigt** und trägt seine Herkunft
   („Assistent: Claude, aus Beleg X“). Der Nutzer prüft in der App **je Anlage** und bestätigt oder
   ändert. Vorprüfung, Ausdruck und Bezahlung behandeln unbestätigte Werte wie offene. Technisch ist
   das die Kennzeichnungs-Schicht aus ADR-0049, erweitert auf jede Maske.

7. **Konflikte: der Nutzer gewinnt.** Schreibt der Agent einen Wert, den der Nutzer bestätigt oder
   selbst eingegeben hat, bleibt dieser Wert stehen; der Agent-Wert erscheint als Vorschlag
   („Assistent schlägt 4.800 statt 4.750 vor“).

8. **Personenbezogene Daten: schreiben ja, lesen maskiert.** Steuer-ID, IBAN, Adresse, Namen
   Dritter (Partner, anderer Elternteil, Arbeitgeber) gibt die Schnittstelle nur maskiert zurück.
   Was einmal in der App ist, fließt nicht erneut zum Modell. ADR-0051 gilt unverändert für unsere
   eigene KI; der Datenfluss zum Assistenten des Nutzers geschieht auf dessen Veranlassung und ist
   davon getrennt geregelt.

9. **Drittländer.** Wir sperren keine Anbieter. Die Einwilligungsseite sagt klar, dass die Daten zum
   Anbieter des gewählten Assistenten gehen — gegebenenfalls in ein Land ohne
   Angemessenheitsbeschluss — und die Entscheidung beim Nutzer liegt.

10. **Laufzeit und Widerruf.** Eine Verbindung gilt unbefristet, bis der Nutzer sie widerruft. Pflicht
    ist daher eine Übersicht „Verbundene Assistenten“ (Name, verbunden seit, zuletzt genutzt,
    Widerruf) neben der Geräteverwaltung. Jeder Zugriff wird im Audit-Log mit dem Assistenten als
    Quelle protokolliert (REQ-004).

11. **Belege mit Datei.** Die Beleg-Inbox bekommt eine echte Dateiablage: EU-Objektspeicher,
    verschlüsselt, Typ- und Größenprüfung, Virenscan, Teil von DSGVO-Export und Löschung. Wir lesen
    die Dateien nicht serverseitig aus — das tut der Assistent; die Datei ist der Nachweis.

12. **Eulen-Modus bleibt.** Er dient Nutzern ohne eigenen Assistenten; der Agent bekommt die
    Eulen-Karten als Werkzeug „Hinweise“ und sieht dieselben Funde.

13. **Zeitpunkt: vor 1.0, und der Go-Live wartet darauf.** DSGVO-Audit, Datenschutz-Folgenabschätzung
    und Rechtsprüfung (#329) umfassen den Agenten-Zugang von Anfang an.

## Konsequenzen

- **Zweiter Identitätsweg.** Neben dem Session-Cookie gibt es Bearer-Tokens mit Scopes. Jeder Guard,
  jedes Rate-Limit (#350) und das Audit-Log müssen beide Wege kennen; die ausgeschlossenen Aktionen
  aus Punkt 4 werden für Tokens serverseitig verweigert, nicht nur nicht angeboten. Ein unbefristetes
  Token mit weitem Zugriff ist ein lohnendes Ziel — kurze Access-Token-Laufzeit mit Refresh,
  Widerruf wirkt sofort.
- **Herkunft wird ein Querschnittsthema.** Heute speichert jede Maske nur den Wert. Künftig braucht
  jeder Wert Herkunft und Bestätigungsstand; Cockpit, Vorprüfung, Ausdruck, Jahresübernahme und
  DSGVO-Export müssen ihn auswerten. Das ist der größte Umbau dieses Vorhabens.
- **Neue Infrastruktur.** OAuth-Provider (better-auth-Plugin), MCP-Server, Objektspeicher mit
  Virenscan. Die Dateiablage hängt an der noch offenen Hetzner-Infrastruktur (#292) — damit wird der
  Infrastruktur-Track noch stärker zum kritischen Pfad.
- **Rechtliches.** Zusätzlich zu #329: Abgrenzung zur geschäftsmäßigen Hilfe in Steuersachen (StBerG)
  für das Modell „eigener Assistent“, Datenschutz-Folgenabschätzung für den Agenten-Zugang,
  Datenschutzerklärung (Drittland-Hinweis), AGB-Klausel zur Verantwortung des Nutzers für bestätigte
  Werte.
- **Produktversprechen.** „Vollautomatisch“ heißt: Der Assistent füllt aus, der Mensch prüft und
  bestätigt je Anlage. Marketing und Website dürfen nicht mehr versprechen.
- **Last.** Agenten rufen häufiger und schneller auf als Menschen; Lasttest (Ticket 11) und
  Rate-Limits müssen Agenten-Verkehr abdecken.
- **Qualitäts-Gate.** Ein durchgehender Test mit einem echten MCP-Client im CI: Verbinden,
  Werkzeuge, unbestätigte Werte, Bestätigung je Anlage, Widerruf, verweigerte Kontoaktionen.
- **1.0 verschiebt sich** um diesen Block samt Audit und Rechtsprüfung.

## Umsetzung (Ticketschnitt)

In Abhängigkeitsreihenfolge; Details im Roadmap-Ticket `17-agenten-zugang-mcp.md`.

1. **Herkunft und Bestätigung für jede Maske** — Kennzeichnungs-Schicht aus ADR-0049
   verallgemeinern; Vorprüfung, Ausdruck und Bezahlung behandeln „unbestätigt“ wie offen;
   Bestätigungs-Screen je Anlage; Konfliktregel „Nutzer gewinnt“.
2. **OAuth-Provider** — better-auth-Plugin, Scopes, Einwilligungsseite mit Drittland-Hinweis,
   Übersicht „Verbundene Assistenten“ mit Widerruf, Token-Weg in Guards, Rate-Limits und Audit.
3. **MCP-Server** — fachliche Werkzeuge, Maskierung beim Lesen, verweigerte Aktionen serverseitig,
   CI-Test mit echtem MCP-Client.
4. **Dateiablage für Belege** — EU-Objektspeicher, Verschlüsselung, Prüfungen, Virenscan, Export und
   Löschung (abhängig von #292).
5. **Recht und Datenschutz** — Rechtsprüfung, Datenschutz-Folgenabschätzung, Datenschutzerklärung,
   AGB; Teil der 1.0-Abnahme.

## Verworfene Alternativen

- **Wir betreiben den Agenten (eigener Modellaufruf).** Wir würden Verantwortliche für den
  Datentransfer zu jedem Anbieter (Auftragsverarbeitung, Drittland) und trügen die Modellkosten.
- **Dritte für viele Nutzer.** Nahe an der geschäftsmäßigen Hilfe in Steuersachen; Haftung und
  Missbrauchsrisiko deutlich größer.
- **Werte des Agenten gelten sofort.** Widerspricht Produkt-ADR-014/048 und legt die Verantwortung
  für eine Steuererklärung in ein Modell.
- **Persönlicher API-Schlüssel statt OAuth.** Ein langlebiges Geheimnis mit weitem Zugriff, das im
  Assistenten im Klartext steht; kein standardisierter Einwilligungs- und Widerrufsweg.
- **Werkzeuge aus der OpenAPI generieren.** Rund 80 technische Werkzeuge überfordern viele Modelle
  und legen Interna offen.
- **Bekannte Anbieter blockieren.** Über den frei wählbaren Client-Namen trivial zu umgehen.
