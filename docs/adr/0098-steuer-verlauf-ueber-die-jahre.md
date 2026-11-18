# ADR-0098 — Steuer-Verlauf: Alle Jahre auf einen Blick

- **Status:** Accepted
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/year-history.ts` (neu, reine Funktion)
  - `apps/api/src/year-history/{year-history.controller,year-history.service}.ts` (neu)
  - `apps/api/src/assessment/*` (Eckjahr bei Übernahme eines Bescheids ohne Erklärung)
  - `apps/mobile-web/src/screens/receipts/ReceiptsScreen.tsx` (bestehender Bescheid-Upload, unverändert als einziger Weg)
  - `packages/core/src/engine/assessment.ts` (`diffAssessment`, löst `reconcileAssessment` ab)
  - `apps/api/prisma/schema.prisma` (`Assessment` um die Besteuerungsgrundlagen erweitert)
  - `apps/mobile-web/src/screens/assessment/AssessmentScreen.tsx` (zeigt denselben Abgleich)
  - `apps/mobile-web/src/navigation/{AppTabs,routes}.tsx`, `apps/mobile-web/src/screens/history/` (neu)
- **Baut auf:** ADR-0032 (Nichts versprechen, was der Slice nicht liefert), ADR-0038 (Berechnungs-Kern), ADR-0039 (Steuerjahr-Zustandsmaschine), ADR-0049 (Jahresübernahme), ADR-0094 (Die Schätzung rechnet wie der Bescheid), ADR-0097 (Beleg-Lebenszyklus, ein Upload-Weg), ADR-0008 (Feldverschlüsselung)
- **Mock:** `docs/mocks/steuer-verlauf.html`

## Kontext

Die App denkt in einzelnen Steuerjahren. Das Cockpit zeigt ein Jahr, die Liste zeigt die Erklärungen. Eine Gesamtsicht über die Jahre fehlt:

- Wie haben sich die Werbungskosten entwickelt, und wo lagen sie unter dem Pauschbetrag?
- Wie viel blieb vom Brutto netto übrig, und ist der Anteil gestiegen oder gefallen?
- Wie hoch waren Erstattung oder Nachzahlung je Jahr, und wie gut lag die Schätzung am Ende?
- Wie hat sich die Steuerquote mit dem Einkommen verändert?

Die Zahlen liegen schon da, je Nutzer und Jahr: `Lstb` (Brutto, Lohnsteuer, Soli, Kirchensteuer, SV), `ChSalaryCertificate` (Grenzgänger), die Antworten aus Interview und Masken und `Assessment` (Bescheid: festgesetzte Steuer, Erstattung). Nur fügt sie niemand über die Jahre zusammen. Für neue Nutzer bleibt der Verlauf zudem leer, weil ihre Vorjahre beim Steuerberater oder in ELSTER entstanden sind.

## Entscheidung

1. **Ein eigener Tab „Verlauf“, als Zeitleiste.** Die Tab-Leiste wird `Cockpit · Eule · Belege · Verlauf · Profil`. Das Cockpit bleibt ein Jahr; der Verlauf ist die Sicht über alle Jahre und passt auf dem Handy auf einen Bildschirm:
   - **Jetzt wichtig.** Oben eine Karte im Stil des Cockpit-Blocks mit genau dem dringendsten Anliegen: zuerst ein Bescheid mit Abweichungen und laufender Einspruchsfrist (Differenz in Euro, Resttage), sonst eine eingereichte Erklärung ohne Bescheid, sonst ein offenes Jahr mit dem, was fehlt. Weitere Anliegen nur als Zeile („+ 2 weitere Jahre brauchen dich“); ohne Anliegen „Alles erledigt“.
   - **Eine Zeile je Jahr.** Neuestes Jahr oben: Jahr, ein Satz zum Stand („abgegeben · wartet auf Bescheid“, „Bescheid · 92 € weniger als erklärt“, „Bescheid wie erklärt“, „nur Bescheid“, „in Arbeit · …“) und ein Betrag (laut Bescheid, als Spanne geschätzt oder „–“). Ein Tipp öffnet die Jahresseite mit Bescheid-Abgleich (§ 8), Einspruchsfrist und „Fürs nächste Mal“; von dort geht es ins Cockpit des Jahres.
   - **Entwicklung ansehen.** Die Diagramme (§ 2) stehen auf einer eigenen Seite, einen Tipp entfernt. Darunter „Ältere Jahre ergänzen“ für den Bescheid-Upload (§ 4).

   Grund: Der erste Bau nach dem Mock war auf dem Handy 5,5 Bildschirme lang (Cockpit 1,7), mit 590 Wörtern und derselben Kürzung 13-mal; die Diagramme begannen auf Bildschirm 4. Entscheidung des Product Owners nach dem UX-Review: Variante A „Zeitleiste“. Der Mock gilt weiter für Inhalte und Darstellung der Kennzahlen, nicht mehr für die Anordnung auf dem Tab.

2. **Vier Kennzahlen in Version 1.**

   | Kennzahl | Inhalt | Quelle |
   |---|---|---|
   | Brutto → Netto | Brutto, Abzüge (Lohnsteuer, Soli, KiSt, SV-Arbeitnehmeranteil), Netto; dazu **Netto nach Erstattung** (Netto ± Abschlusszahlung) und die Netto-Quote in % | `Lstb`, `ChSalaryCertificate`, `Assessment.erstattung` |
   | Werbungskosten | Summe je Jahr, gestapelt nach Fahrtweg, Homeoffice, Arbeitsmittel, Sonstiges; der Arbeitnehmer-Pauschbetrag des Jahres als Linie | Berechnungs-Kern (`TaxEstimate.werbungskosten` und seine Posten), Tarifparameter des Jahres |
   | Erstattung / Nachzahlung | je Jahr; bei Jahren mit Bescheid und eingereichter Erklärung die erklärte Erstattung als Marke am Balken und die Kürzung als Fläche dazwischen. Die letzte Schätzung vor dem Bescheid steht im Detail zum Jahr, nicht im Diagramm | `Assessment.erstattung`, `FilingVersion`, sonst `TaxEstimate.result` |
   | Steuerquote | effektiv (festgesetzte bzw. geschätzte ESt ÷ Brutto) und Grenzsteuersatz | `Assessment.festgesetzteSteuer`, Kern-Tarif § 32a |

   Erstattung / Nachzahlung ist die Kennzahl, mit der der Tab öffnet: Sie ist die einzige, an der die Erklärung etwas ändert. Jede Kennzahl zeigt die Veränderung zum Vorjahr (absolut und in %), nur wenn beide Jahre einen Wert haben. Die Kacheln auf Tablet und Desktop zeigen alle dasselbe, jüngste Jahr mit Wert und einen Mini-Verlauf.

3. **Drei Stufen, sichtbar unterschieden** (ADR-0032). Jeder Jahreswert trägt seine Herkunft:

   | Stufe | Wann | Darstellung |
   |---|---|---|
   | `bescheid` | Bescheid erfasst | volle Fläche/Linie, exakte Zahl |
   | `schaetzung` | Erklärung ohne Bescheid, Kern kann rechnen | gestrichelt, Spanne „1.180–1.420 €“, nie ein Mittelwert |
   | `offen` | zu wenig Fakten oder Jahr ohne Tarif | Lücke im Diagramm, „noch offen“ mit dem, was fehlt |

   Werte direkt aus der Lohnsteuerbescheinigung (Brutto, Lohnsteuer, SV, Netto) sind Fakten und gelten auch ohne Bescheid als exakt; Schätzung ist nur, was vom Bescheid abhängt (angesetzte Werbungskosten, Steuer, Erstattung, Netto nach Erstattung). Die Herkunft zeigt dann „Lohnsteuerbescheinigung“.

   Eine Veränderung zum Vorjahr zwischen zwei Spannen wird ebenfalls als Spanne gezeigt; zwischen `offen` und irgendetwas gar nicht.

4. **Altjahre als Eckjahr, über den einen Upload-Weg.** Es gibt keinen eigenen Upload für den Verlauf. Bescheide lädt man heute schon im Belege-Tab hoch (Art `Steuerbescheid`, Ordner „Bescheide“); das bleibt der Weg nach ADR-0097 §4. Der Knopf „Bescheid hochladen“ im Verlauf ist nur ein weiterer Einstieg in diesen Ablauf und gibt als Kontext die Art `Steuerbescheid` und, falls gewählt, das Jahr mit. Die Eule liest Eckwerte (Einkünfte aus nichtselbständiger Arbeit, Werbungskosten, festgesetzte ESt/Soli/KiSt, Abschlusszahlung) als Entwürfe für das `Assessment`, die der Nutzer übernimmt (Zero-Write); das Jahr kommt aus dem Bescheid (Jahres-Regel, ADR-0097 §5). Neu ist nur ein Fall: Gehört der Bescheid zu einem Jahr ohne Erklärung in der App, legt die Übernahme ein **Eckjahr** an, ein Steuerjahr mit Status `extern-erledigt` (ADR-0039) und nur einem `Assessment`, ohne Interview. Das gilt gleich, ob der Bescheid über Verlauf, Belege-Tab oder Chat kam. Die Bescheidprüfung im Cockpit („Bescheid prüfen“) bleibt die Maske für das geöffnete Jahr und zeigt die übernommenen Werte. Ein Eckjahr zählt im Verlauf als Stufe `bescheid`. Fehlen Brutto und Abzüge (die stehen nicht auf jedem Bescheid), zeigt Brutto → Netto für dieses Jahr „aus dem Bescheid nicht ablesbar“ und bietet die Lohnsteuerbescheinigung des Jahres an, ebenfalls über denselben Ablauf. Rückwirkend bis zu vier Jahre (Festsetzungsfrist, wie ADR-0049 M3) plus beliebig viele ältere Eckjahre nur zur Anzeige.

5. **Gerechnet im Kern, je Nutzer, auf Abruf.** `buildYearHistory(years)` in `packages/core` ist eine reine Funktion: Sie bekommt je Jahr die entschlüsselten Fakten, rechnet über denselben Kern wie das Cockpit (`berechne`, ADR-0094) und gibt je Jahr und Kennzahl `{ stufe, wert | spanne, delta }` zurück. Die API entschlüsselt, ruft die Funktion und liefert das Ergebnis aus; nichts wird gespeichert, kein Cache über die Session hinaus, keine Auswertung über Nutzer hinweg. Die Feldverschlüsselung (ADR-0008) bleibt unberührt.

6. **Zusammenveranlagung und Grenzgänger.** Bei gemeinsamer Erklärung (ADR-0054) zeigt der Verlauf den Haushalt, mit Umschalter „Wir beide · Person A · Person B“ für Brutto → Netto und Werbungskosten; Erstattung und Steuerquote gibt es nur gemeinsam. Wechselt die Veranlagungsart zwischen zwei Jahren, markiert das Diagramm den Wechsel, die Veränderung zum Vorjahr entfällt für Erstattung und Steuerquote. Grenzgänger-Löhne gehen mit dem Kurs des Jahres in EUR ein (ADR-0042, ADR-012); der Kurs steht im Tooltip.

7. **Die Eule erklärt, rechnet aber nicht neu.** Unter jedem Diagramm steht höchstens ein Satz der Eule, der aus den Zahlen des Kerns gebaut ist („Deine Werbungskosten lagen 2023 unter dem Pauschbetrag, gezählt hat also der Pauschbetrag“). Freie Deutungen oder Prognosen für das nächste Jahr gibt es in Version 1 nicht. Die Lehren aus einem Bescheid (§ 8, „Fürs nächste Mal“) sind keine Prognose: Sie nennen nur, was das Finanzamt geändert hat und was im Folgejahr erklärt wurde, ohne einen Betrag für den ausstehenden Bescheid.

8. **Bescheid-Abgleich: Erklärung ↔ Bescheid, Zeile für Zeile.** Für jedes Jahr mit Bescheid und einer in Steuereule eingereichten Erklärung zeigt der Verlauf einen Abgleich, der nach der Wirkung auf die Erstattung geordnet ist, nicht nach dem Formular.
   - **Ein Kassenbon, kein Formular.** Oben eine Zahl: die Gesamtwirkung auf die Erstattung („−92 €“), gefärbt nach der Wirkung für den Nutzer (kostet / nützt / 0 neutral), darunter klein „Erstattung 901 → 809 €“; rechts daneben der Fristen-Chip. Kein Eyebrow, keine Zähl-Pillen, kein Eulen-Satz: Die Zahl der Änderungen nennt nur der Satz der Jahresseite. Grund: Der erste Bau war auf dem Handy 1,85 Bildschirme und 238 Wörter lang und sagte Kürzung, Anzahl und Folgejahr je zwei- bis dreimal; der Bon kommt für 2024 mit rund 45 Wörtern auf einen Bildschirm (Entscheidung des Product Owners).
   - **Je eigener Abweichung eine Zeile.** Position, „~~1.260~~ 1.080“ (der erklärte Wert durchgestrichen und neutral, Zahlen ohne €, die Einheit trägt die Wirkungsspalte), rechts die Wirkung auf die Erstattung in Euro. Sortiert nach dem Betrag der Wirkung, die größte oben. Gefärbt wird nach der Wirkung für den Nutzer, nie danach, welche Seite „alt“ oder „neu“ ist: Ein höheres zu versteuerndes Einkommen ist kein Plus. Darunter genau eine leise Zeile: der Kurzgrund („180 statt 210 Tage“) und, wenn das Folgejahr wieder mehr erklärt als anerkannt wurde, mit Warnzeichen „2025 wieder 210 erklärt“ (Tage, wo die Position Tage zählt, sonst der Betrag). Ohne Kurzgrund stehen nur die Zahlen. Auf breiten Bildschirmen steht die leise Zeile rechts neben der Position, und der Bon bleibt schmal (höchstens die Breite einer Lesespalte).
   - **Ein Tipp öffnet die Zeile.** Dann stehen dort die Erläuterung des Finanzamts als Zitat aus dem Bescheid, der Hinweis fürs nächste Mal und wo er im Folgejahr wieder erscheint, je eine Zeile. Die Zeilen sind Schaltflächen mit ihrem Zustand (auf/zu) und mindestens 44 px hoch.
   - **Folgeänderungen nicht als eigene Zeilen.** Summe Werbungskosten, zvE, Steuer und Erstattung stecken in der Kopfzahl; einzeln stehen sie, als „daraus folgt“ markiert, in der Formularansicht.
   - **Formularansicht eingeklappt.** Eine Fußzeile „5 weitere Positionen wie erklärt · Alle ansehen“ öffnet die vollständige Liste, gruppiert wie der Bescheid, mit den Erläuterungen ohne Position. Darunter klein und leise die Daten von Abgabe und Bescheid in einer Zeile. Dass die Einzelwirkungen nicht genau die Gesamtwirkung ergeben, sagt ein kleines Info-Zeichen neben der Kopfzahl, nur wenn es so ist.
   - **Linke Seite ist die eingereichte Fassung**, eingefroren bei der Abgabe (`FilingVersion`), nicht der heutige Stand der Antworten. Wer nach der Abgabe noch etwas ändert, verschiebt den Abgleich nicht.
   - **Rechte Seite sind die Besteuerungsgrundlagen des Bescheids.** `Assessment` wächst dafür von fünf Feldern auf die Positionen, die ein Bescheid ausweist (Einkünfte und Werbungskosten je Person, Vorsorgeaufwendungen, Sonderausgaben, außergewöhnliche Belastungen, § 35a, zu versteuerndes Einkommen, ESt, Soli, KiSt, Abschlusszahlung) und die Erläuterungstexte. Gelesen wird über denselben Beleg-Ablauf (§ 4); was nicht lesbar war, steht als „nicht gelesen“, nie als 0 und nie als Abweichung.
   - **Gerechnet im Kern:** `diffAssessment(filed, assessed)` liefert je Position `{ erklaert, festgesetzt, differenz }`, gruppiert und in Formularreihenfolge, und trennt eigene Abweichungen von **Folgeänderungen** (Summe Werbungskosten, zvE, Steuer, Erstattung). Die Wirkung einer einzelnen Abweichung auf die Erstattung rechnet der Kern, indem er nur diese eine Position auf den Bescheid-Wert setzt. Weil Steuer nicht linear ist, kann die Summe der Einzelwirkungen um wenige Euro von der Gesamtwirkung abweichen; der Abgleich sagt das. Das heutige `reconcileAssessment` (drei Summen) wird zu einer Teilmenge davon. Den Kurzgrund leitet `shortAssessmentReason(position, erläuterung, erklärt, festgesetzt)` aus der Erläuterung ab, über feste Muster (Tage, Kilometer, Prozentanteil, Höchstbetrag, fehlender Nachweis, zumutbare Belastung), ohne KI und ohne freien Text; passt kein Muster, ist er leer. Die API liefert ihn je Zeile als `shortReason`. Die Folgejahr-Angabe in Tagen rechnet `nextYearRepeat` mit dem Tagessatz des Folgejahres.
   - **Einspruchsfrist als Chip neben der Kopfzahl.** Läuft sie noch (§ 355 AO: ein Monat ab Bekanntgabe, Bekanntgabe am vierten Tag nach Aufgabe zur Post, § 122 Abs. 2 AO; Fristende auf Wochenende oder Feiertag rückt auf den nächsten Werktag, § 108 Abs. 3 AO), zeigt der Chip „Einspruch · 19 Tage“ im Warnton und führt in den bestehenden Einspruch-Ablauf mit `APPEAL_REASONS`; das Fristende nennt seine Beschriftung für Screenreader. Ist sie abgelaufen, steht dort leise „Einspruchsfrist vorbei“, ohne Aktion. Ob ein Einspruch sinnvoll ist, entscheidet der Nutzer; die Eule nennt die Wirkung in Euro und was fehlte, mehr nicht.
   - **Fürs nächste Mal, in den Zeilen.** Einen eigenen Block gibt es nicht mehr; je eigener Abweichung steckt die Lehre in ihrer Zeile, mit drei Teilen: was anerkannt wurde (die Zahlen der Zeile, aus dem Bescheid), ob das Folgejahr dieselbe Position wieder so erklärt hat (die leise Zeile, aus dessen `FilingVersion` oder, falls noch nicht eingereicht, den heutigen Antworten), und ein Hinweis, was beim nächsten Mal hilft (in der geöffneten Zeile). Der Hinweis kommt aus einem festen Katalog je Positionsart im Kern, nicht aus freiem Text der Eule. Im nächsten noch offenen Jahr erscheint die Lehre an der betroffenen Maske wieder. Ein eingereichtes Jahr ohne Bescheid zeigt an der Stelle des Abgleichs genau die Positionen, die im Vorjahr gekürzt und nun wieder so erklärt wurden, ohne Betrag (§ 7).
   - **Ehrlich bei fehlender Grundlage.** Ein Eckjahr (§ 4) hat keine Erklärung in der App: kein Abgleich, ein Satz sagt warum. Zwei Einzelerklärungen ergeben zwei Abgleiche, je Person einer.
   - **Gleicher Abgleich an zwei Stellen.** Im Verlauf öffnet er sich aus dem Jahr; die Bescheidprüfung im Cockpit zeigt denselben Diff für das geöffnete Jahr. Jahresliste und Tabelle zeigen am Jahr die Zahl der Abweichungen und die Differenz zwischen erklärter und festgesetzter Erstattung.

## Umsetzung

1. Kern: `buildYearHistory` mit den drei Stufen und den Vorjahres-Deltas, testgetrieben gegen die Echtfälle aus ADR-0087/0090 (mehrere Jahre, Wechseljahr, Grenzgänger).
2. API: `GET /v1/verlauf`, nutzergebunden (ADR-0007), liefert alle Jahre des Nutzers bzw. Haushalts.
3. App: Tab „Verlauf“ mit „Was ansteht“, der Jahresliste und den vier Karten; Diagramme in den Funke-Tokens, barrierefrei mit Datentabelle hinter jedem Diagramm.
4. Bescheid-Abgleich: `Assessment` um die Besteuerungsgrundlagen erweitern (eine Migration, Felder verschlüsselt), `diffAssessment` im Kern testgetrieben, Diff-Ansicht in Verlauf und Bescheidprüfung. Dazu `assessmentLessons(diff, nextYear)` im Kern (reine Funktion, Katalog der Hinweise je Positionsart) und der Wiedereinstieg an der Maske des nächsten offenen Jahres.
5. Eckjahr: Übernahme eines gelesenen Bescheids für ein Jahr ohne Erklärung legt ein Steuerjahr `extern-erledigt` an; der Verlauf bekommt nur einen Einstieg in den bestehenden Upload-Weg, keinen eigenen.

6. Abgabe: Die App druckt die Formulare, abgegeben wird auf Papier oder in ELSTER. Deshalb trägt der Nutzer die Abgabe selbst ein: „Ich habe die Erklärung abgegeben“ im Cockpit, mit Datum (vorbelegt: heute). Das friert die eingereichte Fassung ein (`POST /v1/steuerjahre/:jahr/abgabe`), das Jahr wird `eingereicht` und steht im Verlauf als „wartet auf Bescheid“. Bis ein Bescheid erfasst ist, lässt sich die Abgabe zurücknehmen oder durch eine neue Fassung ersetzen (`DELETE …/abgabe`). Wo die Schätzung eine Spanne hat (zvE, Steuer, Erstattung), speichert die Fassung die gerundete Mitte als erklärten Wert und die Spanne daneben; gezeigt wird weiter die Spanne.

Abweichung vom Mock: Die App hat auf allen Breiten die schwebende Tab-Leiste; eine Seitenleiste nur für Tablet und Desktop gibt es nicht. Der Verlauf nutzt dort das breite Layout des Mocks (Tabelle, Kacheln, Diagramm mit Seitenspalte).

## Folgen

- Neue Nutzer sehen nach einem Bescheid-Upload sofort einen Verlauf über zwei oder mehr Jahre; das ist auch ein Grund, die App im zweiten Jahr wieder zu öffnen.
- Ein Vertragstest hält fest: Kein Jahr ohne Bescheid erscheint als exakte Zahl, kein Delta wird aus einem offenen Jahr gebildet, und keine Lehre nennt einen Betrag für einen Bescheid, der noch aussteht.
- Die Lehren greifen in die Masken des Folgejahres ein. Welche Masken einen Hinweis tragen, bestimmt der Katalog; eine Position ohne Katalogeintrag bekommt im Abgleich nur die ersten beiden Teile der Lehre.
- Der Verlauf liest bis zu zehn Jahre und rechnet jedes neu. Das ist billig (reine Funktion), muss aber im Lasttest (#63) mitlaufen.
- Die Jahresliste verlässt die bisherige Stelle; Deep Links auf die Liste leiten in den Verlauf um (`linking.ts`).
- Prognosen („So sieht 2027 aus“) und Vergleiche mit anderen Nutzern bleiben bewusst draußen; Letzteres bräuchte eine Auswertung über Nutzer hinweg, die die Feldverschlüsselung ausschließt.
