# Testabdeckung #450 Teil 4: #443-Features, #451 und #452

Stand: 11.11.2026. Jede Zeile nennt die Datei, die den Punkt prüft. **Lücke** heißt, dass es noch keinen Test gibt; die Folgearbeit steht unten.

## #443: Akzeptanzkriterium × Persona

| AC | Was | Personas / Gates | Art |
| :--- | :--- | :--- | :--- |
| 1 | Kein Datenverlust bei Tab-Wechsel | Ledig, angestellt: `e2e/navigation/hub-acceptance.mjs` (Stammdaten, Eingabe und Scroll-Position nach Cockpit → Belege → Cockpit) | E2E, CI |
| 2 | URL pro Maske, Reload, Zurück/Vor | Ehepaar mit Zusammenveranlagung: `e2e/navigation/deep-links.mjs` (alle 30 Pfade aus `linking.ts`) | E2E, CI |
| 3 | Gast-Deep-Link → nach Anmeldung genau dort | `deep-links.mjs` (LStB, Kinder, Sicherheit über die Konto-Wand) | E2E, CI |
| 4 | Cockpit nach dem Primärbeleg, „Nächster Schritt“ | Lena (01), Markus (02), Hans (05, Rente), Sarah (06), Carlos (12): `e2e/scenarios/*` über `nextStep()` | E2E, Matrix |
| 5 | „Betrag später eintragen“ | Sarah (06, Umzug), `hub-acceptance.mjs` (Gate-Warnung), `apps/api/test/tax-estimate.service.test.ts` (`result.to` + 60 je Betrag, `from` gleich, auch beim Paar) | E2E + Unit |
| 6 | Abgabe-Gate: Blocker sperrt, Warnung nach einmaliger Bestätigung, neue Warnung erneut | `hub-acceptance.mjs` (Blocker LStB offen → führt zur LStB; „Betrag später“ bestätigen; neue Warnung „Werbungskosten über Einnahmen“ sperrt wieder); `deep-links.mjs` (`/ausdruck` → `/abgabe` bei Blocker) | E2E, CI |
| 7 | Sheet schließen speichert den getippten Betrag | LStB-Sheet: `hub-acceptance.mjs`. **Lücke:** Katalog-Beträge und Arbeitstage speichern nur über „Weiter“ (siehe Funde) | E2E, CI |
| 8 | Persona-Booster: Rentner sieht Krankheitskosten statt Pendlerpauschale | Hans (05): Arbeitsweg unter „Weitere Themen“. Weitere Rentner-Personas (11 Klaus) prüfen das nicht eigens | E2E, Matrix |
| 9 | Duales Cockpit, Partner-Masken ohne eigenes Konto | Weber (04), Brenner (02/03), Keller (14), `household.mjs` | E2E |
| 10 | Dark Mode, System / Immer Hell / Immer Dunkel, nach Reload | `e2e/responsive/dark-mode.mjs` | E2E, CI |
| 11 | Zahlen-Tastatur | `e2e/advisor/input-aids.mjs` Row E (Betragsfelder tragen `inputmode="numeric"`) | E2E |
| 12 | Alle Szenarien grün | `e2e/scenarios/run-all-scenarios.mjs` (4 Shards) und `four-scenarios.mjs` | E2E, CI |

**Fachliche Randfälle:**
- **„Betrag später“:** `tax-estimate.service.test.ts` prüft, dass sich die Spanne um genau `UNCERTAINTY_PER_ITEM` je Betrag verschiebt.
- **Grenzwerte von § 35a und § 33:** `packages/core/src/domains/household-services.test.ts` und `extraordinary-burdens.test.ts`.

## #451: Eingabehilfen und Chat-Erlebnis

