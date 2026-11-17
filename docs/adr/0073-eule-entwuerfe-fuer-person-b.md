# ADR-0073 — Eule: Entwürfe für Person B in der Zusammenveranlagung

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/{advisor-household,advisor,ki-port}.ts`, `packages/core/src/common/pii-masking.ts`, `apps/api/src/ki/{advisor-tools,advisor-tool-round,advisor-prompt}.ts`, `apps/api/src/advisor/{advisor.service,advisor-drafts,advisor-case-facts}.ts`, `apps/api/src/link/link.service.ts`, `apps/api/skills/berater-interview/SKILL.md`, `apps/mobile-web/src/screens/advisor/chat/ProposalCards.tsx`
- **Baut auf:** ADR-0054 (Person A erfasst für Person B mit), ADR-0038/ADR-0066 (Zero-Write, ein Schreibweg, Feldkatalog)

## Kontext

Entwürfe der Eule (`stage_field_draft`, `propose_two_paths`) kannten Maske, Feld und Eintrag, aber
keine Person. In einer Zusammenveranlagung, in der Person B kein eigenes Konto hat, ließ sich
deshalb nichts von dem, was der Nutzer über seine Frau oder seinen Mann erzählt, über den Chat
eintragen. Im Realfall-Test nannte ein Ehepaar den Schweizer Lohnausweis und den Arbeitsweg der
Ehefrau: Die Eule konnte nichts vorbereiten, und die eingebauten Regeln (Rückfall ohne Modell)
trugen die „24 km“ der Ehefrau als Arbeitsweg des Ehemanns ein.

## Entscheidung

1. **Ein Entwurf nennt die Person.** `AdvisorActionProposal.person` ist `'A' | 'B'`; fehlt es, ist
   es der Nutzer (A). Beide Werkzeuge nehmen `person` mit der Vorgabe `A` an, bei
   `propose_two_paths` je Weg. Ein Entwurf für B und einer für A auf dasselbe Feld sind zwei
   verschiedene Ziele: Sie stehen nebeneinander, ersetzen sich nicht und kollidieren im Batch nicht.
2. **Geschrieben wird über denselben Weg wie in der Maske.** Basiswert, Stale-Prüfung, Übernehmen
   und Rückgängig lösen für jeden Entwurf `LinkService.dataUser(userId, jahr, person)` auf, genau
   wie die Masken mit `?person=B`. Damit gelten dieselben Regeln: B nur bei einer
   Zusammenveranlagung, die A angelegt hat, und nur solange B kein eigenes Konto hat
   (`PERSON_B_OWNS_DATA`). Hat B inzwischen ein Konto, schlägt Übernehmen mit diesem Grund fehl;
   Verwerfen geht immer. Die Wirkungsvorschau schreibt Bs Felder in Bs Datensatz (in der
   zurückgerollten Transaktion) und liest die gemeinsame Schätzung des Nutzers.
3. **Nur Bs eigene Masken.** Person B gibt es für `lstb`, `chLohnausweis`, `commute` und `rente`
   (ADR-0054 § 2). Kinder, Vermietung, Kapital und das Interview gehören zur gemeinsamen Erklärung;
   ein Entwurf für B dort wird mit `JOINT_SCREEN` abgelehnt. Gesperrte Felder bleiben für B gesperrt
   (dieselbe Prüfung vor der Personenprüfung und auf dem Schreibweg).
4. **Die Eule kennt den Haushalt, keine Namen.** Der Turn bekommt `household`: ob es eine Person B
   gibt, ob der Nutzer für sie erfassen darf, und Bs bereits erfasste Zahlen (Bruttolohn LStB bzw.
   CH, Arbeitsweg, Rente). B heißt für das Modell immer „Person B“. Bs Vor- und Nachname werden in
   der Nachricht des Nutzers durch „Person B“ ersetzt, bevor sie gespeichert oder an das Modell
   geschickt wird, und stehen sonst auf der Liste der Namen, die aus jedem Text entfernt werden.
   Der Name erscheint nur in der App.
5. **Wann B gemeint ist, sagt der Prompt.** Regel 14 im festen Teil des Prompts: Alles, was der
   Nutzer über Ehefrau, Ehemann, Partnerin oder Partner sagt, ist Person B; unklar → nachfragen.
   Der Skill „Berater-Interview“ fragt die persönlichen Bereiche bei einer Zusammenveranlagung für
   beide ab.
6. **Die Regeln ohne Modell entwerfen nie aus einem Satz über eine andere Person.** Nennt die
   Nachricht Ehefrau, Ehemann, Partner, Kind (oder „Person B“), gibt `evaluateAdvisorTurn` keinen
   Entwurf zurück, sondern sagt ehrlich, dass es dafür das Modell oder die Maske braucht. Die Regeln
   kennen nur die Felder des Nutzers und sollen dort nichts Fremdes eintragen.
7. **Die Karte zeigt die Person.** Ein Entwurf für B trägt „für ‹Vorname›“ (ohne bekannten Namen
   „für Person B“). Den Vornamen holt die App über die Kopplung, nur solange ein solcher Entwurf zu
   sehen ist. Übernehmen und Rückgängig laufen über dieselben Knöpfe und Endpunkte.

## Konsequenzen

- Der Chat kann eine gemeinsame Erklärung jetzt für beide füllen; der Live-Test
  `owl-person-b.live.test.ts` prüft das am echten Modell (ohne Schlüssel übersprungen).
- Ist der Nutzer selbst Person B (eigenes Konto, gekoppelt), darf die Eule nichts für den Partner
  entwerfen; der Prompt sagt ihr das. Der Partner heißt dann im Prompt ebenfalls „Person B“.
- Für `chLohnausweis` von B gibt es noch keine Maske in der App (die API nimmt dort kein `person`).
  Die Werte landen im Datensatz von B, den Schätzung und Ausdruck lesen; ansehen kann der Nutzer
  sie erst, wenn diese Maske für B gebaut ist.
- Ein `ui_command`, das bei einem gesperrten Feld die Maske öffnet, öffnet die Maske des Nutzers,
  nicht die von B.
- Der Wortgrenzen-Abgleich der Namen arbeitet jetzt mit Unicode-Buchstaben: Namen mit Umlaut am
  Anfang („Ümit“) wurden vorher nicht entfernt.

## Nachtrag: Kein stiller Standard für die Person (17.11.2026)

**Anlass.** Im Echtdatenlauf mit einem Grenzgänger-Paar (Chat 2024/2025, vier Läufe) hat die Eule
dreimal einen Entwurf für Person B ohne `person` angelegt: Bs Krankenkasse, Bs Vorname und Bs
Arbeitsweg. Das Schema setzte `person` stillschweigend auf `A`. Die Karte hätte so den Wert des
Nutzers überschrieben, sichtbar etwa als „67 → 26“. Die Eule bemerkte den Fehler zweimal selbst,
konnte die Karte aber nicht zurücknehmen und bat den Nutzer, sie abzulehnen. Einen Knopf dafür hatte
die Karte nicht.

**Entscheidung.**

1. **Die Person ist Pflicht, wo es die Angabe zweimal gibt.** `person` hat im Werkzeug-Schema keinen
   Standardwert mehr. Bei einer Zusammenveranlagung, in der der Nutzer für B erfasst, lehnt
   `checkDraftPerson` einen Entwurf auf einer Maske einer Person (`PERSON_B_SCREENS` und Bs eigene
   Interview-Antworten) ohne `person` mit `PERSON_REQUIRED` ab. Die Eule bekommt den Grund und legt
   den Entwurf in derselben Antwort richtig neu an. Gemeinsame Masken und Haushalte ohne B bleiben,
   wie sie waren: Dort heißt keine Angabe weiter „der Nutzer“.
2. **Der Titel muss zur Person passen.** Nennt der Titel eines Entwurfs für den Nutzer Person B,
   über den Handle „Person B“ oder Bs Vor- bzw. vollen Namen als eigenes Wort, lehnt der Server ihn
   mit `PERSON_MISMATCH` ab. Bs Namen kommen aus Bs Profil (`spouseForAdvisor`) und reisen als
   `aliases` nur im Server mit. In den Prompt gehen sie nicht; der Fall-Prompt nennt B weiter nur
   „Person B“.
3. **Die Eule kann zurückziehen.** Das Werkzeug `withdraw_draft` nimmt einen Entwurf derselben
   Antwort zurück (Maske, Feld, ggf. Datensatz und Person), auch einen Weg aus `propose_two_paths`.
4. **Der Nutzer kann verwerfen.** Jede offene Karte hat einen Knopf „Verwerfen“. Er nutzt den
   vorhandenen Endpunkt `dismiss` und zeigt danach „Verworfen“.

**Konsequenzen.**

- Für die Masken einer Person gibt die Eule bei einer Zusammenveranlagung jetzt immer `person: "A"`
  oder `"B"` an. Vergisst sie es, kostet das einen Werkzeugaufruf, aber nie einen falschen Wert.
- Der Namensabgleich findet nur Namen, die die App kennt. Nennt der Nutzer B mit einem Spitznamen,
  greift nur Punkt 1.
- **Jede Karte einer Personen-Maske nennt ihren Besitzer.** Bei einer Zusammenveranlagung trägt auch
  ein Entwurf für den Nutzer auf diesen Masken „für ‹Vorname›“ (ohne bekannten Namen „für dich“),
  neben Bs „für ‹Vorname›“. Eine Karte, die Bs Zahl in das Feld des Nutzers schreiben würde, steht so
  sichtbar als „für Suhay · 67 → 26“ da. Gemeinsame Masken bleiben ohne Kennzeichnung. Die Namen holt
  die App aus Kopplung und Profil, nur solange eine solche Karte zu sehen ist.
