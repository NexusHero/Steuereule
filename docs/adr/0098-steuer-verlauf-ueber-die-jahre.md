# ADR-0098 — Steuer-Verlauf: Alle Jahre auf einen Blick

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:**
  - `packages/core/src/domains/year-history.ts` (neu, reine Funktion)
  - `apps/api/src/year-history/{year-history.controller,year-history.service}.ts` (neu)
  - `apps/api/src/assessment/*` (Eckjahr aus einem alten Bescheid)
  - `apps/mobile-web/src/navigation/{AppTabs,routes}.tsx`, `apps/mobile-web/src/screens/history/` (neu)
- **Baut auf:** ADR-0032 (Nichts versprechen, was der Slice nicht liefert), ADR-0038 (Berechnungs-Kern), ADR-0039 (Steuerjahr-Zustandsmaschine), ADR-0049 (Jahresübernahme), ADR-0094 (Die Schätzung rechnet wie der Bescheid), ADR-0008 (Feldverschlüsselung)
- **Mock:** `docs/mocks/steuer-verlauf.html`

## Kontext

Die App denkt in einzelnen Steuerjahren. Das Cockpit zeigt ein Jahr, die Liste zeigt die Erklärungen. Eine Gesamtsicht über die Jahre fehlt:

- Wie haben sich die Werbungskosten entwickelt, und wo lagen sie unter dem Pauschbetrag?
- Wie viel blieb vom Brutto netto übrig, und ist der Anteil gestiegen oder gefallen?
- Wie hoch waren Erstattung oder Nachzahlung je Jahr, und wie gut lag die Schätzung am Ende?
- Wie hat sich die Steuerquote mit dem Einkommen verändert?

Die Zahlen liegen schon da, je Nutzer und Jahr: `Lstb` (Brutto, Lohnsteuer, Soli, Kirchensteuer, SV), `ChSalaryCertificate` (Grenzgänger), die Antworten aus Interview und Masken und `Assessment` (Bescheid: festgesetzte Steuer, Erstattung). Nur fügt sie niemand über die Jahre zusammen. Für neue Nutzer bleibt der Verlauf zudem leer, weil ihre Vorjahre beim Steuerberater oder in ELSTER entstanden sind.

## Entscheidung

1. **Ein eigener Tab „Verlauf“.** Die Tab-Leiste wird `Cockpit · Eule · Belege · Verlauf · Profil`. Das Cockpit bleibt ein Jahr; der Verlauf ist die Sicht über alle Jahre. Die Liste der Steuererklärungen zieht in den Verlauf (unter die Diagramme), ein Tipp auf ein Jahr öffnet dessen Cockpit.

2. **Vier Kennzahlen in Version 1.**

   | Kennzahl | Inhalt | Quelle |
   |---|---|---|
   | Brutto → Netto | Brutto, Abzüge (Lohnsteuer, Soli, KiSt, SV-Arbeitnehmeranteil), Netto; dazu **Netto nach Erstattung** (Netto ± Abschlusszahlung) und die Netto-Quote in % | `Lstb`, `ChSalaryCertificate`, `Assessment.erstattung` |
   | Werbungskosten | Summe je Jahr, gestapelt nach Fahrtweg, Homeoffice, Arbeitsmittel, Sonstiges; der Arbeitnehmer-Pauschbetrag des Jahres als Linie | Berechnungs-Kern (`TaxEstimate.werbungskosten` und seine Posten), Tarifparameter des Jahres |
   | Erstattung / Nachzahlung | je Jahr; bei Jahren mit Bescheid zusätzlich die letzte Schätzung daneben | `Assessment.erstattung`, sonst `TaxEstimate.result` |
   | Steuerquote | effektiv (festgesetzte bzw. geschätzte ESt ÷ Brutto) und Grenzsteuersatz | `Assessment.festgesetzteSteuer`, Kern-Tarif § 32a |

   Jede Kennzahl zeigt die Veränderung zum Vorjahr (absolut und in %), nur wenn beide Jahre einen Wert haben.

3. **Drei Stufen, sichtbar unterschieden** (ADR-0032). Jeder Jahreswert trägt seine Herkunft:

   | Stufe | Wann | Darstellung |
   |---|---|---|
   | `bescheid` | Bescheid erfasst | volle Fläche/Linie, exakte Zahl |
   | `schaetzung` | Erklärung ohne Bescheid, Kern kann rechnen | gestrichelt, Spanne „1.180–1.420 €“, nie ein Mittelwert |
   | `offen` | zu wenig Fakten oder Jahr ohne Tarif | Lücke im Diagramm, „noch offen“ mit dem, was fehlt |

   Eine Veränderung zum Vorjahr zwischen zwei Spannen wird ebenfalls als Spanne gezeigt; zwischen `offen` und irgendetwas gar nicht.

