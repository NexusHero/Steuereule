# ADR-0092 — Belegzuordnung: Wem gehört ein Beleg?

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/document-assignment.ts`, `packages/core/src/interview/advisor.ts` (`combination`)
  - `apps/api/src/receipt/{receipt-parse.service,receipt-reassign.service,receipt-parse.controller,receipt.repository*}.ts`, `apps/api/src/receipt/dto/{parse-receipt,reassign-receipt,receipt-response}.dto.ts`
  - `apps/api/src/advisor/advisor.service.ts` (`householdMembers`, `takeBackDocumentValues`, „zusätzlich oder ersetzen“)
  - `apps/api/src/confirmation/confirmation.service.ts` (`valueWithSource`)
  - `apps/api/src/{lstb-scan,ch-certificate-scan,receipt/parse}/` (ein Beleg, eine Person)
  - `apps/api/prisma/` (Spalten `Beleg.inhaber`, `Beleg.inhaberSteuerjahr`)
  - `apps/mobile-web/src/{lib/receipts,screens/receipts,screens/lstb/scan,screens/advisor}/`
  - `e2e/forms/real-case-additions.mjs` (Zeilen I–N), `e2e/scenarios/25-familie-sommer-eskalation.mjs`
- **Baut auf:** ADR-0060 (Text nur vom Gerät), ADR-0066 (ein Schreibweg), ADR-0080 (KV-Auszug, gezählte Posten), ADR-0087/0088 (Person B), ADR-0090 (Strom gegen Chat), ADR-0091 (Einwilligung, Sicherheitsnetz)
- **Schließt:** ADR-0091 §8 „Offen: die dauerhafte Zuordnung von Belegen“; Funde C2, C5, N1, N2 aus dem Vergleich Strom gegen Chat

## Kontext

Belege kommen an drei Stellen in die App: in einer Maske (LStB-Scan, auch für Person B), im Belege-Tab und im Chat der Eule. Bisher entschied der Name auf dem Beleg, wem er gehört, und nur dort, wo eine Person B schon angelegt war. Der Vergleich Strom gegen Chat zeigte die Folgen:

- **C2:** Ohne Person B landeten Noras Belege bei Elias und verdrängten seine Entwürfe.
- **C5:** Ein Familien-Krankenkassenauszug und Kita-Bescheinigungen ließen sich ohne Kinder oder B nicht zuordnen.
- **N1:** Das Sicherheitsnetz aus ADR-0091 §8 griff nur, wenn A's Name bekannt war. Mit leerem Profil kam ein fremder Beleg wieder bei A an.
- **N2:** Der Familienauszug zählte 2.100 CHF auf die 2.100 CHF, die der Nutzer schon im Chat genannt hatte: 4.200 CHF.

Der Product Owner hat die Zuordnung in einer Grilling-Runde entschieden.

## Entscheidung

1. **Der Ort des Uploads entscheidet.**
   - Ein Upload im Bereich einer Person gehört dieser Person. Das ist die Maske von B oder eines Kindes, und für A die eigene Maske. Die Maske schickt dazu `area` mit.
   - Im Chat und im Belege-Tab fragt die App „Für wen?“. Das gilt nur, wenn mehr als eine Person des Haushalts diesen Beleg haben kann. Eine LStB kann nur A oder B gehören, eine Kita-Bescheinigung nur einem Kind, ein KV-Auszug jedem.
   - Die Person, deren Name auf dem Beleg steht, ist vorausgewählt. Passt die erkannte Namenszeile zu niemandem, zählt ein Erwachsener, dessen voller Name irgendwo im Text steht. So druckt etwa ein Pensionskassen-Nachweis den Namen neben dem Geburtsdatum.
   - Die Belege eines Ein-Personen-Haushalts gehören ohne Frage dieser Person.
   - Belege der gemeinsamen Erklärung fragt die App nie. Das sind zum Beispiel Spenden, Handwerker und Krankheitskosten.
   - Eine Regel entscheidet, kein Modell: `decideDocumentHolder` in Core. Die Namen bleiben auf Gerät und Server.
   - Bis die Frage beantwortet ist, wird nichts gelesen und nichts vorbereitet.
2. **Widerspruch.** Steht auf dem Beleg klar jemand anderes als die Person der Maske, fragt die App kurz nach: „Der Beleg lautet auf Jonas, du bist bei Nora – für wen?“ Wählt der Nutzer die andere Person, warten die Werte in der Eule und nicht in dieser Maske.
3. **Unbekannte Person.** Nennt der Beleg niemanden aus dem Haushalt, bietet die App „Als Person B anlegen“ oder „Als Kind anlegen“ an.
   - Vorname, Nachname, Geburtsdatum und Steuer-ID kommen aus dem Beleg (`printedPersonDetails`, auf dem Gerät gelesen). Der Nutzer prüft sie und kann sie ändern.
   - Danach wird der Beleg der neuen Person zugeordnet.
   - Das Anlegen läuft über dieselben Endpunkte wie die Masken: Kopplung und Person B, Kinder. Weil der Nutzer selbst klickt, braucht es die Einwilligung aus ADR-0091 nicht. Legt die Eule B oder ein Kind an, gilt weiter ADR-0091.
4. **Umhängen.**
   - Jeder Beleg zeigt im Belege-Tab „für: <Name>“. Mit einem Tipp wählt der Nutzer eine andere Person: `POST /v1/belege/:id/inhaber`.
   - Bei der bisherigen Person nimmt die App alles zurück, was nur von diesem Beleg kam. Ein Feld wird nur zurückgesetzt, wenn es noch genau den Wert hat, den der Beleg geschrieben hat. Werte aus anderen Quellen bleiben. Hat ein Beleg „zusätzlich“ geschrieben, bleibt der alte Teil stehen.
   - Die App liest den Beleg auf dem Gerät noch einmal und schreibt seine Werte für die neue Person gleich mit. Steht dort schon ein Wert, fragt sie erst „zusätzlich oder ersetzen?“ (Punkt 6).
   - Bei der ersten Zuordnung eines Belegs ohne Werte bereitet die App nur Entwürfe vor.
5. **Ein Beleg, eine Person.**
   - Bei einem Beleg für mehrere Personen liest die App nur die Zeilen der gewählten Person. Beispiele: der Familien-Krankenkassenauszug, eine Kita-Bescheinigung für zwei Kinder (`sectionForMember`).
   - Für die anderen Personen, die der Beleg nennt, bietet sie „Auch für Jonas übernehmen?“ an.
   - Das verknüpft denselben Beleg auch mit dieser Person, mit ihren eigenen Zeilen (`alsoFor`).
6. **Zusätzlich oder ersetzen, nie still (N2).**
   - Hat das Feld für diese Person schon einen Betrag, fragt die App nach. Der Betrag kann aus einem anderen Beleg kommen, von Hand eingetragen oder im Chat genannt sein.
   - Die Frage lautet „zusätzlich (zweiter Arbeitgeber) oder ersetzen (Korrektur)?“. Beide Wege kommen als zwei alternative Entwürfe (`combination: add | replace`, eine `alternativeGroup`). Der Nutzer übernimmt einen, der andere fällt weg.
   - Ohne Frage geschrieben wird ein Betrag nur in diesen Fällen: Das Feld ist leer oder 0, der Betrag ist gleich, oder der Wert stammt von diesem Beleg selbst.
   - Woher ein Wert kommt, liest `valueWithSource` aus der vorhandenen Herkunft (`Kennzeichnung.herkunftBelegId`).
   - Das gilt auch für Summenfelder wie Spenden, Arbeitsmittel und Krankheitskosten. Sie zählten bisher still dazu.
   - In der LStB-Maske bleibt es bei ihrer eigenen Wahl „hinzufügen / ersetzen“. Die Chat-Karte der LStB zeigt dazu einen Hinweis.
7. **Eine Regel für alle Wege.** `ReceiptParseService` entscheidet die Zuordnung, bevor er den Beleg an seinen Leser gibt. Das gilt für die Maske, den Belege-Tab, den Chat und Aufrufe über die API.
8. **N1 – „Bist du …?“.** Ist A's Name im Profil noch leer und nennt der Beleg einen Namen, fragt die App einmal „Bist du Nora Sommer?“.
   - Bei „Ja“ gehört der Beleg A. Der Name geht in A's leeres Profil, wenn der Nutzer das Häkchen stehen lässt. Danach fragt die App nicht mehr.
   - Bei „Nein“ behandelt die App die Person wie eine unbekannte (Punkt 3).

## Datenmodell

- **`Beleg.inhaber`**: `A`, `B` oder `kind:<id>`, durch Kommas getrennt. Der erste Eintrag ist die Person, der der Beleg gehört. Die weiteren sind die Personen, für die er auch übernommen wurde (Punkt 5). Weil das eine Familienbeziehung ist, ist die Spalte feldverschlüsselt (`@encrypted?mode=strict`, in `prisma-encrypted-fields.test.ts` geführt).
- **`Beleg.inhaberSteuerjahr`**: das Steuerjahr, auf das sich die Personen beziehen. B und die Kinder gibt es je Jahr. Die Spalte ist unverschlüsselt wie `steuerjahr`.
- Die Migration `20261114230000_receipt_holders` ergänzt nur zwei Spalten, die leer sein dürfen.
- Die Verbindung zwischen Beleg und Werten gab es schon, die App nutzt sie wieder:
  - die `receiptId` auf jedem Entwurf,
  - die Herkunft `beleg` mit `herkunftBelegId` in `Kennzeichnung`,
  - der `undoSnapshot` eines übernommenen Entwurfs.
- Umhängen heißt: die übernommenen Entwürfe dieses Belegs zurücknehmen (`takeBackDocumentValues`, Audit `beleg_zuordnung`), seine offenen Entwürfe verwerfen und den Beleg neu lesen.

## Folgen

- Im Chat eines Haushalts mit mehreren Personen kommt jetzt immer erst „Für wen?“. Das gilt auch, wenn der Name passt. Szenario 25 beantwortet die Frage mit der vorausgewählten Person. Über die API übernimmt es den Familienauszug „auch für“ alle Genannten.
- Summenfelder fragen ab dem zweiten Beleg „zusätzlich oder ersetzen?“. Das ist ein Klick mehr, dafür zählt nichts doppelt.
- **Tests:**
  - Core: `document-assignment.test.ts`.
  - API: `document-assignment.test.ts` (Ort, „Für wen?“, Widerspruch, unbekannte Person, N1, Umhängen, Familienauszug, Kita für zwei Kinder, N2, Maske) sowie die angepassten `ch-health-statement.test.ts`.
  - App: `DocumentAssignmentCard.test.tsx`, `documentAssignment.test.tsx`, `LstbScreen.test.tsx` (Widerspruch in B's Maske) und `ReceiptsScreen.test.tsx` („für: …“, Umhängen).
- **E2E:** `real-case-additions` Zeilen I–N:
  - I: Familienauszug mit „Für wen?“ und „auch für Anna“.
  - J: zusätzlich oder ersetzen.
  - K: Umhängen im Belege-Tab.
  - L: Person B aus einem Beleg anlegen.
  - M: Ort und Widerspruch in B's Maske.
  - N: „Bist du …?“.
  - Zeile F fragt jetzt „Für wen?“ statt „Wessen?“.
- **Offen:**
  - Die Masken der Kinder und die Grenzgänger-Maske haben noch keinen eigenen Upload. Der Ort „Kind“ ist in der Regel und in der API vorhanden.
  - Arbeitsmittel und andere Werbungskosten-Belege gehen weiter an A. Sie gelten als Belege der gemeinsamen Erklärung, obwohl Werbungskosten je Person zählen.
  - Hängt der Nutzer einen Beleg um, der „auch für“ andere übernommen war, nimmt die App die Werte aller Personen zurück. Danach gehört er nur der neuen Person.
  - Wurde nach einem Beleg noch ein weiterer „zusätzlich“ übernommen, nimmt das Umhängen den Anteil des ersten nicht heraus. Das Feld hat sich seitdem geändert, deshalb bleibt es stehen.
