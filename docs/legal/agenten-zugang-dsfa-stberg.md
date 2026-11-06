# Rechtliche Einordnung und Datenschutz-Folgenabschätzung (DSFA) für den Agenten-Zugang

> **Status:** Gültig ab Version 1.0 (November 2026)  
> **Bezug:** ADR-0052 (Agenten-Zugang via Model Context Protocol), Issue #388 (Slice 17.5)  
> **Rechtsgrundlagen:** Steuerberatungsgesetz (StBerG), Datenschutz-Grundverordnung (DSGVO Art. 25, 35, 44 ff., 49)

---

## 1. Einordnung nach dem Steuerberatungsgesetz (StBerG)

### 1.1 Problemstellung und Normenkontrollrahmen
Nach § 2 und § 3 StBerG ist die geschäftsmäßige Hilfeleistung in Steuersachen nur Personen und Vereinigungen gestattet, die hierzu befugt sind (z. B. Steuerberater, Steuerbevollmächtigte, Rechtsanwälte). Die unbefugte geschäftsmäßige Hilfeleistung in Steuersachen ist nach § 5 StBerG unzulässig und kann nach § 160 StBerG ordnungswidrigkeitsrechtlich geahndet werden.

### 1.2 Technische und rechtliche Abgrenzung des SteuerEule-Agenten-Zugangs
SteuerEule erbringt mit der Bereitstellung der Model Context Protocol (MCP) Schnittstelle **keine Hilfeleistung in Steuersachen**, sondern stellt ein technisches Software-Werkzeug bereit:

1. **Eigener Assistent des Nutzers (Werkzeugeigenschaft):**
   * SteuerEule betreibt den KI-Agenten nicht selbst als geschlossene Beratungsinstanz.
   * Der Nutzer schließt eigenverantwortlich eine Vereinbarung mit einem Modellanbieter (z. B. Anthropic, OpenAI, lokales LLM) ab oder betreibt seinen eigenen Client.
   * Der Agent agiert als verlängerter Arm und persönliches Werkzeug des Steuerpflichtigen selbst.
2. **Keine rechtliche Subsumtion oder Mandatsverhältnis:**
   * SteuerEule gibt über die MCP-Tools keine verbindliche Rechtsberatung ab.
   * Berechnungen des Kerns (`@steuereule/core`) sind deterministische Rechenwege auf Basis der amtlichen Gesetze (z. B. § 32a EStG Tarif, Pendlerpauschale, amtliche BMF-Tabellen), die offene Werte nicht erfinden, sondern ehrlich als offen ausweisen (ADR-0032/0034).
3. **Zwingende menschliche Zwischenschaltung („Der Nutzer gewinnt“ & Bestätigungspflicht):**
   * Alle vom KI-Assistenten eingetragenen Werte werden serverseitig zwingend als **unbestätigt** (`unbestaetigt`) markiert (ADR-0052 §6).
   * Unbestätigte Werte sperren die Vorprüfung, den Formular-Ausdruck und die Bezahlung (REQ-032). Ein Ausdruck oder eine Einreichung ohne explizite Sichtprüfung und anlagenweise Bestätigung durch den menschlichen Nutzer ist technisch ausgeschlossen.
   * Hat der Nutzer einen Wert selbst erfasst, kann der Assistent diesen niemals überschreiben; es wird stattdessen ein Vorschlag erzeugt.
4. **Keine elektronische Übermittlung an Finanzbehörden (Papierweg):**
   * SteuerEule bindet in Version 1.0 kein ELSTER-Zertifikat an und übermittelt keine Daten an Finanzämter (ADR-0050). Der Nutzer druckt die Formulare selbst aus, prüft sie und unterschreibt eigenhändig.

---

## 2. Datenschutz-Folgenabschätzung (DSFA nach Art. 35 DSGVO)

### 2.1 Schwellenwertanalyse (Art. 35 Abs. 1 DSGVO)
Steuerdaten stellen finanzielle Daten mit hoher Sensibilität dar (teilweise einschließlich Art. 9 DSGVO Daten wie Religionszugehörigkeit für Kirchensteuerzwecke). Da eine automatisierte Schnittstelle (OAuth 2.1 + Remote MCP) für externe KI-Systeme geöffnet wird, wurde eine formalisierte DSFA durchgeführt.

### 2.2 Datenflüsse und Schnittstellenarchitektur
1. **Authentifizierung:**
   * Die Authentifizierung erfolgt strikt nach OAuth 2.1 mit PKCE.
   * Autorisierungsanfragen verlangen explizite Scopes (`steuerdaten:read`, `steuerdaten:write`, `belege:write`, `zahllink:read`).
   * Der Consent-Screen klärt den Nutzer ausdrücklich über die angeforderten Berechtigungen und das Drittland-Risiko auf.
