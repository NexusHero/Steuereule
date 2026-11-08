---
title: "Steuereule — Use-Case Overview"
subtitle: "A use-case view over the Requirements Register (arc42-compatible)"
status: "Living Document"
lang: de
toc: true
toc-depth: 3
numbersections: true
---

# Anwendungsfall-Übersicht (Use Cases) {#section-use-cases}

## Leseanleitung {#how-to-read}

Dieses Dokument bietet die **fachliche Anwendungsfall-Sicht** auf Steuereule. Es benennt die nutzerseitigen Ziele, die Akteure und Personas sowie die Verankerung in den im Requirements Register getrackten Anforderungen (`REQ-001` bis `REQ-035`).

### Grundregeln der Architektur & Nachvollziehbarkeit

1. **Jeder Use Case verweist auf konkrete `REQ-NNN`** im [Requirements Register](requirements/register.md) und auf zugehörige [ADRs](adr/index.md).
2. **Deterministischer Kern vor KI-Vorschlag ([ADR-0005](adr/0005-deterministic-core-llm-assist.md), [ADR-0051](adr/0051-eulen-ki-modus.md)):**
   Der deterministische Rechenkern in `@steuereule/core` berechnet jeden Betrag, Tarif, Splittingvorteil, Freibetrag und jede Frist ausnahmslos deterministisch und manipulationssicher. Der KI-Assistent („Eulen-Modus“) schlägt lediglich vor, erklärt, strukturiert und formuliert — stets mit protokollierter Herkunft (*Provenance*), niemals eigenmächtig mutierend und ohne Schweigen bei Fehlern.
3. **E2E-Automatisierung:**
   Jeder relevante Ablauf ist in der E2E-Szenario-Matrix (`e2e/scenarios/01-24`) als realer Browser-Durchlauf auf CI fest verankert und gegen Regressionen abgesichert.

---

## Akteure und Personas {#actors-and-personas}

| Persona / Akteur | Typische Lebenslage & Steuerprofil | Primäre Use Cases | E2E-Szenario |
| :--- | :--- | :--- | :--- |
| **Lena Hoffmann** | Angestellte im Inland, Ledig, keine Kinder, Pendlerpauschale, Homeoffice | UC-01, UC-02, UC-03, UC-05 | `e2e/scenarios/01-lena-hoffmann-angestellt.mjs` |
| **Markus & Julia Brenner** | Grenzgänger Schweiz (CH-Lohnausweis, CHF-Währungsumrechnung, 60-Tage-Regel Art. 15a DBA-CH) | UC-03, UC-04, UC-05 | `e2e/scenarios/02-markus-brenner-grenzgaenger-ch.mjs`, `03-julia-brenner-grenzgaengerin-ch.mjs` |
| **Ehepaar Weber** | Verheiratet, Zusammenveranlagung, unterschiedliche Einkünfte, Veranlagungsartenvergleich | UC-02, UC-04, UC-05 | `e2e/scenarios/04-weber-ehepaar-zusammenveranlagung.mjs`, `14-keller-ehepaar-veranlagungsvergleich.mjs` |
| **Hans Meyer** | Rentner mit gesetzlicher Rente und Kapitalerträgen (Sparer-Pauschbetrag, Günstigerprüfung) | UC-03, UC-04, UC-05 | `e2e/scenarios/05-hans-meyer-rentner-kapital.mjs` |
| **Sarah Fischer** | Angestellte mit Homeoffice und Riester-Rentenvertrag (Sonderausgaben § 10a EStG) | UC-02, UC-03, UC-05 | `e2e/scenarios/06-sarah-fischer-homeoffice-riester.mjs` |
| **David Richter** | Alleinerziehend mit Kind, Entlastungsbetrag nach § 24b EStG, Kindergeld-Günstigerprüfung | UC-02, UC-03, UC-05 | `e2e/scenarios/07-david-richter-alleinerziehend.mjs`, `16-sabine-kranz-geschieden-kind.mjs` |
| **Maximilian Allesgeber** | Vollspektrum-Erfasser mit allen Lebenslagen (Umzug, doppelte Haushaltsführung, Abfindung) | UC-02, UC-03, UC-05 | `e2e/scenarios/17-maximilian-allesgeber-maximal-katalog.mjs` |
| **Maximiliane Koch** | Gewerbetreibende / Selbstständige (Gewerbe-Gate fängt unzulässige Einkunftsarten in 1.0 ehrlich ab) | UC-02 (Gate) | `e2e/scenarios/09-maximiliane-koch-selbststaendig-gate.mjs` |
| **Erika Zimmermann** | Verwitwete Steuerzahlerin (Gnadensplitting nach § 32a Abs. 6 EStG im Sterbefolgejahr) | UC-02, UC-04, UC-05 | `e2e/scenarios/13-erika-zimmermann-verwitwet.mjs` |

