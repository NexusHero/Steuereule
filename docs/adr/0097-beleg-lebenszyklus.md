# ADR-0097 — Beleg-Lebenszyklus: Jeder Beleg sagt, was aus ihm wurde

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/receipt-processing.ts` (neu)
  - `apps/api/src/receipt/{receipt-parse.service,receipt.service,receipt.controller,receipt.repository*}.ts`
  - `apps/api/prisma/schema.prisma` (`Receipt`), eine Migration
  - `apps/mobile-web/src/screens/receipts/ReceiptsScreen.tsx`, `apps/mobile-web/src/screens/advisor/{AdvisorChatPanel,OwlModeScreen,CopilotBridgeProvider}.tsx`
- **Baut auf:** ADR-0040 (Beleg-Posteingang: Fakten speichern, Zustand ableiten), ADR-0092 (Wem gehört ein Beleg?), ADR-0059 (Keystore)

## Kontext

Echtdaten-Test vom 18.11.2026 mit sieben Belegen über Belege-Tab und Chat:

- Nach Lesen und Übernehmen steht die Spende weiter als „Sonstiges · Unzugeordnet · für: noch niemand“, oben „6 OFFEN“ für sechs Belege, von denen zwei fertig sind.
- Beim Sammel-Upload bleibt nur die Rückmeldung der letzten Datei stehen. Handwerker-Auftragsbestätigung und Waage hatten keine: Der Nutzer hält sie für erfasst.
- Die Spende 2024 landet als Entwurf im Steuerjahr 2024, ohne Hinweis im Chat von 2025; der Belege-Tab zeigt sie als „2025“.
- Sieben Upload-Wege laufen über drei verschiedene Abläufe (nur speichern; speichern und auf Knopfdruck lesen; speichern und lesen). Der Schweizer Lohnausweis in der Maske wird nur abgelegt, obwohl der Text dort mehr verspricht.
- Kein Weg zeigt, welche Felder ein Beleg gefüllt hat, und kein Feld, aus welchem Beleg es kommt.

Die gemeinsame Ursache: Ein Beleg hat keinen eigenen Verarbeitungsstand. Was beim Lesen herauskam, lebt nur im Client und nur für die letzte Datei.

## Entscheidung

1. **Verarbeitung als abgeleiteter Zustand.** Wie die Jahreszuordnung (ADR-0040) wird der Stand nie gesetzt, sondern aus Fakten abgeleitet, in einer reinen Funktion im Kern:

   | Zustand | Bedeutung | offen? |
   |---|---|---|
   | `neu` | hochgeladen, noch nicht gelesen | ja |
   | `nicht_lesbar` | Lesen fehlgeschlagen (Grund) | ja |
   | `vorschlaege` | Werte als Entwürfe vorgeschlagen, mindestens einer wartet | ja |
   | `uebernommen` | alle Entwürfe entschieden, mindestens einer übernommen | nein |
   | `nichts_verwertbar` | gelesen, nichts für die Erklärung (Grund, z. B. „keine Rechnung“, „nicht absetzbar“) | nein |
   | `verworfen` | alle Entwürfe verworfen | nein |

   Dazu kommt, getrennt davon, **das Steuerjahr der Entwürfe**: Liegen sie in einem anderen Jahr als dem gerade geöffneten, sagt der Beleg das („liegt im Steuerjahr 2024“).

2. **Fakten am Beleg.** Das Lesen schreibt sein Ergebnis an den Beleg: wann gelesen, mit welchem Ausgang (`werte`, `nichts`, `fehler`) und Grund, und das Steuerjahr, in das die Entwürfe gingen. Die Entwürfe selbst tragen schon heute ihre `receiptId`; Zahl und Status der Entwürfe je Beleg werden daraus gezählt, über alle Steuerjahre.

3. **Eine Rückmeldung je Datei.** Chat, Belege-Tab und Masken zeigen denselben abgeleiteten Zustand. Ein Sammel-Upload endet mit einer Zeile je Datei, aus dem Server-Zustand, nicht aus flüchtigem Client-Zustand.

4. **Ein Upload-Weg.** Jeder Einstieg (Belege-Tab, Chat, Maske) läuft durch denselben Ablauf: speichern, lesen, Wem gehört er?, Jahr, Entwürfe. Der Einstieg gibt nur Kontext mit (erwartete Art, Person, Maske). Der Belege-Tab liest jeden Beleg nach dem Hochladen selbst. Werte bleiben Entwürfe, bis der Nutzer sie übernimmt (Zero-Write).

5. **Eine Jahres-Regel.** Gehört ein Beleg in ein anderes Steuerjahr, gehen seine Entwürfe dorthin, und Chat und Beleg sagen es mit einem Link zum Wechseln. Nichts blockiert. Das Jahr, in das die Entwürfe gingen, wird zum Jahr des Belegs, solange der Nutzer keines gewählt hat. Das gedruckte Datum zählt dafür nicht: Es ist oft das Ausstellungsdatum (eine Spendenbescheinigung vom Januar 2026 gilt für 2025). Der Leser bestimmt das Jahr nach § 11 EStG für seine Belegart. Ein Beleg ohne Verwertbares fragt nach keinem Jahr.

6. **Rückverfolgbar und Löschen.** Der Beleg nennt die Felder, die er gefüllt hat; das Feld nennt seinen Beleg. Beim Löschen nennt die App die gefüllten Werte und fragt, ob sie mit entfernt werden sollen, vorausgewählt „ja“.

7. **Dubletten.** Ein eigener Inhaltsschlüssel je Nutzer (verschlüsselter Hash des Klartexts, nicht der Ciphertext-MAC) erkennt denselben Beleg beim zweiten Hochladen.

## Umsetzung

Alles in einem Pull Request (Entscheidung des Product Owners), in dieser Reihenfolge gebaut:

1. Zustand und Belege-Tab, Rückmeldung je Datei im Chat (Punkte 1–3).
2. Ein Upload-Weg und die Jahres-Regel (Punkte 4–5).
3. Rückverfolgbarkeit, Löschen, Dubletten, Darstellung aus einem Modul für Datum und Betrag (Punkte 6–7).

## Folgen

- Ein Vertragstest hält fest: Jeder hochgeladene Beleg erreicht einen Zustand, den der Belege-Tab zeigt. Eine E2E-Zeile lädt einen Stapel mit falschem Jahr, nichts Absetzbarem und einer Dublette.
- Die Zählung der Entwürfe je Beleg liest die Eulen-Nachrichten; sie muss billig bleiben (nur Metadaten, keine Inhalte).
- „Offen“ im Belege-Tab bedeutet künftig „noch nicht fertig verarbeitet“, nicht mehr „ohne Jahr“.