2. **Lesezugriff und PII-Maskierung (Privacy by Design, Art. 25 DSGVO):**
   * Ruft ein Assistent das Werkzeug `steuerjahr_stand` auf, werden personenbezogene Identifikatoren (PII) serverseitig **maskiert**:
     * Steuer-ID: `12*******01`
     * IBAN: `DE** **** **** **** **** 00`
     * Vor-/Nachname: Erster Buchstabe + `***`
     * Straße & Hausnummer: Maskiert
     * Telefonnummer: Ortsvorwahl + `***`
   * Planungsrelevante, steuerliche Eckdaten (PLZ, Wohnort, Beträge, Steuerjahr) bleiben im Klartext erhalten, damit der Assistent steuerlich rechnen kann, ohne die Person identifizieren zu können.
3. **Schreibzugriff und Kontoschutz:**
   * Assistenten-Token können nur Fachdaten schreiben (`maske_eintragen`, `beleg_hochladen`).
   * Administrative Aktionen (Passwortänderung, Kontolöschung, Passkeys, OAuth-Verwaltung, Datenexport nach Art. 20) sind für Bearer-Tokens **serverseitig gesperrt** (`ForbidAssistantGuard`).
4. **Auditierung und Transparenz (Art. 30 DSGVO):**
   * Jeder Lese- und Schreibzugriff eines Assistenten wird atomar in der Tabelle `AuditEntry` protokolliert (mit Zeitstempel, Client-ID und Client-Name).
   * Der Nutzer kann diese Zugriffe im Art. 15/20 DSGVO Datenexport einsehen.
5. **Widerruf:**
   * Der Nutzer kann verbundene Assistenten jederzeit unter `Profil → Verbundene Assistenten` mit sofortiger Wirkung sperren. Token und Session werden in der Datenbank invalidiert.

### 2.3 Drittlandübermittlung (Art. 44 ff. DSGVO)
* **Risiko:** Führende KI-Modellanbieter (Anthropic, OpenAI, Google) haben ihren Hauptsitz in den USA (Drittland gem. Art. 44 DSGVO).
* **Rechtsgrundlage:**
  1. Die Übermittlung erfolgt ausschließlich auf direkte Veranlassung und Weisung des Nutzers (Nutzer verbindet seinen Client).
  2. Auf dem OAuth-Consent-Screen holt SteuerEule die **ausdrückliche Einwilligung gem. Art. 49 Abs. 1 lit. a DSGVO** ein. Der Nutzer wird darauf hingewiesen, dass in den USA behördliche Zugriffsrisiken (z. B. FISA 702) bestehen.
  3. Ergänzend minimiert die serverseitige PII-Maskierung die Identifizierbarkeit des Nutzers im Drittland erheblich.

### 2.4 Risikobewertung und Restrisiko
| Bedrohung / Risiko | Eintrittswahrscheinlichkeit | Schweregrad | Technische/Organisatorische Maßnahme | Restrisiko |
| :--- | :--- | :--- | :--- | :--- |
| Modell liest Klartext-Identifikatoren aus | Sehr gering | Hoch | Automatische serverseitige PII-Maskierung vor Übermittlung | Minimal |
| Assistent trägt fehlerhafte Zahlen ein | Mittel | Mittel | Unbestätigte Werte sperren Ausdruck; zwingende Nutzerprüfung je Anlage | Gering |
| Token-Diebstahl / Missbrauch | Gering | Hoch | Scoped OAuth-Token; administrative Aktionen gesperrt; Sofort-Widerruf in UI | Gering |
| Unbemerkter Datenabfluss | Gering | Mittel | Lückenloser DSGVO Art. 30 Audit-Trail für jeden Tool-Aufruf | Sehr gering |

**Ergebnis:** Das verbleibende Restrisiko ist angemessen und durch die implementierten Sicherheitskontrollen wirksam eingedämmt.

---

## 3. Produkt- und Marketingversprechen

Zur Vermeidung irreführender Werbung (§ 5 UWG) und zur Wahrung der berufsrechtlichen Grenzen gelten für alle Marketing- und Produkttexte folgende verbindliche Vorgaben:

* **Unzulässig:**
  * „SteuerEule macht deine Steuererklärung vollautomatisch ohne dein Zutun.“
  * „Unsere KI übernimmt die steuerliche Verantwortung.“
  * „Steuerberatung per Knopfdruck.“
* **Zulässig und verbindlich:**
  * „Verbinde deinen eigenen KI-Assistenten, um Daten vorzubereiten.“
  * „Der Assistent füllt aus – du prüfst und bestätigst jede Anlage selbst.“
  * „Volle Kontrolle: Du entscheidest, welche Werte in deine Steuererklärung einfließen.“
