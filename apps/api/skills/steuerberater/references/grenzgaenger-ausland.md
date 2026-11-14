# Grenzgänger Schweiz & Auslandsbezug

> **Stand:** 13.11.2026 · geprüft für die Steuerjahre 2023–2026. Beträge und Fristen des
> geltenden Rechts (Stand 2026) sind mit dem Gesetzestext (gesetze-im-internet.de) abgeglichen; Werte
> früherer Jahre stammen aus dem Rechenkern der App oder sind nicht einzeln belegt. **„(nicht belegt)“** = Verwaltungspraxis oder
> Rechtsprechung, die nicht am Gesetzestext geprüft wurde: als unsicher nennen. **„prüfen“** = vor
> Verwendung bestätigen.

## Grenzgänger nach Art. 15a DBA Deutschland–Schweiz
- **Voraussetzung**: Wohnsitz in DE, Arbeitsort in CH, **regelmäßige Rückkehr** an den Wohnsitz.
  Grenzgängereigenschaft entfällt, wenn an **mehr als 60 Arbeitstagen** im Jahr wegen der
  Arbeit nicht zurückgekehrt wird (Nichtrückkehrtage; anteilig bei Teilzeit/unterjährig).
  Nachweis: Bescheinigung des Arbeitgebers (Formular Gre-3) bzw. Ansässigkeitsbescheinigung
  Gre-1 für die CH-Quellensteuer.
- **Besteuerung**: Wohnsitzstaat DE besteuert den Lohn; CH erhebt Quellensteuer max. **4,5 %**
  des Bruttolohns. Diese wird auf die deutsche ESt angerechnet **wie einbehaltene Lohnsteuer**
  (Art. 15a Abs. 3 Buchst. a DBA: entsprechend § 36 EStG, **unter Ausschluss von § 34c**; BMF
  vom 08.02.2018, BStBl I 2018, 270). Sie ist also keine ausländische Steuer im
  Festsetzungsverfahren, und eine Kappung auf die anteilige deutsche Steuer wie bei § 34c gibt es
  nicht (nicht belegt: aus dem Wortlaut gefolgert). Erklärt wird in der **Anlage N-Gre**.
  Voraussetzung für die 4,5 %: Ansässigkeitsbescheinigung Gre-1; ohne sie behält die Schweiz
  mehr ein.
- **Kein Lohnsteuerabzug in DE** → **Pflichtveranlagung**, Vorauszahlungen werden festgesetzt.
- **Umrechnung CHF → EUR**: Monatskurse (BMF-Umsatzsteuer-Umrechnungskurse) oder aus
  Vereinfachungsgründen der Jahresdurchschnittskurs, den die Anlage N-Gre unter Zeile 25 druckt
  (2025: 100 CHF = 106,50 €; 2024: 104,50 €; 2023: 102,50 €; 2022: 99,00 €). Der Nutzer wählt;
  Steuerberater nehmen meist den Jahresdurchschnitt. Methode einheitlich.
- **Lohnausweis-Positionen**: Bruttolohn inkl. Boni, Fringe Benefits (Geschäftswagen,
  Verpflegung), Pauschalspesen (in DE oft steuerpflichtig, wenn nicht als Auslagenersatz
  nachweisbar!), Kinderzulagen (CH-Familienzulagen → mindern deutsches Kindergeld auf
  Differenzkindergeld).
- **Sozialversicherung**: AHV/IV/EO, ALV → Vorsorgeaufwand (AHV = Basisversorgung § 10 Abs. 1
  Nr. 2a). **Pensionskasse (BVG)**: obligatorische Beiträge als Altersvorsorge
  (Basisversorgung), überobligatorische Teile/Einkäufe umstritten bzw. nach Rechtsprechung
  differenziert (nicht belegt) → prüfen und ggf. Zwei-Wege-Darstellung. **Säule 3a** in DE nicht abziehbar.
- **Pensionskasse in der Maske eintragen** (chLohnausweis): Felder getrennt nach Gesamtbetrag und
  obligatorischem BVG-Teil, damit du nie rechnen musst.
  - Arbeitnehmer: Gesamtbeitrag → `berufliche-vorsorge` (Lohnausweis Ziffer 10), davon obligatorisch →
    `pkArbeitnehmerChf` (Zeile 84).
  - Arbeitgeber: Gesamtbeitrag → `pkArbeitgeberGesamtChf`, davon obligatorisch → `pkArbeitgeberChf`
    (Zeile 87). Den überobligatorischen Teil (Säule 2b) rechnet die App und druckt ihn als
    steuerpflichtigen Arbeitslohn in Zeile 20.
  - Beispiel: „Arbeitgeberbeiträge 7.186,20 CHF, davon obligatorisch 2.892 CHF“ → zwei Entwürfe:
    `pkArbeitgeberGesamtChf` = 7186 und `pkArbeitgeberChf` = 2892. Nie den Gesamtbetrag in
    `pkArbeitnehmerChf`/`pkArbeitgeberChf` schreiben. Rappen auf ganze Franken runden.
  - Ist der obligatorische Teil unbekannt: nachfragen (Vorsorgeausweis der Pensionskasse, oft
    „Altersgutschrift BVG“), nicht schätzen.
