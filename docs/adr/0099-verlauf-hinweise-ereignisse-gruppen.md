# ADR-0099 — Verlauf: Hinweise, Lebensereignisse und Gruppen

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/year-history.ts` und neue Kernfunktionen, `apps/api/src/year-history/*`, `apps/api/prisma/schema.prisma` (neue Felder), `apps/mobile-web/src/screens/history/*`
- **Baut auf:** ADR-0098 (Steuer-Verlauf, Zeitleiste), ADR-0097 (Beleg-Lebenszyklus), ADR-0039 (Steuerjahr-Zustände), ADR-0049 (Festsetzungsfrist), ADR-0032 (nichts versprechen)
- **Mock:** `docs/mocks/steuer-verlauf-ideen.html`

## Kontext

Nach dem Umbau zur Zeitleiste (ADR-0098) war der Verlauf ein Bildschirm, der sagt, was ansteht. Er sagte aber nichts über Jahre, die gar nicht in der App sind, über Posten, die jedes Jahr wiederkommen, und über die Lage einzelner Gruppen (Grenzgänger, Vermieter, Anleger, Rentner). Der Mock zeigt alle Ideen; der Product Owner hat sie in einer Grilling-Runde entschieden.

## Entscheidung

Alles in einem Pull Request, ohne Prognose (ADR-0098 §7 gilt weiter).

1. **Hier liegt noch Geld.**
   - Die Zeitleiste zeigt immer die letzten vier Jahre der Festsetzungsfrist, auch ohne Daten, dazu ältere Jahre mit Daten.
   - Ein Jahr ohne Daten fragt einmal: „Schon abgegeben?“ **Ja** = anderswo abgegeben, wartet auf den Bescheid-Upload (Status `extern-erledigt` mit der Markierung „noch ohne Bescheid“). **Nein** = offenes Jahr, in „Jetzt wichtig“ mit „bis 31.12.JJJJ möglich“. **Weiß nicht** = die Frage kommt drei Monate vor Fristende noch einmal.
   - Einen Betrag gibt es nur, wenn das Jahr eigene Fakten hat (Spanne des Kerns). Werte aus Vorjahren werden nie hochgerechnet.
   - Jahre mit Bescheid tragen „änderbar bis …“.
2. **Kommt jedes Jahr wieder.** Auf der Seite des offenen Jahres eine Checkliste der Posten, die in einem der letzten zwei Jahre vorkamen. Der Vorjahresbetrag steht als Hinweis, nie als Vorausfüllung.
3. **Vorauszahlungen.** Bei jeder Nachzahlung laut Bescheid der Hinweis „Vorauszahlungen anpassen lassen (Antrag beim Finanzamt)“, keine Spartipps. Die Nachzahlungen über die Jahre stehen als Tab auf „Entwicklung“.
4. **Lebensereignisse.** Nur aus vorhandenen Daten abgeleitet, als Marker auf der Zeitleiste: Wechsel zur Zusammenveranlagung, Kind, neuer Arbeitgeber, Start als Grenzgänger, Umzug, Immobilienkauf. Keine eigene Eingabe.
5. **Wiederholt gekürzt.** Dieselbe Position in mindestens zwei Bescheid-Jahren gekürzt: als Muster auf der Jahresseite und in der Checkliste des offenen Jahres.
6. **Paare.** Für jedes Bescheid-Jahr eines Paares der Vergleich in beide Richtungen („Zusammen veranlagt hat … gebracht“ / „Einzeln wären es … mehr gewesen“), gerechnet im Kern (`filingTypeComparison`). Bei gemeinsamem Bescheid kommt die Aufteilung je Person aus den Fakten der eingereichten Fassung und heißt „Rechnung der App, etwa“, mit Spanne bei Unsicherheit; exakt nur bei zwei Einzelerklärungen.
7. **Gruppen als Tabs auf „Entwicklung“,** nur mit Daten:
   - Grenzgänger: Kurs je Jahr, angerechnete Quellensteuer, Anteil des Schweizer Einkommens.
   - Vermieter: Ergebnis je Objekt und Jahr, AfA mit Restwert, 15-%-Grenze (anschaffungsnahe Herstellungskosten, § 6 Abs. 1 Nr. 1a EStG) in den drei Jahren nach dem Kauf.
   - Kapital: genutzter Sparer-Pauschbetrag, Günstigerprüfung.
   - Rentner: Besteuerungsanteil und Rentenfreibetrag.
   - Verlustvortrag und Verlustverrechnungstöpfe: „noch nicht erfasst“.
8. **Neue Felder, nur die günstigen:** Anschaffungsdatum und Erhaltungsaufwand je Objekt und Jahr; Datum und Ergebnis eines Einspruchs; Arbeitgeber auf der Lohnsteuerbescheinigung. Jedes Mietobjekt bekommt eine feste Kennung, die die Jahresübernahme mitnimmt, damit es über die Jahre verfolgbar ist.
9. **Unterlagen.** Eine Zeile am Ende der Zeitleiste öffnet eine Seite mit den Bescheiden als Liste (einzeln herunterladbar), der Dauer von der Abgabe bis zum Bescheid (ab zwölf Wochen ohne Bescheid „Nachfragen lohnt sich“) und der Einspruch-Historie.

## Folgen

- Der Haupt-Tab bleibt ein Bildschirm: neue Hinweise erscheinen in „Jetzt wichtig“ (eines zur Zeit) oder auf Unterseiten.
- Neue Fakten sind feldverschlüsselt wie ihre Nachbarn (ADR-0008); alles bleibt nutzergebunden (ADR-0007), nichts wird über Nutzer hinweg ausgewertet.
- Die Paare-Rechnung ist bei gemeinsamem Bescheid eine Näherung und sagt das.
- Prognose und Vergleich mit anderen Nutzern bleiben draußen.
