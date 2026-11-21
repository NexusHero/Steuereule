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

## Amendment 1 (2026-11-03) — Umsetzung 17.1: Herkunft und Bestätigung (#384, REQ-032)

Stakeholder-Entscheidungen (NexusHero, Refinement 17.1):

- Unbestätigte Werte sperren Vorprüfung, Ausdruck und Bezahlung **unabhängig von der Herkunft** —
  auch bestehende, nicht bestätigte Jahresübernahmen.
- „Der Nutzer gewinnt“ (§7) gilt für **jeden** Nicht-Nutzer-Schreiber, auch für die Jahresübernahme:
  sie überschreibt keinen im Zieljahr eingetragenen Wert mehr, sondern legt einen Vorschlag ab.
- Bestätigt wird auf einem eigenen Screen „Prüfen & bestätigen“ (aus dem Cockpit-Hinweis und der
  Ausdruck-Vorprüfung erreichbar); der Einzel-Bestätigen-Knopf der Übernahme entfällt.
- Je Feld gibt es höchstens einen offenen Vorschlag; der neueste ersetzt den älteren.

Technischer Schnitt (folgt aus §6/§7, ohne neue Abhängigkeit):

- Die Tabelle `UebernahmeKennzeichnung` (ADR-0049) wird zur generischen `Kennzeichnung` umbenannt
  und je **Feld** geführt (`<maske>[:<instanz>].<feld>`); bestehende Fakt-Kennzeichnungen werden
  per Migration auf ihre Felder aufgefächert. Keine Zeile = vom Nutzer eingetragen = bestätigt.
  Profil und Stammdaten sind jahresunabhängig und liegen unter Steuerjahr 0.
- Der Vorschlagswert ist verschlüsselt (`mode=strict`), weil er alles tragen kann, was eine Maske
  speichert. Herkunft und Bestätigung sind Teil von Export und Löschung.
- Ändert der Nutzer einen Wert selbst, gilt er als bestätigt (die Kennzeichnung entfällt). Ein
  offener Vorschlag auf einem bestätigten Wert sperrt nicht — er ist kein Wert der Erklärung.
- Bei Zusammenveranlagung sperren auch unbestätigte Werte von Person B (`unbestaetigt.personB`);
  Person B bestätigt in der eigenen App.
- Die Entscheidung über Schreiben oder Vorschlag liegt im Core (`kennzeichnung.ts`); die API liest
  und schreibt Felder nur über die Repositories der Masken. 17.1 verdrahtet die Masken, die ein
  Nicht-Nutzer heute füllen kann (LStB, Rente, Kapital, Vermietung); die übrigen Masken bekommen
  Schreibweg und Nutzer-Hook mit dem Assistenten (17.3).

## Amendment 2 (2026-11-20) — Beratung und Rückmeldung für den Assistenten

Stakeholder-Entscheidung (NexusHero): Der Assistent des Nutzers bekommt dieselbe fachliche Beratung
wie der In-App-Berater, damit er die Erklärung selbstständig führen und seinem Nutzer Rückmeldung
geben kann. Kein Modellaufruf unsererseits (§1 bleibt): die Beratung sind **deterministische
Werkzeuge**, keine Agent-zu-Agent-Frage an unser LLM.

- **Beratungswerkzeuge** (Scope `steuerdaten:read`, lesen und schreiben keine Nutzerdaten, auditiert):
  `einkommensteuer_berechnen`, `veranlagungsarten_vergleichen`, `kapitalertraege_guenstigerpruefung`,
  `spekulationsfrist_pruefen`, `renovierung_15_prozent_pruefen`, `schenkungsteuer_berechnen`,
  `kleinunternehmer_pruefen`, `gewerbesteuer_schaetzen`, `steuerwissen_lesen`, `gesetzestext_lesen`,
  `rechtsquelle_nachschlagen`. Sie teilen Schemas und Rechenkern mit dem In-App-Berater
  (`TOOL_ARG_SCHEMAS`), die Zahlen sind also dieselben.
