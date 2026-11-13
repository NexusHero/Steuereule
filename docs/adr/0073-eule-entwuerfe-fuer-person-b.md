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