4. **Altjahre als Eckjahr aus dem alten Bescheid.** Der Nutzer lädt den Bescheid eines Jahres, das nicht in Steuereule gemacht wurde. Die Eule liest daraus Eckwerte (Einkünfte aus nichtselbständiger Arbeit, Werbungskosten, festgesetzte ESt/Soli/KiSt, Abschlusszahlung) über den Beleg-Ablauf aus ADR-0097: Werte bleiben Entwürfe, bis der Nutzer sie übernimmt. Ein **Eckjahr** ist ein Steuerjahr mit Status `extern-erledigt` (ADR-0039) und nur einem `Assessment`, ohne Interview. Es zählt im Verlauf als Stufe `bescheid`. Fehlen Brutto und Abzüge (die stehen nicht auf jedem Bescheid), zeigt Brutto → Netto für dieses Jahr „aus dem Bescheid nicht ablesbar“ und bietet die Lohnsteuerbescheinigung des Jahres an. Rückwirkend bis zu vier Jahre (Festsetzungsfrist, wie ADR-0049 M3) plus beliebig viele ältere Eckjahre nur zur Anzeige.

5. **Gerechnet im Kern, je Nutzer, auf Abruf.** `buildYearHistory(years)` in `packages/core` ist eine reine Funktion: Sie bekommt je Jahr die entschlüsselten Fakten, rechnet über denselben Kern wie das Cockpit (`berechne`, ADR-0094) und gibt je Jahr und Kennzahl `{ stufe, wert | spanne, delta }` zurück. Die API entschlüsselt, ruft die Funktion und liefert das Ergebnis aus; nichts wird gespeichert, kein Cache über die Session hinaus, keine Auswertung über Nutzer hinweg. Die Feldverschlüsselung (ADR-0008) bleibt unberührt.

6. **Zusammenveranlagung und Grenzgänger.** Bei gemeinsamer Erklärung (ADR-0054) zeigt der Verlauf den Haushalt, mit Umschalter „Wir beide · Person A · Person B“ für Brutto → Netto und Werbungskosten; Erstattung und Steuerquote gibt es nur gemeinsam. Wechselt die Veranlagungsart zwischen zwei Jahren, markiert das Diagramm den Wechsel, die Veränderung zum Vorjahr entfällt für Erstattung und Steuerquote. Grenzgänger-Löhne gehen mit dem Kurs des Jahres in EUR ein (ADR-0042, ADR-012); der Kurs steht im Tooltip.

7. **Die Eule erklärt, rechnet aber nicht neu.** Unter jedem Diagramm steht höchstens ein Satz der Eule, der aus den Zahlen des Kerns gebaut ist („Deine Werbungskosten lagen 2023 unter dem Pauschbetrag, gezählt hat also der Pauschbetrag“). Freie Deutungen oder Prognosen für das nächste Jahr gibt es in Version 1 nicht.

## Umsetzung

1. Kern: `buildYearHistory` mit den drei Stufen und den Vorjahres-Deltas, testgetrieben gegen die Echtfälle aus ADR-0087/0090 (mehrere Jahre, Wechseljahr, Grenzgänger).
2. API: `GET /year-history`, nutzergebunden (ADR-0007), liefert alle Jahre des Nutzers bzw. Haushalts.
3. App: Tab „Verlauf“ mit den vier Karten und der Jahresliste; Diagramme in den Funke-Tokens, barrierefrei mit Datentabelle hinter jedem Diagramm.
4. Eckjahr: Bescheid-Upload für ein fremdes Jahr über den Beleg-Ablauf, Status `extern-erledigt`.

## Folgen

- Neue Nutzer sehen nach einem Bescheid-Upload sofort einen Verlauf über zwei oder mehr Jahre; das ist auch ein Grund, die App im zweiten Jahr wieder zu öffnen.
- Ein Vertragstest hält fest: Kein Jahr ohne Bescheid erscheint als exakte Zahl, kein Delta wird aus einem offenen Jahr gebildet.
- Der Verlauf liest bis zu zehn Jahre und rechnet jedes neu. Das ist billig (reine Funktion), muss aber im Lasttest (#63) mitlaufen.
- Die Jahresliste verlässt die bisherige Stelle; Deep Links auf die Liste leiten in den Verlauf um (`linking.ts`).
- Prognosen („So sieht 2027 aus“) und Vergleiche mit anderen Nutzern bleiben bewusst draußen; Letzteres bräuchte eine Auswertung über Nutzer hinweg, die die Feldverschlüsselung ausschließt.