- **Rückmeldung:** `steuerbericht` (Schätzung, Ausdruck-Lücken, unbestätigte Anlagen, offene Fragen,
  nächste Schritte), `offene_fragen` (nächste Interview-Frage mit möglichen Antworten, nur der Nutzer
  kennt sie) und `auswirkung_simulieren` (Erstattung vorher/nachher über den echten Schreibweg in einer
  immer zurückgerollten Transaktion; Scope `steuerdaten:write`, nie innerhalb einer laufenden Transaktion).
- **Fremdtext gekennzeichnet:** `gesetzestext_lesen` liefert den abgerufenen Wortlaut mit `untrusted: true`
  und dem Hinweis, ihn nur als Quelle zu zitieren.
- **Eintragen mit derselben Zielprüfung wie der interne Berater:** `maske_eintragen` lehnt unbekannte
  Felder, nie beschreibbare Felder, die Buchungsmaske und Werte, die das Feld nicht halten kann, mit
  dem Grund ab. Personenbezogene Felder bleiben für den eigenen Assistenten offen (§8).
- **Person B (Zusammenveranlagung, ADR-0054):** `maske_eintragen` und `auswirkung_simulieren` nehmen
  `person` (A/B) mit den Regeln des In-App-Beraters (`checkDraftPerson`): B nur, wenn der Nutzer B's
  Angaben führt, nur in B's eigenen Masken, dort ist die Person Pflicht. Der Nutzer bestätigt B's
  unbestätigte Werte und entscheidet ihre Vorschläge auf „Prüfen & bestätigen“ mit (als „Person B“
  gekennzeichnet); das Bestätigen einer Anlage gilt für beide.
- **Kinder als Datensätze:** `kinder_auflisten` (Vorname maskiert, Geburtsjahr, `instance`) und
  `kind_anlegen` (Scope `steuerdaten:write`); die Angaben folgen mit `maske_eintragen`, Maske `kind`.
- **Anmeldung für Standard-MCP-Clients** (MCP Authorization, RFC 9728/8414/8707), im lokalen Lauf mit
  echtem MCP-Client geprüft: `/mcp/sse` antwortet ohne Token mit 401 und
  `WWW-Authenticate: Bearer resource_metadata=…`; `/.well-known/oauth-protected-resource[/mcp/sse]` nennt
  better-auth unter `/api/auth` als Server, dessen Metadaten auch unter
  `/.well-known/oauth-authorization-server[/api/auth]` liegen. Der MCP-Endpunkt ist eine OAuth-Ressource;
  ihr Eintrag entsteht bei der ersten `/oauth2/`-Anfrage (`ensureMcpResource`), nicht beim Start, damit
  die App ohne Datenbank bootet. Tokens für diese Ressource sind JWTs (Aussteller `…/api/auth`,
  Zielgruppe `…/mcp/sse`); der Guard prüft sie gegen die eigenen Schlüssel und verlangt zusätzlich die
  noch bestehende Einwilligung, damit ein Widerruf auch für JWTs sofort wirkt (§10). Clients mit
  Loopback-Weiterleitung gelten als native (RFC 8252), `offline_access` gibt Refresh-Tokens, die
  Einwilligungsseite sagt dazu, dass die Verbindung bis zum Widerruf besteht.
- **Eigene Fehler zurücknehmen:** `eintrag_zuruecknehmen` leert einen unbestätigten Wert oder verwirft
  einen Vorschlag, beides nur, wenn derselbe Assistent ihn geschrieben hat. `kind_entfernen` löscht nur
  ein Kind, das der Assistent angelegt hat und an dem nichts bestätigt oder vom Nutzer eingetragen ist;
  dafür markiert `kind_anlegen` Name und Geburtsdatum als unbestätigte Einträge des Assistenten.
  Doppeltes `kind_anlegen` liefert das vorhandene Kind.
- **Felder beschreiben:** `maske_felder` liefert je Maske Form und Hinweis aus dem Feldkatalog; Verweise
  auf Werkzeuge des In-App-Beraters werden für den externen Assistenten umformuliert.
- **Noch nicht:** Buchungen und Anlagegüter (Selbstständige) und neue Vermietungsobjekte über MCP. Bezahlen, Konto und Einwilligungen bleiben ausgeschlossen (§4).

## Amendment 3 (2026-11-20) — Lesesicht: der Assistent liest abgeleitet, nicht im Detail

