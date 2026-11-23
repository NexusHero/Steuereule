# ADR-0088 — Person B vollständig erfassen, Schweizer Kinderzulage je Kind

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/interview.ts`, `packages/core/src/domains/{swiss-family-allowance,ch-salary-certificate-parser}.ts`, `packages/core/src/engine/married-estimate.ts`, `apps/api/src/{interview,pension,children,tax-estimate,printout,ch-certificate-scan}/`, `apps/api/src/advisor/advisor.service.ts`, `apps/api/prisma/`, `apps/mobile-web/src/screens/{catalog,children,cockpit,pension,interview}/`, `e2e/scenarios/26-familie-brandt-rente-und-zulage.mjs`
- **Baut auf:** ADR-0054 (Person A erfasst für B), ADR-0073 (Entwürfe für B), ADR-0087 (Eskalationsfall)

## Kontext

Nach dem Eskalationsfall (ADR-0087) blieben Lücken bei einer Zusammenveranlagung, in der A für B erfasst:

- **Kinderzulage:** Die Zulage von Bs Arbeitgeber ging verloren, sobald bei A 0 stand. Je Kind ließ sich nicht sagen, wer die Zulage bekommt. Der Lohnausweis-Leser kannte keine Familienzulagen.
- **Rente:** Bs Rente ließ sich nicht erfassen. Die gemeinsame Schätzung kannte gar keine Rente und ließ einen Partner in Rente stillschweigend weg.
- **Persönliche Posten:** Riester, Umzug oder Nebenjob von B landeten in As Antworten.
- **Interview:** Es fragte nichts über B. Das Cockpit zeigte B immer dieselben Partner-Felder.
- **Steuersatz:** Ein Schweizer Lohn ohne Grenzgänger-Eigenschaft wurde voll besteuert, obwohl er in Deutschland freigestellt ist.
- **Belege aus Fotos:** Einzelne Beleg-Entwürfe trugen keine „prüfen“-Markierung.

## Entscheidung

1. **Interview fragt B mit.** Nach „Verheiratet“ fragt es, was Person B macht (angestellt, in Rente, nicht
   berufstätig). Bei „angestellt“ fragt es zusätzlich, ob B in der Schweiz arbeitet. Das Cockpit zeigt dann nur
   Bs passende Felder:
   - angestellt: LStB und Arbeitsweg, bei Schweiz dazu der Lohnausweis;
   - in Rente: das Feld Rente;
   - ohne Antwort (ältere Jahre): wie bisher.

   Bs Wohnsitz und Nichtrückkehrtage fragt nur Bs Schweiz-Maske; die Engine kennt keine Bedingungen über
   mehrere Antworten.
2. **„Für wen?“ in persönlichen Katalogen.** In einer Zusammenveranlagung fragen „Lebenslagen“ und
   „Sonderausgaben“ oben „für mich / für ‹Name›“. Bs Antworten liegen in Bs Datensatz
   (`interview?person=B`, nur diese beiden Kataloge). Gemeinsame Kataloge bleiben beim Nutzer (400 bzw. 409).
3. **Rente für B.** Die Renten-Schnittstelle nimmt `?person=B`. Die Rentenmaske hat einen Partner-Modus.
   Die gemeinsame Schätzung rechnet eine Rente als Einkommen: steuerpflichtiger Anteil abzüglich 102 €
   Pauschbetrag (§ 9a S. 1 Nr. 3 EStG), nichts einbehalten. Rente neben einem Lohn derselben Person bleibt
   außen vor.
4. **Kinderzulage je Kind mit Zahler.** Jedes Kind kann nennen, mit wessen Lohn die Zulage kommt (A oder B,
   neue Spalte `schweizerKinderzulageVon`). Die Verteilung (`swissAllowancePerChild`) geht so:
   - Ein eigener Betrag beim Kind hat Vorrang.
   - Sonst teilen sich die Kinder eines Zahlers dessen Familienzulagen (N-Gre Z. 8, in Euro).
   - Kinder ohne Zahler teilen, was keinem Kind zugeordnet ist.

   Kinder-Maske und Ausdruck nutzen dieselbe Funktion. Eine nur errechnete Zulage zeigt die Maske als Hinweis
   und speichert sie nicht als festen Betrag.
5. **Lohnausweis liest Familienzulagen** aus den Bemerkungen (Ziffer 15): Kinder-, Ausbildungs- und
   Familienzulagen mit Betrag, Teile mit „davon“ nicht doppelt. Daraus wird ein Entwurf für N-Gre Z. 8 bei der
   richtigen Person.
6. **Kein Grenzgänger, keine Schätzung.** Bei mehr als 60 Nichtrückkehrtagen oder Wohnsitz in der Schweiz ist
   der Schweizer Lohn in Deutschland freigestellt (Progressionsvorbehalt). Die Schätzung sagt dann „nicht
   möglich“ (`kein-grenzgaenger`), statt voll zu besteuern.
7. **Belege aus Foto oder Scan** ergeben auch als einzelner Entwurf „prüfen“ (ADR-0060).

## Folgen

- Szenario 26 („Familie Brandt“, Handy-Breite) prüft:
  - B in Rente mit dem Feld Rente;
  - die Kinderzulage mit Zahler;
  - „Für wen?“ in den Sonderausgaben;
  - Bs Rente in der Schätzung;
  - ein B mit eigenem Konto, das ein Wechseljahr selbst erfasst.
- Offen ist der Veranlagungsvergleich: Er nimmt für A nur den Bruttolohn der LStB und braucht Bs zvE vom
  Client. Für Grenzgänger ist er deshalb unvollständig.
- Ebenfalls offen: der Progressionsvorbehalt für unechte Grenzgänger.