| Punkt aus „Tests“ | Datei |
| :--- | :--- |
| Enter-Handling (Shift, Plattform) | Unit `chat/chatKeys.test.tsx`; E2E `advisor/chat-experience.mjs` Row A/B |
| Abbruch-Logik (Teiltext, unvollständige Aktion) | Unit `advisor/CopilotBridgeAbort.test.tsx`; E2E `chat-experience.mjs` (Stop mitten in der Antwort) |
| Rotation der Denk-Texte, Reduced Motion | Unit `chat/thinkingLabel.test.tsx`; E2E `chat-experience.mjs` (`emulateMedia`) |
| `lookupPostalCode` inkl. mehrdeutiger PLZ | Unit `packages/core/src/common/postal-codes.test.ts`; E2E `input-aids.mjs` Row C/D |
| Prüfsumme des Diktat-Modells | `apps/mobile-web/scripts/dictation-model-lock.mjs` (Build), Unit `lib/dictation/modelStore.test.tsx` |
| PLZ-Vorbelegung und Ändern, Autofill-Attribute | E2E `input-aids.mjs` Row A–E |
| Enter sendet auf dem Handy nicht | Unit `chatKeys.test.tsx` (Plattform „mobil“), E2E `advisor/chat-experience.mjs` Row G. Seit #476 gibt es kein Dock mehr; geprüft wird die Eingabe des Chats selbst |
| Kein externer Host bei PLZ-Lookup und Diktat Stufe 1; Stufe 2 nur Hugging Face nach Zustimmung | E2E `input-aids.mjs` Row G, `advisor/dictation.mjs` |
| Plan im Chat (Checkliste, zuklappen, Stop, kein PUT ohne Klick) | E2E `advisor/plan-in-chat.mjs`, Engine-Test `apps/api/test/langgraph-advisor.plan.test.ts` |

## #452: Haushalt und Übernahme aus dem Vorjahr

| Punkt aus „Tests“ | Datei |
| :--- | :--- |
| Zusammenführung der Migration, wiederholbar, Tippfehler genau eine Frage | Unit `packages/core/src/common/household.test.ts`; API `apps/api/test/household.service.test.ts`; E2E `household.mjs` Row B |
| Altersregeln (18, 25) | Unit `household.test.ts`; API `household.service.test.ts` |
| BLZ-Lookup, Steuer-ID-Prüfung | Unit `bank-codes.test.ts`, `steuer-id.test.ts` |
| Familienkasse aus Kindergeldnummer | entfällt (Entscheidung #452: keine amtliche Zuordnung) |
| Gnadensplitting-Auswahl | **Lücke:** kein eigener Test gefunden |
| Rechte bei gemeinsamer Bearbeitung, fremder Haushalt | API `household.service.test.ts` („refuses a person from someone else’s household“, „stops sharing once the link has ended“) |
| Crypto-Shredding je Person | API `household.service.test.ts` („endgültig löschen … destroys the person’s key“) |
| Beenden ab Jahr X | API `household.link.test.ts`; E2E `household.mjs` Row F |
| Weber legt 2025 an, startet 2026 → nur Bestätigen | E2E `household.mjs` Row C/D (gleiche Struktur wie Persona 04) |
| Richter mit Kind über die Jahre | E2E `household.mjs` Row C |
| Regression: alle Szenarien gleich vor und nach der Migration | E2E `household.mjs` Row A; `run-all-scenarios.mjs` |

## Funde aus Teil 4 (Folgearbeit)

1. **Sheet schließt ohne zu speichern:** Die Katalog-Betragsfelder und die Arbeitstage-Maske speichern nur über „Weiter“. Wer einen Betrag tippt und das Sheet schließt, verliert ihn. Das widerspricht #443 AC 7. Die LStB-Maske speichert dagegen beim Verlassen des Felds, und dort hält AC 7.
2. **Zurück-Falle nach dem Interview:** Ist das Interview abgeschlossen, springt `/interview` per `navigate` zur nächsten Maske. Browser-Zurück landet wieder im Interview und damit erneut in der LStB. Mit `replace` wäre die Falle weg.
3. **Lücken ohne Test:** Gnadensplitting-Auswahl (#452). (Enter auf dem Handy ist seit #476 durch `chat-experience.mjs` Row G abgedeckt.)
4. **Noch offen in Teil 4:** Visuelle Regression (375 px und 1280 px, hell und dunkel) und axe je Screen in beiden Themes mit Tastatur-Bedienung der Sheets. Sie folgen als eigener PR.