---

## Use-Case-Matrix {#use-case-matrix}

| UC-ID | Name des Use Case | Primärer Akteur | Beteiligte REQ | Kern-ADR | Status | E2E-Referenz |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **UC-01** | Anonymes Onboarding & Gast-Session | Alle Nutzer | REQ-001, REQ-002, REQ-012 | ADR-0011, ADR-0045 | **Done** | `08-navigation-gast-und-alle-screens.mjs` |
| **UC-02** | Minimal-Gate & Drei-Fragen-Interview | Alle Nutzer | REQ-015, REQ-017 | ADR-0031, ADR-0045 | **Done** | `19-dialog-matrix-interview-zickzack.mjs` |
| **UC-03** | LStB- & Einkünfte-Erfassung (Lohn, Rente, V&V, KAP) | Angestellte, Rentner, Vermieter | REQ-016, REQ-024, REQ-026 | ADR-0008, ADR-0050 | **Done** | `01-lena-hoffmann`, `05-hans-meyer`, `22-dialog-crud` |
| **UC-04** | Grenzgänger-Schweiz Lohnausweis & Status | Grenzgänger CH | REQ-019, REQ-020, REQ-021 | ADR-0042, ADR-0050 | **Done** | `02-markus-brenner`, `03-julia-brenner` |
| **UC-05** | Steuerberechnung & Veranlagungsartenvergleich | Alle Steuerzahler | REQ-001, REQ-022, REQ-027 | ADR-0034, ADR-0038 | **Done** | `04-weber-ehepaar`, `14-keller-ehepaar` |
| **UC-06** | Vorjahresübernahme (Jahreswechsel) | Wiederkehrende Nutzer | REQ-028, REQ-032 | ADR-0022, ADR-0052 | **Done** | `23-dialog-matrix-gast-upgrade` |
| **UC-07** | Freischaltung via Stripe & Zahlungsprüfung | Abgabewillige Nutzer | REQ-029 | ADR-0050 | **In review** | `apps/api/test/acceptance/unlock-webhook.test.ts` |
| **UC-08** | Amtlicher Formular-Ausdruck (Papierweg) | Zahlende Nutzer | REQ-030, REQ-031 | ADR-0050 | **In review** | `apps/api/test/printout.test.ts` |
| **UC-09** | Eulen-Modus (KI-Steuerberater im Chat) | Beratungsbedürftige Nutzer | REQ-031, REQ-033 | ADR-0051, ADR-0052 | **In review** | `24-advisor-chat-steuereule.mjs` |
| **UC-10** | QR-Code Geräte-Kopplung (Desktop via Phone) | Mobile-Nutzer | REQ-014 | ADR-0024 | **Done** | `apps/api/test/acceptance/req-014-device-approve-token.test.ts` |
| **UC-11** | DSGVO Daten-Export & Kontolöschung | Registrierte Nutzer | REQ-004, REQ-011 | ADR-0013, ADR-0016 | **Done** | `apps/api/test/acceptance/req-011-export-delete.test.ts` |

---

## Detaillierte Anwendungsfall-Abläufe {#detailed-use-cases}

