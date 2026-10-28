# ADR-0050 — 1.0 gibt auf Papier ab: Formular-Ausdruck statt ELSTER, bezahlt pro Steuerjahr beim Ausdruck

- **Status:** Accepted (Stakeholder-Entscheidung 2026-10-28) — Musti-Review des PRs steht aus
- **Date:** 2026-10-28
- **Deciders:** NexusHero (Stakeholder): ELSTER raus aus 1.0, Ausdruck der ausgefüllten
  Formulare; Bezahlung beim Ausdruck; Brevo als E-Mail-Anbieter; Lieferung in einem PR
- **Amends** [ADR-0036](0036-definition-of-done.md) (DoD 1.0, Kriterium 7) und die Roadmap-Entscheidung
  D8 (`docs/roadmap-1.0.md`); ersetzt für 1.0 das „zahlen bei Abgabe" aus Produkt-ADR-017
- **Context tags:** product scope, compliance, payment, DSGVO

## Context

Die 1.0-Roadmap hing an einem externen Taktgeber: dem ELSTER-Hersteller-Zertifikat (Ticket 07).
Die Genehmigung dauert noch, und das Preismodell (Produkt-ADR-017: „zahlen bei Abgabe") hatte
ohne Übermittlung keinen Bezahlpunkt — die App war damit nicht verkaufbar.

Rechtlich ist der Papierweg für die Zielgruppe offen: Eine elektronische Abgabe ist nur bei
Gewinneinkünften Pflicht (§ 25 Abs. 4 EStG); die schließt die App per Gewerbe-Gate aus.
Angestellte, Rentner, Kapital, Vermietung und Grenzgänger-CH dürfen auf Papier abgeben, wenn der
amtlich vorgeschriebene Vordruck verwendet wird (§ 150 Abs. 1 AO). Das BMF-Schreiben vom
12.08.2022 (IV A 5 - O 1561/19/10001 :004) regelt, was ein Ausdruck dafür erfüllen muss:

- **Amtliche Internet-Vordrucke** (auf den Seiten der Steuerverwaltung bereitgestellt und
  ausgedruckt) und **nichtamtliche Vordrucke** (nach dem Muster einer freigegebenen Druckvorlage,
  insbesondere durch Software erzeugt) sind beide zulässig.
- Nichtamtliche Vordrucke übernehmen Layout, Abmessungen, Wortlaut, Kennzahlen, Zeilennummern
  und Seitenfolge vollständig; Gründruck wird Graustufe (15 % Deckung); keine Barcodes; der
  Formularschlüssel ohne „NET"; der Herstellername steht in der Fußzeile.
- Eintragungen: DIN A4 hoch, mindestens 10 pt, serifenlos, Dezimalkomma ohne Tausenderpunkt,
  leere Felder bleiben leer, Minus vor dem Betrag; alle Seiten eines Vordrucks werden abgegeben.

## Decision

1. **1.0 gibt auf Papier ab.** Die App erzeugt pro Steuerjahr die ausgefüllten Formulare
   (Hauptvordruck ESt 1 A und die belegten Anlagen) als druckfertiges PDF. Der Nutzer prüft,
   unterschreibt und reicht ein. ELSTER-Übermittlung ist **kein 1.0-Kriterium** mehr; sie kommt
   als 1.x-Erweiterung, sobald das Zertifikat vorliegt (Ticket 07 läuft weiter).

2. **Vorlagen werden pro Steuerjahr eingecheckt, nicht zur Laufzeit geholt.** Das
   Formular-Management-System der Steuerverwaltung liefert seine PDFs nur sitzungsgebunden über
   eine Formular-Engine aus; ein maschineller Abruf ist weder stabil noch geklärt. Die leeren
   Vordrucke eines Jahres werden einmal beschafft und unter `apps/api/assets/vordrucke/<jahr>/`
   abgelegt; jede Feldposition wird gegen genau diese Vorlage getestet. Bis die Vorlagen da sind,
   bietet die App keinen Ausdruck an — kein improvisiertes Layout, das wie ein Vordruck aussieht.
   **Offen, vor dem ersten Verkauf zu klären:** ob ein maschinell befülltes Portal-PDF (Schlüssel
   mit „NET") als amtlicher Internet-Vordruck gilt oder als nichtamtlicher Vordruck mit
   Graurasterung und Herstellerangabe erzeugt werden muss (Steuerberater/Finanzamt).

3. **Bezahlt wird beim Ausdruck, einmal pro Steuerjahr.** Erfassen, Prüfen und die Spanne bleiben
   kostenlos. Die Freischaltung läuft über Stripe Checkout (gehostete Seite, keine Kartendaten auf
   unserem Server, Rechnung über Stripe). **Nur der signaturgeprüfte Webhook schaltet frei** — die
   Rückleitung des Browsers beweist nichts. Vor der Zahlung stimmt der Nutzer im Checkout dem
   sofortigen Beginn zu und bestätigt das Erlöschen des Widerrufsrechts (§ 356 Abs. 5 BGB). Ohne
   Stripe-Konfiguration ist die Freischaltung ehrlich „nicht verfügbar".

4. **E-Mail über Brevo (EU).** Der `EmailSender`-Seam (ADR-0012 §6) bekommt den produktiven
   Anbieter; eine Produktion ohne Anbieter bootet nicht (`EMAIL_DELIVERY=log` als bewusste Wahl
   für den lokalen Prod-Stack). Schließt #83.

5. **Rechtsseiten im Produkt.** Impressum, Datenschutzerklärung, AGB mit Widerrufsbelehrung und
   ein Hinweis „keine Steuerberatung" liegen als Code vor, gegen das echte Verhalten geschrieben;
   Anbieterangaben kommen aus der Build-Umgebung. Die Texte sind ein **Entwurf** und werden vor
   dem ersten Verkauf anwaltlich geprüft.

## Consequences

- Die 1.0 hat keinen externen Behörden-Taktgeber mehr; was sie noch blockiert, liegt bei uns
  (Infra-Track #292, Vorlagen, Rechtsprüfung, DSGVO-Audit, Durchlauf auf echter URL).
- Pro Steuerjahr entsteht Pflegeaufwand: neue Vorlagen beschaffen, Feldpositionen nachziehen. Das
  ist der Preis dafür, ohne Zertifikat verkaufen zu können.
- Der Ausdruck selbst ist der nächste Schnitt (Ticket 11, „Abgabe-bereit-Paket"); die
  Freischaltung (`FreischaltungService.status`) ist sein Tor und bereits gebaut.
- Die Übersetzung „zahlen bei Abgabe" → „zahlen beim Ausdruck" ändert für den Nutzer den Moment,
  nicht das Prinzip: gezahlt wird erst, wenn das Ergebnis da ist.

## Umsetzung der Vorlagen (2026-10-28, gleicher PR)

- Die Vorlagen 2025 kamen vom Stakeholder als ZIP aus dem Formular-Management-System:
  amtliche Internet-Vordrucke (Formularschlüssel `…NET`, Barcodes, bereits grau gerastert),
  **ohne Formularfelder**. Sie liegen unverändert unter `apps/api/assets/vordrucke/2025/`,
  gepinnt per SHA-256 (`apps/api/src/ausdruck/vordrucke-2025.json`). Anlage R und V fehlen noch.
- Feldpositionen werden nicht getippt, sondern mit `scripts/vordrucke/vermessen.mjs` aus den
  Vorlagen vermessen: Anker ist ein gedrucktes Wort (Label, Kennzahl, Zeilennummer), Ziel der
  weiße Eingabekasten bzw. Rahmen, den das Formular selbst zeichnet. Das Ergebnis
  (`felder-2025.json`) trägt die SHA-256 jeder Vorlage; ein Tausch ohne Neuvermessung wird rot.
- Die Vorlagenseiten werden unverändert übernommen, nur Werte werden aufgedruckt. Damit bleibt
  der Ausdruck so nah wie möglich am amtlichen Internet-Vordruck; die rechtliche Einordnung
  (Punkt 2, „offen") ist davon unberührt und weiter vor dem ersten Verkauf zu klären.
- Für den Hauptvordruck braucht es Angaben, die die App vorher nicht erfasste (Anschrift,
  Geburtsdatum, Religion, Familienstand, IBAN, Finanzamt): eigenes, verschlüsseltes Modell
  `Stammdaten` (REQ-030); die Religion nur mit Einwilligung nach Art. 9 DSGVO.
- Bewusst leer bzw. gesperrt: Lohnsteuer Kz 140 (App kennt nur ganze Euro, eDaten liegen vor);
  Verheiratete, bis Veranlagungsart und Person B erfasst werden.

## Decision history

- 2026-10-28: Vorlagen 2025 eingecheckt, Stammdaten erfasst, Ausdruck ESt 1 A + Anlage N gebaut.
- 2026-10-28: Stakeholder-Entscheidung im 1.0-Readiness-Review; umgesetzt im PR
  „1.0-Readiness: Papierweg, Zahlung, E-Mail, Recht, DSGVO-Lücken".
