# ADR-0093 — Pflichtfelder und Rückfragen statt Deutung

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/interview/{entry-rules,field-catalog,advisor-printout-plan}.ts`
  - `packages/core/src/domains/{lstb,cross-border}.ts`, `packages/core/src/common/workdays.ts`
  - `apps/api/src/{lstb,commute,ch-salary-certificate,confirmation}/`, `apps/api/src/ki/{advisor-tool-round,advisor-prompt}.ts`, `apps/api/src/advisor/advisor.service.ts`
  - `apps/api/prisma/migrations/20261117100000_entry_rules/`
  - `apps/mobile-web/src/screens/{lstb,workdays,cross-border}/`
- **Baut auf:** ADR-0066 (Feldkatalog), ADR-0072 (N-Gre, Krankentaggeld), ADR-0079 (Wechseljahr), ADR-0081 (Vorauszahlungen), ADR-0088 (Kinderzulage), ADR-0090 (LStB Zeile 24), ADR-0091 (Ausdruck-Checkliste)

## Kontext

Ein Lauf mit echten Unterlagen über zwei Steuerjahre lief nur über den Eulen-Chat. Das Ergebnis hing an mehreren Stellen davon ab, wie das Sprachmodell eine mehrdeutige Angabe verstand: Es addierte Zeilen der Lohnsteuerbescheinigung selbst, rechnete Fahrtage in Urlaubstage um, setzte einen Arbeitsweg für das ganze Jahr an, obwohl der Arbeitgeber gewechselt hatte, und entschied selbst, ob eine Kinderzulage oder ein Krankentaggeld im Bruttolohn steckt. Eine Regel im Prompt hält das nicht zuverlässig auf.

## Entscheidung

Jede dieser Stellen bekommt eine feste Regel, die die App durchsetzt: ein eigenes Feld, eine Prüfung im Werkzeug oder eine Pflichtfrage in der Checkliste. Die Regeln stehen in `entry-rules.ts` und gelten für Masken und Chat über denselben Schreibweg.

1. **LStB Zeilen 22 bis 27 als Block.** Eigene Felder je Zeile: `rvArbeitgeber` (22), `rvArbeitnehmer` (23), `kvArbeitnehmer` (25), `pvArbeitnehmer` (26), `avArbeitnehmer` (27), dazu `zuschussPv` (24c) und `solidaritaetszuschlag` (Zeile 5, mit Cent). Sind 23, 25, 26 und 27 erfasst, speichert die App ihre Summe als `sozialversicherung`; niemand addiert von Hand. Ist Zeile 25 oder 26 gefüllt und Zeile 24 (`zuschuesseKvPv`) nicht beantwortet, gilt die Sozialversicherung als offen, bis ein Betrag oder eine ausdrückliche 0 dasteht. Grund: Bei freiwillig Versicherten steht in Zeile 25/26 der ganze Beitrag, abziehbar ist nur der eigene Anteil (§ 10 Abs. 2 Satz 1 Nr. 1 EStG).
2. **Kinderzulage.** `chLohnausweis.familienzulagenChf` wird nur vom Bruttolohn abgezogen (N-Gre Zeile 8), wenn die Zulage im Bruttolohn Ziffer 8 enthalten ist. Das neue Feld `familienzulagenImBruttolohn` hält die Antwort. Ein Entwurf der Eule über einen Betrag größer 0 braucht die Bestätigung als Begleitfeld, sonst lehnt das Werkzeug ihn ab und nennt die Rückfrage. Ist die Zulage nicht enthalten, gehört sie zum Kind (`kind.swissFamilyAllowanceEur`). Beide Entwürfe für dasselbe Geld in einer Antwort lehnt das Werkzeug ab. Ein Datensatz ohne Antwort (vor dieser Regel erfasst) rechnet wie bisher.
3. **Krankentaggeld.** Fachliche Regel: Steuerfreie Taggelder aus einer Schweizer Krankentaggeldversicherung, deren Prämien der Arbeitgeber trägt und die als Arbeitslohn versteuert werden (N-Gre Zeilen 18/19, vgl. Zeile 80), sind kein Arbeitslohn. Sind sie im Bruttolohn Ziffer 8 enthalten, werden sie dort abgezogen (N-Gre Zeile 9, `steuerfreiesKrankentaggeldChf`). Der Lohnausweis sagt nicht eindeutig, ob ein Vermerk wie „KK-Taggeld Verrechnung“ ein in Ziffer 8 enthaltenes Taggeld meint. Deshalb braucht der Abzug in jedem Jahr die Bestätigung des Nutzers. Die Eule darf den Betrag nur über `propose_two_paths` vorschlagen: ein Weg ohne Abzug (0), ein Weg mit dem ausgezahlten Betrag und dem Hinweis auf die Taggeld-Abrechnung als Nachweis, beide mit ihrer Eurowirkung aus der Schätzung. Die Arbeitgeberprämie bleibt Arbeitslohn. Dasselbe gilt für das Taggeld der Unfallversicherung (UVG/SUVA) mit seinem eigenen Feld `steuerfreiesUnfalltaggeldChf` (N-Gre Zeile 10): nur über zwei Wege, und eine Antwort in einem der beiden Felder beantwortet die Frage nach dem Taggeld.
4. **Krankenkasse.** `krankenkasseChf` ist nur die Grundversicherung nach KVG. Zusatzversicherungen nach VVG stehen in `krankenkasseZusatzChf` (sonstige Vorsorge). Ist ein Betrag erfasst und der Zusatz nicht beantwortet, bleibt das ein offener Punkt. `kvZuschussAnspruch` hält die Antwort zu Zeile 49 der Anlage Vorsorgeaufwand. Die Rechnung dazu folgt mit der genauen Vorsorgerechnung; diese ADR stellt nur die Felder bereit.
5. **Fahrtage.** `commute.travelDays` und `secondTravelDays` nehmen die Tage, an denen die erste Tätigkeitsstätte tatsächlich aufgesucht wurde. Sie ersetzen für ihren Weg die Ableitung Arbeitstage minus Urlaub, Krankheit und Homeoffice, in Schätzung, Maske und Ausdruck. Mehr Fahrtage als Werktage im Zeitraum lehnt die App ab. Die Prompt-Regel, Fahrtage in Urlaubstage umzurechnen, entfällt.
6. **Arbeitsweg je Arbeitgeber.** Ein Weg mit Zeitraum gibt nur für diesen Zeitraum eine Pauschale; ein Zeitraum ohne Weg gibt keine. Hat ein Jahr eine deutsche Lohnsteuerbescheinigung und einen Schweizer Lohnausweis, aber einen Weg ohne Zeitraum und ohne zweiten Weg, fragt die Checkliste je Arbeitgeber nach.
7. **Entfernung.** Es zählt die kürzeste Straßenverbindung (§ 9 Abs. 1 Nr. 4 Satz 4 EStG). Die App berechnet keine Route (kein Routendienst ohne Netz). Sie sagt die Regel und fragt nach der Bestätigung: `shortestRouteConfirmed`, `secondShortestRouteConfirmed`. Ohne Bestätigung bleibt der Punkt offen.
8. **Kapitalerträge.** `interview.einkuenfte` ist eine Pflichtfrage der Checkliste: Erträge über dem Sparer-Pauschbetrag bzw. Freistellungsauftrag oder ohne deutschen Steuerabzug.
9. **Vorauszahlungen.** `interview.vorauszahlungen-gate` ist ein Punkt der Checkliste. Nennt der Nutzer nur den Betrag, setzt die App die Antwort „Ja“ selbst dazu; ohne sie zählte die Schätzung den Betrag nicht.
10. **Negative Beträge.** Lohnausweis Ziffer 7 (`andere-leistungen`) darf negativ sein, in Katalog, Schnittstelle und Maske. Alle anderen Beträge bleiben ab 0. Ziffer 7 geht nicht in die N-Gre-Rechnung ein (dort zählt Ziffer 8) und steht in keinem Vordruck.

Drei Mittel setzen die Regeln durch:

- **Ablehnen** (`checkDraftRules`): kein Entwurf, solange die entscheidende Bestätigung fehlt. Die Ablehnung ist eine Rückfrage, kein Fehler in der Antwort.
- **Rückfrage im Werkzeugergebnis** (`draftFollowUps`, Feld `mustAsk`): Die App sagt dem Modell nach einem Entwurf, was es fragen muss.
- **Checkliste** (`ENTRY_RULE_CODES` im Ausdruck-Plan): offene Punkte, die die Eule abfragt und die die App selbst nachfragt, wenn das Modell es nicht tut. Sie blockieren den Ausdruck nicht.

## Folgen

- Eine Lohnsteuerbescheinigung mit gefüllter Zeile 25/26 und offener Zeile 24 ist für Maske, Schätzung und Ausdruck unvollständig. Im Wechseljahr bleibt der deutsche Lohn damit aus der Schätzung, bis Zeile 24 beantwortet ist; die Checkliste fragt danach als Pflichtpunkt.
- Neue Spalten, alle optional (ADR-0055): sieben in `Lstb`, drei in `ChLohnausweis`, vier in `Arbeitsweg`.
- Offen: Die Schätzung rechnet `krankenkasseZusatzChf`, `kvZuschussAnspruch`, `zuschussPv` und die Einzelzeilen noch nicht eigens; das übernimmt die genaue Vorsorgerechnung. Eine Entfernungsprüfung gegen eine berechnete Route gibt es nicht.
