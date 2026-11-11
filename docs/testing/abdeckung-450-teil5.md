# Testabdeckung #450 Teil 5: Dialoge, Uploads, Fehlerzustände

Stand: 11.11.2026. Ergänzt [abdeckung-450-teil4.md](abdeckung-450-teil4.md). **Lücke** heißt, dass es noch keinen Test gibt.

| Teil | Was | Datei | Art |
| :--- | :--- | :--- | :--- |
| 5A | Konto, Sicherheit, 2FA, Geräte, OAuth | `e2e/account/account-security.mjs` | E2E, CI (früherer PR) |
| 5B | Bestätigungs-Screen: Vorschlag annehmen/verwerfen, Anlage bestätigen, einzeln ändern, Plausibilität weiter | `e2e/submission/confirmation.mjs` | E2E, CI |
| 5B | Gate: Blocker, Warnung bestätigen, neue Warnung erneut | `e2e/navigation/hub-acceptance.mjs` (nicht doppelt) | E2E, CI |
| 5C | Ausdruck: bezahlen (Fake-Zahlungsanbieter), Webhook mit Signatur, beide Downloads | `e2e/printout/printout-unlock.mjs`, Unit `apps/api/test/fake-payment-provider.test.ts` | E2E, CI |
| 5D | Belege: Upload, Vorschau, Löschen mit Bestätigung | `e2e/uploads/receipts-and-lstb-scan.mjs` | E2E, CI |
| 5D | LStB-Scan: Entwurf, Zero-Write, Felder bestätigen, „überschreiben?“ (bestätigen und abbrechen), „falsches Jahr“ (abbrechen und wechseln) | dieselbe Datei, synthetische PDFs aus `e2e/fixtures/synthetic-documents.mjs` | E2E, CI |
| 5D / 3C | Beleg im Eulen-Chat, Foto-Scan (OCR), Felder einzeln bestätigen, Tab-Wechsel, Reload, Löschen | `e2e/scan-corpus/flows.mjs` | E2E, CI |
| 3A/3B | Scan-Korpus, Kennzahlen je Variante | `e2e/scan-corpus/` (siehe README dort) | E2E, CI |
| 5E | Fristen-Banner `abgelaufen`, `warnung`, keins | `e2e/errors/deadlines-and-faults.mjs` | E2E, CI |
| 5E | 500 auf Interview-Antwort, LStB laden (Fehler-Screen, „Erneut versuchen“), LStB speichern (Hinweis, Eingabe bleibt), offline | dieselbe Datei | E2E, CI |
| 5F | Eulen-Modus | `e2e/advisor/owl-mode-fake-ki.mjs` (früherer PR) | E2E, CI |
| 5G | verwitwet, § 24b-Haushaltsfragen (Ja/Nein beide Wege), durchlässige Gates, Wohnsitz Schweiz/Deutschland, Berufsprofil (alle 8) | `e2e/interview/rare-branches.mjs` | E2E, CI |
| 5G | **Lücke:** Kinder-Zweige (`kind-ae-*`, nicht gemeldet, Kindergeld nicht an mich, Ausland), Cockpit-Leerzustände, Eule-Banner, QR-Karte | | |
| 5H | Sheet: Schließen-Knopf, Klick daneben, Escape, Grabber (ziehen und kurz ziehen) | `e2e/sheets/sheet-dismissal.mjs` | E2E, CI |
| 5I | Ratchet über testIDs und Interview-Paare | `scripts/checks/e2e-coverage-ratchet.mjs` | CI |
| 5J | Kombinationen bis zur Spanne, eine Tabelle | `apps/api/test/interview-combinations.test.ts` | Unit, CI |
| 5J | **Lücke:** Szenario 15/16 legen das Kind nicht vollständig an; Gnadensplitting-Auswahl (#452) | | |

## Entscheidungen und Abweichungen vom Ticket

- **Fristen-Banner ohne `page.clock`:** Die Frist wird auf dem Server mit dem Berliner Datum gerechnet. Eine Browser-Uhr verschiebt sie nicht. `abgelaufen` kommt echt vom Server (Steuerjahr 2025, Frist 31.07.2026 ist vorbei), `warnung` über eine abgefangene Antwort.
- **Zahlung (D7):** `PAYMENT_FAKE_PROVIDER=1` wählt außerhalb von Produktion einen Fake-Anbieter. Stripe-Schlüssel haben Vorrang, in Produktion mit gesetztem Flag startet die API nicht. Der Fake ruft sofort die Erfolgs-URL auf; das „bezahlt“-Ereignis schickt der Test mit der Fake-Signatur an den echten Webhook. Stripe-Testmodus nachts bleibt offen.
- **Kombinationen (5J):** Sie laufen als API-Test gegen die Fake-Repositories statt als Browser-Lauf. Die Erwartungen kommen aus den Core-Parametern (`singleParentReliefEur`, `singleParentAdditionalChildEur`), nicht aus festen Eurobeträgen. Rente und Beides liefern heute `nicht-moeglich`; das prüft die Tabelle als ehrlichen Zustand.
- **Ratchet:** Er zählt, ob eine testID oder ein Paar (Schritt × Wert) in einem E2E-Selektor oder einer Antworten-Tabelle vorkommt. Das ist eine statische Näherung, kein Laufzeitnachweis. Ausnahmen mit Begründung stehen in `scripts/checks/e2e-coverage-exceptions.json` (Segment 2, § 35a/§ 33-Booster hinter dem Feature-Flag).