### UC-01: Anonymes Onboarding & Gast-Session
* **Ziel:** Sofortige Nutzbarkeit ohne Registrierungszwang (*Value-First-Funnel*, [ADR-0045](adr/0045-value-first-funnel.md)).
* **Ablauf:**
  1. Nutzer öffnet die Anwendung (Web oder App).
  2. `UserContextGuard` etabliert eine signierte, anonyme Gast-Session ([REQ-002](requirements/register.md#REQ-002)).
  3. Der Nutzer erfasst erste Profildaten oder steigt direkt in den Interview-Einstieg ein ([REQ-012](requirements/register.md#REQ-012)).
  4. Alle temporär erfassten Gastdaten werden isoliert und serverseitig verschlüsselt gespeichert ([REQ-003](requirements/register.md#REQ-003)).
  5. Beim späteren Upgrade auf einen vollwertigen Account (`POST /v1/auth/sign-up/email`) werden alle Gastdaten atomar in das neue Benutzerkonto überführt ([REQ-006](requirements/register.md#REQ-006)).

### UC-02: Minimal-Gate & Drei-Fragen-Interview
* **Ziel:** Schnelle Einordnung der Einkunftsarten und rechtskonformer Ausschluss nicht unterstützter Fälle ([ADR-0031](adr/0031-the-interview-is-three-questions-and-a-catalog.md)).
* **Ablauf:**
  1. Frage 1: Erwerbstätigkeit (`Angestellt`, `Rentner`, `Selbstständig/Gewerbe`, `Beides`).
     * *Gewerbe-Gate:* Selbstständige werden mit transparentem Hinweis auf Version 1.x abgefangen ([REQ-015](requirements/register.md#REQ-015)).
  2. Frage 2: Auslandsbezug (`Inland`, `Schweiz / Grenzgänger`, `Anderes Ausland`).
     * *CH-Only-Gate:* Nur Grenzgänger zur Schweiz werden in Version 1.0 unterstützt ([ADR-0042](adr/0042-grenzgaenger-ch-vertikale.md)).
  3. Frage 3: Kinder (`Ja`, `Nein`).
  4. Alle Antworten werden serverseitig validiert, verschlüsselt in `InterviewAnswer` gespeichert und reduzieren sofort die offenen Punkte im Cockpit.

### UC-03: Erfassung von Einkünften & Belegen
* **Ziel:** Präzise Transkription steuerlicher Ist-Werte ohne Erfindung von Scheinwerten ([ADR-0008](adr/0008-keine-erfundenen-daten.md)).
* **Ablauf:**
  1. **LStB (Lohnsteuerbescheinigung):** Bruttoarbeitslohn, einbehaltene Lohnsteuer, Solidaritätszuschlag, Kirchensteuer, Arbeitnehmerbeiträge zur KV/PV/RV. Jedes Feld ist ehrlich `erfasst`, `offen` oder `unklar`.
  2. **Rentenbezugsmitteilung:** Rentenart (Gesetzlich, Privat, Witwenrente), Jahresbetrag, Rentenbeginn (zur Bestimmung des Besteuerungsanteils § 22 Nr. 1 EStG aus der gesetzlichen Kohortentabelle).
  3. **Kapitalvermögen:** Inländische und ausländische Broker, einbehaltene KapESt, Sparer-Pauschbetrag (801 € bis 2022, 1.000 € ab 2023).
  4. **Vermietung & Verpachtung:** Objektadresse, Mieteinnahmen, Anschaffungskosten Gebäude, Baujahr (lineare AfA nach § 7 Abs. 4 EStG: 2,5 %, 2,0 % oder 3,0 %), Werbungskosten.

### UC-04: Grenzgänger Schweiz (CH-Vertikale)
* **Ziel:** Vollständige Abwicklung des DBA Deutschland-Schweiz ([ADR-0042](adr/0042-grenzgaenger-ch-vertikale.md), [REQ-020](requirements/register.md#REQ-020), [REQ-021](requirements/register.md#REQ-021)).
* **Ablauf:**
  1. Der Nutzer transkribiert den Schweizer Lohnausweis (Bruttolohn Ziffer 1, AHV/ALV Ziffer 9, PK Ziffer 10, Quellensteuer Ziffer 12).
  2. Prüfung der 60-Tage-Nichtrückkehrregel (Art. 15a Abs. 2 DBA-CH): Bei ≤ 60 Tagen gilt der echte Grenzgänger-Status mit 4,5 % pauschaler Schweizer Quellensteuer und Besteuerung im Ansässigkeitsstaat Deutschland.
  3. Automatische Währungsumrechnung CHF → EUR anhand der monatlichen BMF-Referenzkurse oder tatsächlicher Beleg-Wechselkurse.
  4. Vorbereitung der Daten für die amtliche **Anlage N-Gre**.

### UC-05: Steuerberechnung & Veranlagungsartenvergleich
* **Ziel:** Ermittlung der Steuererstattung/Nachzahlung und Vergleich von Einzel- vs. Zusammenveranlagung ([ADR-0034](adr/0034-veranlagungsartenvergleich-returns-a-bounded-comparison.md)).
* **Ablauf:**
  1. Der Rechenkern `@steuereule/core` berechnet das zu versteuernde Einkommen (zvE) durch Abzug von Werbungskostenpauschbetrag, Sonderausgaben, Vorsorgeaufwendungen und Freibeträgen.
  2. Anwendung der exakten § 32a EStG Tarif-Polynome (Grundtarif bzw. Splittingtarif für das jeweilige Steuerjahr 2022–2026).
  3. Berechnung des Solidaritätszuschlags (§ 4 SolZG Freigrenzen und Milderungszone).
  4. **Veranlagungsvergleich:** Bei Verheirateten wird die Steuerlast für Einzelveranlagung (§ 26a EStG) und Zusammenveranlagung (§ 26b EStG) gegenübergestellt. Das Ergebnis liefert eine typisierte Entscheidung: `eindeutig` (mit Sparpotenzial), `zu-knapp` oder `unbestimmt`.

### UC-07: Freischaltung & Bezahlung (Stripe)
* **Ziel:** Rechtssicherer Verkauf des amtlichen Ausdrucks pro Steuerjahr ([ADR-0050](adr/0050-papierweg-statt-elster-in-1-0.md)).
* **Ablauf:**
  1. Der Nutzer fordert den Checkout an (`POST /v1/steuerjahre/{jahr}/ausdruck/checkout`).
  2. Die Vorprüfung validiert, ob der Ausdruck vollständig geliefert werden kann (keine Zahlung bei unvollständigen Stammdaten).
  3. Weiterleitung auf die gehostete Stripe Checkout Page (keine Kreditkartendaten auf unseren Servern).
  4. Einholen der ausdrücklichen Zustimmung zum vorzeitigen Erlöschen des Widerrufsrechts bei digitalen Gütern (§ 356 Abs. 5 BGB).
  5. Nach erfolgreicher Zahlung schaltet ausschließlich der signaturgeprüfte Webhook (`POST /v1/zahlung/stripe/webhook`) das Steuerjahr frei.

### UC-08: Amtlicher Formular-Ausdruck (Papierweg)
* **Ziel:** Erzeugung eines druckfertigen, behördenkonformen Steuererklärungspakets auf amtlichen BMF-Vorlagen ([ADR-0050](adr/0050-papierweg-statt-elster-in-1-0.md)).
* **Ablauf:**
  1. Vorprüfung (`GET /v1/steuerjahre/{jahr}/ausdruck/pruefung`): Prüfung auf Vollständigkeit aller Stammdaten (Name, Steuer-ID, Adresse, Geburtsdatum, Religion nach Art. 9 DSGVO, IBAN, Finanzamt).
  2. Der `FormRenderer` lädt die für das Steuerjahr gepinnten, leeren amtlichen Internet-Vordrucke (`assets/vordrucke/<jahr>/`).
  3. Die ermittelten Werte werden an den exakt vermessenen Feldpositionen mit serifenloser 10pt-Schrift und Dezimalkomma aufgedruckt.
  4. Das fertige PDF enthält den Hauptvordruck ESt 1 A sowie alle belegten Anlagen in amtlicher Reihenfolge.
  5. Der Nutzer druckt das Dokument aus, unterschreibt auf Seite 2 des ESt 1 A und reicht es postalisch beim Finanzamt ein.

### UC-09: Eulen-Modus (KI-Steuerberater)
* **Ziel:** Kontextbezogene, dialogbasierte Steuerberatung und Optimierungsvorschläge ([ADR-0051](adr/0051-eulen-ki-modus.md)).
* **Ablauf:**
  1. Nutzer stellt eine Frage im Chat (z. B. „Kann ich mein Arbeitszimmer absetzen?“).
  2. Der KI-Adapter ruft über gesicherte MCP-Tools den aktuellen Steuerstand ab (mit PII-Maskierung für Steuer-ID, IBAN, Namen).
  3. Das System schlägt konkrete Eintragungen vor (*Proposals* mit Herkunft `Assistent`).
  4. Werte werden niemals ungefragt überschrieben. Der Nutzer sieht den Vorschlag in der Maske „Prüfen & bestätigen“ und entscheidet aktiv per Tap.
  5. Eine Undo-Funktion erlaubt das sofortige Zurücksetzen jeder Assistenten-Änderung.

### UC-11: DSGVO Daten-Export & Kontolöschung
* **Ziel:** Vollständige Erfüllung der Betroffenenrechte nach Art. 15/20 und Art. 17 DSGVO ([ADR-0013](adr/0013-account-deletion.md), [ADR-0016](adr/0016-dsgvo-loeschung-und-export-im-kern.md)).
* **Ablauf:**
  1. **Art. 15/20 Export:** `GET /v1/account/export` entschlüsselt und liefert sämtliche gespeicherten Daten (Profil, Stammdaten, LStB, Renten, Belege, Audit-Logs) als strukturiertes JSON und PDF.
  2. **Art. 17 Löschung:** `DELETE /v1/account` löscht kaskadierend alle Datensätze des Nutzers in sämtlichen Tabellen über eine einzige atomare `$transaction`. DMMF-basierte Deckungstests verhindern verwaiste Steuerdaten.