Stakeholder-Entscheidungen (NexusHero, Grilling 20.11.2026 nach dem Echtdatenlauf 2024 über MCP).
Verschärft §8 („lesen maskiert“) zu Datenminimierung; gilt nur für den externen Assistenten, der
In-App-Berater behält ADR-0091.

1. **Personen nur abgeleitet.** Je Person (Nutzer, Partner, Kinder): Alter am 31.12. des Steuerjahres
   statt Geburtsdatum, Bundesland statt Adresse (keine PLZ, kein Ort, keine Straße), Familienstand und
   Veranlagung, Berufsgruppe aus der Interview-Antwort `beruf` (nicht die Berufsbezeichnung).
   Steuer-ID und IBAN nie, auch nicht maskiert.
2. **Beträge im Klartext.** Steuerbeträge identifizieren niemanden und sind der Kern der Beratung.
3. **Schreiben genau, lesen abgeleitet.** Der Assistent schreibt genaue Werte (Geburtsdatum,
   Arbeitgeberadresse); zurück liest er sie abgeleitet, auch seine eigenen („Geburtsdatum gesetzt,
   Alter 33“).
4. **Dritte nur als Rolle und Land** („Arbeitgeber 1, Schweiz“); Arbeitgeber, Kita, Handwerker,
   Spendenempfänger und der andere Elternteil ohne Namen und Adressen.
5. **Freitext nur als „gesetzt“.** Bemerkungen, Erläuterungen und Notizen fließen nicht zurück.
6. **Kinder als Nummer und Alter** mit `instance`, ohne Anfangsbuchstaben; die Zuordnung gleich alter
   Kinder hält der Assistent selbst (aus `kind_anlegen`).
7. **Kirchensteuer ohne Konfession.** Der Assistent schreibt je Person nur die neue Angabe
   „kirchensteuerpflichtig ja/nein“, die die Schätzung nutzt; eine Konfession (Art. 9 DSGVO) trägt der
   Nutzer mit Einwilligung in der App ein. Bei „ja“ ohne Konfession meldet der Bericht eine Lücke für
   den Ausdruck. Widersprechen sich beide, gilt die Konfession des Nutzers (§7), der Bericht nennt den
   Widerspruch. Der Religionsschlüssel ist über MCP nicht mehr beschreibbar.
8. **Werkzeuge.** `maske_lesen(screen, person)`: je Feld Wert (Beträge klar, Persönliches abgeleitet),
   Stand (bestätigt / unbestätigt / Vorschlag offen) und Herkunft als Art (Nutzer, du selbst, anderer
   Assistent, Jahresübernahme, Beleg; Namen anderer Assistenten nicht). `haushalt_ueberblick` ersetzt
   `steuerjahr_stand`. Belege lesbar mit belegId, Art, Jahr, Datum und den Feldern, deren Herkunft sie
   sind, ohne Dateinamen.
9. **Transparenz** über das Audit-Log wie bisher (REQ-004); keine eigene Ansicht.

Dazu, aus dem Echtdatenlauf, weitere Werkzeuge für die Arbeit des Assistenten (Ticketschnitt in
`17-agenten-zugang-mcp.md`, Slices 17.8–17.13): Stapel-Eintrag je Maske, Aufschlüsselung der Schätzung
(Rechenweg), Bescheid-Abgleich mit Einspruchsfrist, Prüfregeln und Ausdruck-Plan, Aufgaben an den
Nutzer, Komfort (Veranlagungsvergleich aus Falldaten, Mehrfeld-Szenario, Wechselkurse, Vordruck-Zeilen,
Feld finden, Vorjahr und Fristen), Vermietungsobjekte und Buchungen. Unverändert ausgeschlossen:
Belege serverseitig auslesen (§11), Einwilligungen, Bezahlen, Kontoaktionen.

## Amendment 4 (2026-11-21) — Der Zugang des Assistenten endet am MCP-Endpunkt

Befund aus dem Sicherheitsreview nach den Echtdatenläufen: Ein Assistenten-Token wurde seit 17.2 von
`UserContextGuard` auf jeder Route angenommen und von `RequiresAccount` wie eine Nutzer-Sitzung
behandelt; gesperrt war nur, wo `@ForbidAssistant()` stand (5 von 39 Controllern). Über die normale
API ließen sich damit die Lesesicht (Amendment 3), die Scopes und „nur der Nutzer bestätigt“ umgehen.

