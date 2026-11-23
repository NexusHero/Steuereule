# ADR-0072 — Anlage N-Gre: Pensionskasse nach Obligatorium und Überobligatorium, NBUV zu 100 % beim Arbeitgeber, steuerfreies Krankentaggeld, Jahresdurchschnittskurs

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{n-gre,exchange-rate}.ts`, `packages/core/src/interview/field-catalog.ts`, `apps/api/src/ch-salary-certificate/**`, `apps/api/src/printout/{printout-values,printout.service}.ts`, `apps/api/src/printout/felder-2025.*`, `apps/api/src/tax-estimate/tax-estimate.service.ts`, `apps/api/skills/steuerberater/references/grenzgaenger-ausland.md`, `apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx`
- **Ergänzt:** ADR-012 (Wechselkurs), ADR-0066 (Feldkatalog)

## Kontext

Eine echte Erklärung 2025 eines Ehepaars, beide Grenzgänger in die Schweiz, wurde über den Chat
erstellt und Zeile für Zeile mit der Erklärung eines Steuerberaters (DATEV) verglichen. Der Ausdruck
der App wich an fünf Stellen ab:

1. Die Arbeitgeberbeiträge ins Überobligatorium (Säule 2b) fehlten in Zeile 20; Zeile 23 war um
   4.294 / 4.470 CHF zu niedrig.
2. Zeilen 84 und 87 trugen den ganzen Pensionskassenbeitrag (7.186 CHF) statt nur des
   BVG-Obligatoriums (2.892 CHF). Auch die Eule schrieb den ganzen Betrag, obwohl der Nutzer
   „davon obligatorisch 2.892“ gesagt hatte: Das Feld hieß `pkArbeitnehmerChf`, und im Prompt stand
   nur der Name.
3. Zeile 98 druckte einen Arbeitnehmeranteil NBUV von 269 CHF, obwohl der Arbeitgeber 100 % zahlt.
4. Nur der amtliche Monatskurs war wählbar; Steuerberater nehmen den Jahresdurchschnittskurs.
5. Für ausgezahltes steuerfreies Krankentaggeld (Zeile 9) gab es keine Eingabe.

## Entscheidung

1. **Pensionskasse: Gesamtbetrag und obligatorischer Teil, der überobligatorische Teil wird
   gerechnet.** Gespeichert werden für den Arbeitnehmer der Gesamtbetrag (Lohnausweis Ziffer 10,
   wie bisher) und der obligatorische Teil (`pkArbeitnehmerChf`), für den Arbeitgeber der neue
   Gesamtbetrag (`pkArbeitgeberGesamtChf`) und der obligatorische Teil (`pkArbeitgeberChf`). Der
   Kern (`annexNGreAmounts`) teilt beide Seiten in `pension.{employee,employer}.{mandatoryChf,
   overMandatoryChf}` auf, mit Überobligatorium = max(0, Gesamt − Obligatorium).
   - Zeile 20 = Überobligatorium des Arbeitgebers, geht in Zeile 23 ein.
   - Zeilen 84/87 (und 85/88) tragen nur das Obligatorium.
   - Das Überobligatorium des Arbeitnehmers wird nicht abgezogen; es steht in keiner Zeile der
     Anlage N-Gre, und der Berater hat es nicht angesetzt.
   - **Warum nicht die beiden Teile speichern?** Bescheinigungen und Nutzer nennen „Gesamt, davon
     obligatorisch“. Mit diesen Feldern wird „7.186,20 CHF, davon obligatorisch 2.892 CHF“ zu zwei
     Entwürfen ohne Rechnung. Die Eule darf nicht im Kopf rechnen (Skill B5), und es gibt kein
     Rechenwerkzeug für eine Differenz.
2. **Feldkatalog mit Hinweisen.** `FieldSpec` hat ein optionales `hint` (deutsch), das
   `describeFieldForPrompt` anhängt. Hinweise stehen bei Feldern, deren Name mehrdeutig ist:
   - die vier Pensionskassenfelder,
   - die Krankentaggeld-Prämie gegenüber dem ausgezahlten Taggeld,
   - die Arbeitgeberbeträge für NBUV und Krankentaggeld.

   Die Referenz `grenzgaenger-ausland.md` des Skills `steuerberater` erklärt die Aufteilung mit dem
   Beispiel. Neue, von der Eule schreibbare Felder: `pkArbeitgeberGesamtChf` und
   `steuerfreiesKrankentaggeldChf`; später dazu `steuerfreiesUnfalltaggeldChf` (Zeile 10, Punkt 5).
3. **NBUV und Krankentaggeld zu 100 % beim Arbeitgeber: Der Arbeitnehmeranteil ist 0.** Ursache
   der 269 CHF: Der Arbeitnehmeranteil NBUV wird als Rest von Ziffer 9 nach AHV/IV, EO und ALV
   hergeleitet. Zahlt der Arbeitgeber alles, ist dieser Rest keine NBUV (Rundung oder andere
   Abzüge), wurde aber trotzdem gedruckt. `split()` setzt den Arbeitnehmeranteil bei 100 % jetzt
   immer auf 0.
4. **Jahresdurchschnittskurs als dritter Kursmodus `jahresdurchschnitt`.**
   - Der Zeitraum ist ein Jahr (`yyyy` in derselben Spalte wie der Monat), die Herkunft
     `regel: BMF-Jahresdurchschnittskurs`.
   - `ANNUAL_AVERAGE_RATES` enthält die Kurse, die die Anlage N-Gre des jeweiligen Jahres unter
     Zeile 25 druckt: 2022 0,99, 2023 1,025, 2024 1,045, 2025 1,065 EUR je CHF, aus den
     eingecheckten Vordrucken abgelesen.
   - Die ELSTER-Hilfe zur Anlage N-Gre 2025 nennt ihn ausdrücklich als
     Vereinfachungsmöglichkeit neben den Monatskursen. Der Nutzer wählt in der Maske Monat oder
     „Jahresdurchschnitt“; für bekannte Jahre wird der Kurs vorgeschlagen.
   - Schätzung und Ausdruck nehmen den gewählten Kurs.
5. **Steuerfreies Krankentaggeld (Zeile 9 und Zeile 76), ohne Progressionsvorbehalt.** Das neue
   Feld `steuerfreiesKrankentaggeldChf` ist der Teil von Ziffer 8, der ausgezahltes Krankentaggeld
   ist. Es mindert:
   - den steuerpflichtigen Lohn: Zeile 15 = 6 − 8 − 9, Zeile 23 entsprechend;
   - die Bemessungsgrundlage der Sozialabgaben: Zeile 76 = Familienzulagen + Krankentaggeld, so
     wie der Vordruck Zeile 76 beschriftet („Versicherungsleistungen bei Unfall, Krankheit,
     Invalidität; Familienzulagen“).

   Worauf wir uns stützen:
   - **Steuerfreiheit:** § 3 Nr. 2 Buchst. e i. V. m. Nr. 1 Buchst. a EStG, wenn der Arbeitnehmer
     einen eigenen Anspruch gegen die Versicherung hat (ELSTER-Hilfe zur Anlage N-Gre 2025,
     Zeile 9). Hat allein der Arbeitgeber das Forderungsrecht, ist das Taggeld Arbeitslohn und
     gehört nicht in Zeile 9. Das sagt der Hinweis in der Eulen-Referenz; die App prüft es nicht.
   - **Progressionsvorbehalt:**
     - § 32b Abs. 1 Satz 1 Nr. 1 Buchst. k EStG erfasst nach § 3 Nr. 2 Buchst. e steuerfreie
       Leistungen nur, soweit vergleichbare inländische Leistungen (Buchst. a–j) darunter fallen.
     - Die Hilfe zur Anlage N-Gre nennt den Progressionsvorbehalt für Zeile 10 (SUVA-Taggeld,
       zusätzlich Hauptvordruck Zeile 36), für Zeile 9 nicht.
     - FG Baden-Württemberg, 08.05.2019, 14 K 2647/18 und 14 K 1955/18: Taggeld aus einer
       Kollektivkrankentaggeldversicherung nach VVG (Privatversicherung) unterliegt nicht § 32b.
       Eine BFH-Entscheidung zur zugelassenen Revision haben wir nicht gefunden.
     - Wir wenden deshalb keinen Progressionsvorbehalt an.
     - Das Taggeld der Unfallversicherung (UVG/SUVA) hat ein eigenes Feld,
       `steuerfreiesUnfalltaggeldChf` (Zeile 10 „SUVA – Geld“, auch Zeile 76): Es mindert Lohn und
       Bemessungsgrundlage wie das Krankentaggeld, die Schätzung zählt den Euro-Betrag aber zu den
       Lohnersatzleistungen (§ 32b EStG, BFH VI R 26/24). Der Ausdruck füllt Zeile 10 und trägt den
       Euro-Betrag zusätzlich in den Hauptvordruck ein (Zeile 36, Kz 136/137).
     - **Offen:** Taggeld nach KVG (soziale Krankenversicherung). BFH VI R 26/24 hat für das
       gesetzliche UVG-Taggeld Buchst. k bejaht; dieselbe Begründung könnte auf KVG-Taggeld
       übertragen werden. Die Eule nennt das als unsicher.
   - **Woher kam das Taggeld? (Nachtrag)** Ein Betrag in Ziffer 8 wird nicht nach seinem Namen,
     sondern nach seiner Herkunft behandelt. Eine feste Frage, gleich in Maske, Eule und MCP
     (`pruefen`), speichert die Antwort je Lohnausweis im verschlüsselten Feld `taggeldQuelle`
     (Migration `20261126100000_n_gre_taggeld_quelle`) und erst danach den Betrag:
     - `krankentaggeldversicherung`: Leistung der Kollektiv-Krankentaggeldversicherung des
       Arbeitgebers, vom Arbeitgeber empfangen und mit dem Lohn verrechnet („KK-Taggeld
       Verrechnung“). Steuerfrei, ohne Progressionsvorbehalt (FG Baden-Württemberg 08.05.2019,
       14 K 1955/18 und 14 K 2647/18; die Prämie des Arbeitgebers ist Lohn) →
       `steuerfreiesKrankentaggeldChf`.
     - `lohnfortzahlung`: eigene Lohnfortzahlung des Arbeitgebers ohne Versicherung (Art. 324a OR).
       Gewöhnlicher Lohn, nichts abzuziehen; die App speichert 0.
     - `beides`: Die Versicherung zahlt einen Teil (z. B. 80 %), der Arbeitgeber stockt auf. Nur der
       Teil der Versicherung wird abgezogen, die Aufstockung bleibt Lohn.
     - `unfallversicherung`: UVG/SUVA, steuerfrei mit Progressionsvorbehalt →
       `steuerfreiesUnfalltaggeldChf`.
     - `mutterschaftIv`: Mutterschaftsentschädigung nach EOG und IV-Taggelder haben in der
       Anlage N-Gre eine eigene Zeile (steuerfrei, mit Progressionsvorbehalt). Die App druckt diese
       Zeile noch nicht (ein Kasten wäre erst aus dem Vordruck zu vermessen); der Betrag geht bis dahin
       wie bisher ins Krankentaggeld-Feld, ohne Progressionsvorbehalt. **Offen.**
     - `kein`: kein Taggeld im Lohnausweis, auch eine private Einzel-Taggeldversicherung, die dem
       Arbeitnehmer direkt zahlt.
     Anhaltspunkt, keine Entscheidung: Leistungen einer Versicherung sind nicht AHV-pflichtig, Lohn
     ist es. `ahvContributionFit` (Kern) vergleicht Ziffer 9 mit AHV/IV/EO 5,3 % und ALV 1,1 % bis
     148.200 CHF (Jahresparameter `swissSocialSecurity`) auf den Bruttolohn mit und ohne den Betrag
     und sagt, was besser passt, oder „unklar“ innerhalb einer Toleranz oder wenn Ziffer 9 mehr
     enthält (NBU-Prämie). Die Eule schlägt weiterhin zwei Wege vor (`TWO_PATHS_REQUIRED`); der
     Nutzer wählt.
6. **„Sonderfälle“ sind nur noch die Zeilen 7, 10–14, 16, 17, 21, 22.** Zeilen 9 und 20 druckt die
   App jetzt; die Frage in der Maske nennt Krankentaggeld und Überobligatorium nicht mehr. Zeile 10
   (SUVA-Geld) druckt die App inzwischen ebenfalls; die Frage nennt SUVA-Gelder nicht mehr.

## Folgen

- Neue verschlüsselte Spalten `pkArbeitgeberGesamtChf` und `steuerfreiesKrankentaggeldChf`
  (Migration `20261113180000_n_gre_pk_split_krankentaggeld`), später `steuerfreiesUnfalltaggeldChf`
  (Migration `20261125100000_n_gre_unfalltaggeld`, Kästen `anlNGre.z10*`). Neue Kästen `anlNGre.z9*` und
  `anlNGre.z20*` sind aus dem Vordruck vermessen (`scripts/vordrucke/vermessen.mjs`).
- **Bestandsdaten:** Wer in `pkArbeitnehmerChf`/`pkArbeitgeberChf` den Gesamtbetrag eingetragen
  hat, behält ihn, bis er die Felder korrigiert. Eine automatische Umdeutung ist nicht möglich:
  Ob ein gespeicherter Wert der Gesamtbetrag oder das Obligatorium ist, steht nirgends. Die neuen
  Beschriftungen („davon obligatorisch“) machen das sichtbar.
- Die Eingabe des Arbeitgeber-Gesamtbetrags ist freiwillig. Fehlt er, ist Zeile 20 leer, wie
  bisher.
- `nGreInputFromRecord` (API) baut die Eingabe der Anlage N-Gre an einer Stelle; Schätzung und
  Partnerschätzung nutzen sie.