- **NBUV**: Zahlt der Arbeitgeber die NBUV-Prämie zu 100 %, ist der Arbeitnehmeranteil 0
  (`nbuvArbeitgeberProzent` = 100, Arbeitgeberbetrag in `nbuvArbeitgeberChf`).
- **Krankentaggeld**: Zwei verschiedene Dinge. Die Prämie des Arbeitnehmers →
  `krankentaggeldChf` (Zeile 80). Das ausgezahlte Taggeld (z. B. „KK-Taggeld Verrechnung“ im
  Zusatzblatt zum Lohnausweis), das im Bruttolohn steckt → `steuerfreiesKrankentaggeldChf`
  (Zeile 9, auch Zeile 76). Steuerfrei nach § 3 Nr. 2 Buchst. e i. V. m. Nr. 1 Buchst. a EStG, wenn
  der Arbeitnehmer einen eigenen Anspruch gegen die Versicherung hat; hat allein der Arbeitgeber
  das Forderungsrecht, ist es Arbeitslohn und gehört nicht in Zeile 9. Progressionsvorbehalt:
  Die Anleitung zur Anlage N-Gre nennt für Zeile 9 keinen; FG Baden-Württemberg 14 K 2647/18 vom
  08.05.2019: Taggeld aus einer Kollektivversicherung nach VVG nicht unter § 32b. Für Taggeld nach
  KVG offen (nicht belegt) → als unsicher nennen.
- **Krankenversicherung**: Optionsrecht (KVG in CH oder GKV/PKV in DE); Beiträge als
  Basis-KV § 10 Abs. 1 Nr. 3 abziehbar; NBU (Nichtberufsunfall) → sonstige Vorsorge.
- **Werbungskosten**: Entfernungspauschale zum Arbeitsort in CH, Vignette nur anteilig/
  nicht neben der Pauschale, Arbeitsmittel, Homeoffice-Tage (Achtung: Homeoffice-Tage in DE
  können das Besteuerungsrecht/die Quellensteuer und die SV-Zuständigkeit berühren —
  Verständigungsvereinbarung DE-CH zu Homeoffice ab 2024, nicht belegt, prüfen).
- **Kapitalleistungen aus der Pensionskasse/Säule 3a** bei Auszahlung: CH-Quellensteuer,
  in DE Besteuerung nach § 22 Nr. 5 bzw. § 20 je nach Ursprung — komplexer Fall, Primärquellen
  (BFH-Rechtsprechung) prüfen und offen sagen, wo die Rechtslage nicht geklärt ist.
- **Schweizer Bankkonten/Depots**: Zinsen/Dividenden in DE steuerpflichtig (Anlage KAP),
  CH-Verrechnungssteuer 35 %: 15 % anrechenbar, 20 % per Formular 85 bei der ESTV zurückfordern.

## Allgemeiner Auslandsbezug
- **Unbeschränkte Steuerpflicht** (§ 1 Abs. 1): Wohnsitz oder gewöhnlicher Aufenthalt
  (> 6 Monate) in DE → Welteinkommensprinzip; DBA regelt Verteilung.
- **Freistellung mit Progressionsvorbehalt** (§ 32b): ausländische Einkünfte steuerfrei,
  erhöhen aber den Steuersatz (Anlage AUS / N-AUS).
- **183-Tage-Regel** (Art. 15 OECD-MA) für Arbeitnehmer bei Entsendung.
- **Fiktive unbeschränkte Steuerpflicht** (§ 1 Abs. 3): ≥ 90 % der Einkünfte in DE.
- **Wegzug**: § 6 AStG (Beteiligungen ≥ 1 %), erweiterte beschränkte Steuerpflicht;
  Rechnung und Fristen genau erklären, offen auf die Haftungsrisiken hinweisen.
- **Meldepflichten**: Auslandskonten werden über CRS automatisch gemeldet — vollständige
  Angabe empfehlen.