1. **Erlaubnis statt Verbotsliste.** Ein Bearer-Token gilt nur an Controllern mit
   `@AcceptsAssistantToken()`; das ist allein der MCP-Controller. Überall sonst antwortet der Guard mit
   403, bevor er das Token nachschlägt. Ein Test hält fest, dass die Markierung nur dort steht.
   `@ForbidAssistant()` bleibt als zweite Sperre stehen.
2. **Registrierung nur mit Anmeldung.** `allowUnauthenticatedClientRegistration` ist aus: Einen Client
   registriert nur ein angemeldeter Nutzer. Folge: Ein MCP-Client, der sich vor der Anmeldung selbst
   registriert (RFC 7591, so verbinden sich die üblichen Assistenten), kommt so nicht mehr herein.
   Stattdessen legt der Nutzer den Zugang im Profil an („Assistent verbinden“): ein öffentlicher Client
   (PKCE, kein Secret) mit der Rückruf-Adresse des Assistenten (Claude, ChatGPT oder eine eigene, https
   oder Loopback). Die App zeigt Server-Adresse und Client-ID, die der Nutzer im Assistenten einträgt.
3. **Der Assistent ist seine Client-ID.** Herkunft (`Kennzeichnung.herkunftClientId`,
   `vorschlagClientId`) und Aufgaben (`AssistentAufgabe.clientId`) merken sich die Client-ID. „Eigener
   Eintrag“ (zurücknehmen, Kind oder Objekt entfernen, eigene Aufgaben lesen, „du“ in der Lesesicht)
   geht nach ihr; der Name, den sich ein Client selbst gibt, ist nur Anzeige. Einträge von vor dieser
   Änderung tragen keine ID und gelten weiter nach dem Namen.
4. **Aufgaben an den Nutzer** (`aufgabe_fuer_nutzer`): feste Arten, höchstens 300 Zeichen, keine
   Kennungen (IBAN, Steuer-ID), keine Links oder Webadressen, höchstens 20 offene je Jahr; in der App
   nur als reiner Text mit dem Namen des Assistenten.

Bewusst nicht in diesem Schnitt: Obergrenze für Werkzeugaufrufe und gleichzeitige Sitzungen; Aufgaben
nur aus Textbausteinen. Buchungsentwürfe über MCP bleiben offen (eine Buchung ist kein Feldwert und
braucht einen eigenen Entwurfsweg).

## Amendment 5 (2026-11-21) — Der Assistent registriert sich wieder selbst

Amendment 4 Nr. 2 ist zurückgenommen. Üblich ist bei MCP, dass der Nutzer im Assistenten nur die
Server-Adresse einträgt; der Assistent liest die Metadaten (RFC 9728, RFC 8414), registriert sich selbst
(RFC 7591) und schickt den Nutzer zur Anmeldung und Freigabe. Ein Client-Secret gibt es nicht (öffentlicher
Client, PKCE). Eine Client-ID von Hand zu kopieren ist ein Schritt mehr als bei anderen Diensten.

1. `allowUnauthenticatedClientRegistration` ist wieder an. Eine Registrierung gewährt nichts: Ein Token
   entsteht erst nach Anmeldung und Freigabe des Nutzers und gilt nur am MCP-Endpunkt (Amendment 4 Nr. 1).
2. **Limit:** höchstens 10 Registrierungen je Stunde und Adresse (`/oauth2/register`).
3. **Aufräumen:** Ein selbst registrierter Client, den nach 7 Tagen kein Nutzer freigegeben hat, wird
   gelöscht (`oauth-client-sweep.ts`; läuft mit einer Registrierung, höchstens stündlich je Prozess).
4. „Assistent verbinden“ im Profil bleibt als zweiter Weg für Assistenten ohne eigene Registrierung;
   ein dort angelegter Client gehört dem Konto und wird nicht aufgeräumt.

Nicht geprüft: Client ID Metadata Documents (die Client-ID ist eine Adresse des Assistenten, nichts
wird gespeichert) als späterer Ersatz für die Registrierung.

