# UX review: interview and catalogs (November 2026)

**State:** `main` @ `9827de5b`. In addition, PR NexusHero/Steuereule#510 (`test/eskalationsfall-familie` @ `bf65cd5e`) as a separate build.
**Method:** I started the app locally (API and web export) and ran it against a throwaway database in ATTACH style, separately for `main` and PR #510. I clicked through in the built-in browser at phone width (375 px) and desktop width (1440 px). In addition, I read the code. All persons and amounts are made up. I did not enter a Steuer-ID (tax ID) or a tax number.
**Screenshots:** [`2026-11-interview-review/`](2026-11-interview-review/), numbers `01`–`37`. The file `NN-…-mobile.jpg` is phone width, `NN-…-desktop.jpg` is desktop width.

| Persona | Who | Tax year | Path |
|---|---|---|---|
| **P1** Lena Hoffmann | employed, single, no children, 48,000 € gross | first 2026 (default), then printout | guest → interview → account → LStB → life situations → Sonderausgaben → owl → filing |
| **P2** Markus & Julia Brenner | married, both Grenzgänger (cross-border commuters) to Switzerland, 2 children | 2025 | account → interview → CH screen → master data/partner → children; PR #510: partner interview, „Für wen?“ ("For whom?"), Kinderzulage (child allowance) |
| **P3** Hans Meyer | pensioner, widowed, statutory pension 18,000 € | 2025 | guest → interview → account → pension → health |

---

## Short verdict

The **entry is strong**: four questions, one tip per question, a back arrow and clear language. No classic tax program starts this easily. The **subject depth in the Switzerland part** (60-day rule, N-Gre, Pensionskasse (pension fund) split) and the **honest limits** („Ehrlich: Krypto können wir noch nicht“ ("Honestly: we can't do crypto yet")) are also real differentiators.

After the entry, however, the app loses what it promises: **the user does not see what happens in her tax return.**
- The estimate is missing for most personas. For pensioners the cockpit even shows „0 €“ income after an 18,000 € pension.
- After saving, no effect appears.
- Tiles, draft cards and the printout name neither form nor line.
- Interview answers are not carried over in several places. Marital status and Zusammenveranlagung (joint assessment) have to be entered a second time.

On top of that come two breaches of trust:
- The app starts in the **current year 2026**. The user only learns at the very end that there is no printout for it.
- The **owl** (basic mode) suggests 210 days for "80 home office days". The workbench takes over both alternatives with one click.

**Overall grade: 2.6 / 5.** The entry is very good; visibility and continuity are weak. The biggest levers are data and feedback, not the visual design.

---

## What is already good

- **Four-question entry** with auto-advance, back arrow and progress `n/4` ([02](2026-11-interview-review/02-p1-q1-job-mobile.jpg)–[05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg)). One click per question.
- **„Betrag später eintragen“ ("Enter amount later")** for donations, health insurance and household ([catalog](../../apps/mobile-web/src/screens/catalog/CatalogScreen.tsx:351)). This lowers the risk of abandonment.
- **LStB screen with paper line numbers** („Bruttoarbeitslohn (Zeile 3)“ ("Gross wages (line 3)")) and scanning directly on the device ([10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg)). This is the model for all other screens.
- **Estimate as a range** with an origin chip ([11](2026-11-interview-review/11-p1-cockpit-nach-lstb-mobile.jpg)). That is honest.
- **The owl's draft cards** with before/after, refund simulation, paragraph and undo ([18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)). Conceptually strong.
- **Tiles grouped by person** („Du“ ("You") / „Julia“, [34](2026-11-interview-review/34-pr510-p2-cockpit-julia-kacheln-mobile.jpg)).
- **Switzerland depth:** non-return days, exchange-rate explanation, Pensionskasse obligatorisch/überobligatorisch (mandatory/extra-mandatory). WISO and Taxfix do not offer this in this form.
- **Address search** fills in street, postcode and city. The child's name is suggested with the user's own surname.

---

## Findings by severity

Severity means: **Critical** = wrong result or breach of trust that leads to abandonment. **High** = core goal (visibility, continuity) clearly missed. **Medium** = noticeable friction. **Low** = polish.

### Critical

#### K1 – The owl suggests values against the user's statement, and the workbench takes over mutually exclusive alternatives together
- **Persona:** P1 · **Screenshot:** [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg), [17](2026-11-interview-review/17-p1-eule-start-desktop.jpg)
- **Code:** [advisor.ts:906-945](../../packages/core/src/interview/advisor.ts:906), [OwlModeScreen.tsx:410](../../apps/mobile-web/src/screens/advisor/OwlModeScreen.tsx:410), [OwlModeScreen.tsx:644](../../apps/mobile-web/src/screens/advisor/OwlModeScreen.tsx:644)
- **Observation:** The input was „Ich war 2026 an 80 Tagen im Homeoffice.“ ("I worked from home on 80 days in 2026."). The owl offers two paths: A „1–2 Tage/Woche“ ("1–2 days/week") (+6 €) and B „Fast immer … 210 Tage = 1.260 €“ ("Almost always … 210 days = 1,260 €") (+20 €). The 80 days appear nowhere. Path B would inflate the tax return beyond the actual statement. The workbench on the right then offers „✓ 2 Änderungen übernehmen“ ("✓ Apply 2 changes") and would write **both** mutually exclusive values.
- **Further oddities:**
  - The simulation shows „692 € → 698 €“, although the cockpit says at the same time that it does not calculate a refund (see K3).
  - The effect of only +6 € is not explained (employee lump-sum allowance).
  - The workbench reports „Alles geprüft. Keine offenen Fragen!“ ("Everything checked. No open questions!"), although 9 master data items are missing.
- **Limitation:** The AI ran in basic mode because no API key was set. So what was tested is the rule fallback. With an LLM the answer may differ, but the fallback is exactly what goes live in an outage.
- **Suggestion:**
  - Derive suggestions only from the user's statements („80 Tage × 6 € = 480 €“).
  - Offer alternatives as a choice (radio) instead of a stack. Block „Alle übernehmen“ ("Apply all") for mutually exclusive drafts.
  - Show „Alles geprüft“ only when really nothing is open.

#### K2 – Default year 2026: the user fills in a current year and ends up in a dead end
- **Persona:** P1 · **Screenshot:** [02](2026-11-interview-review/02-p1-q1-job-mobile.jpg), [20](2026-11-interview-review/20-p1-ausdruck-2026-sackgasse-desktop.jpg)
- **Code:** [taxYear.ts:1](../../apps/mobile-web/src/config/taxYear.ts:1) (`CURRENT_TAX_YEAR = 2026`), [ShellState.tsx:69](../../apps/mobile-web/src/navigation/ShellState.tsx:69)
- **Observation:** New users start in „Woher kam dein Geld 2026?“ ("Where did your money come from in 2026?"), i.e. in the current year. Interview, account, LStB, catalogs and filing check all run through. Only at the printout does it say: „Für 2026 gibt es die amtlichen Vordrucke noch nicht.“ ("The official forms for 2026 do not exist yet."). A Lohnsteuerbescheinigung (wage tax certificate) for 2026 does not even exist yet in November 2026.
- **Suggestion:**
  - The default is the last completed year (today 2025).
  - The current year is called „2026 vorbereiten“ ("Prepare 2026") and has its own mode: collect documents, tax tips for the end of the year, no printout.
  - The year is visible on the first interview screen and can be changed there.

#### K3 – The estimate is missing for most personas or contradicts itself
- **Persona:** P1, P3 (P2 on `main` without a created Zusammenveranlagung as well) · **Screenshot:** [13](2026-11-interview-review/13-p1-lohnersatz-schaetzung-verschwindet-mobile.jpg), [31](2026-11-interview-review/31-p3-cockpit-null-euro-mobile.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)
- **Code:** [tax-estimate.service.ts:107-113](../../apps/api/src/tax-estimate/tax-estimate.service.ts:107), [resources.ts:1306-1308](../../apps/mobile-web/src/i18n/resources.ts:1306)
- **Observation:**
  - **Pensioners:** After an 18,000 € statutory pension, the cockpit shows „Erfasstes Einkommen **0 €**“ ("Recorded income 0 €") and „Die Erstattung rechnen wir bisher nur für Angestellte.“ ("So far we only calculate the refund for employees."). The pension tile is nevertheless set to „Erledigt“ ("Done"). This looks like data loss.
  - **An honest answer is punished:** If P1 answers **Ja** ("Yes") to „Lohnersatz?“ ("Wage replacement?"), the previously visible range (588–649 €) disappears immediately: „Mit Nebenjob, Abfindung, Lohnersatz oder doppelter Haushaltsführung rechnen wir die Erstattung noch nicht.“ ("With a side job, severance pay, wage replacement or double household we do not calculate the refund yet.").
  - **Contradiction:** At the same moment, the owl chat says „Erstattung (Simulation): 692 €“ ("Refund (simulation): 692 €").
  - The filing check then sends the user to „Öffnen: Lebenslagen“ ("Open: life situations"). But she cannot repair anything there, because the limit lies in the app ([19](2026-11-interview-review/19-p1-abgabe-pruefung-desktop.jpg)).
- **Suggestion:**
  - Include pensioners (taxable portion under § 22 EStG) and wage replacement (Progressionsvorbehalt (progression proviso)) in the estimate.
  - Until then, keep the last known range with the note „ohne Lohnersatz“ ("without wage replacement") instead of deleting it.
  - Never show „Erfasstes Einkommen“ as 0 € when income has been recorded.
  - Feed chat and cockpit from the same source.

### High

#### H1 – The number that matters is the smallest on the screen, and saving has no visible effect
- **Persona:** P1, P2, P3 · **Screenshot:** [11](2026-11-interview-review/11-p1-cockpit-nach-lstb-mobile.jpg), [16](2026-11-interview-review/16-p1-cockpit-desktop.jpg)
- **Code:** [CockpitScreen.tsx:513-522](../../apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx:513), [CockpitScreen.tsx:230-268](../../apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx:230), [saveFeedback.ts](../../apps/mobile-web/src/screens/shared/saveFeedback.ts)
- **Observation:**
  - Large and in neon, the hero says „ERFASSTES EINKOMMEN 48.000 €“ ("RECORDED INCOME 48,000 €"). The refund „Voraussichtlich 588 – 649 €“ ("Expected 588 – 649 €") is small and gray below it.
  - After saving a screen, the app jumps to the cockpit without saying what changed (no „+120 € durch Spenden“ ("+120 € from donations")).
  - The value is only available in the cockpit (`CockpitScreen.tsx:235`). In the catalog and screens there is no delta hint.
- **Suggestion:**
  - Flip the hero: refund or additional payment as the main number, income as secondary info.
  - After every save, show an effect line: „Spenden 250 € → Anlage Sonderausgaben Z. 5 → +48 € Erstattung“ ("Donations 250 € → Anlage Sonderausgaben line 5 → +48 € refund").
  - For values without a tax effect, say so as well and give the reason („Pauschbetrag 1.230 € noch nicht überschritten“ ("Lump sum of 1,230 € not exceeded yet")).

#### H2 – No form and line transparency outside of LStB and master data
- **Persona:** P1, P2, P3 · **Screenshot:** [16](2026-11-interview-review/16-p1-cockpit-desktop.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg), [20](2026-11-interview-review/20-p1-ausdruck-2026-sackgasse-desktop.jpg)
- **Code:** [CockpitTiles.tsx:146-160](../../apps/mobile-web/src/screens/cockpit/CockpitTiles.tsx:146), [ProposalCards.tsx:109-142](../../apps/mobile-web/src/screens/advisor/chat/ProposalCards.tsx:109), [advisor.ts:141-170](../../packages/core/src/interview/advisor.ts:141), [PrintoutScreen.tsx:121-229](../../apps/mobile-web/src/screens/printout/PrintoutScreen.tsx:121)
- **Observation:**
  - Tiles show only title and status („Offen“ ("Open") / „Erledigt“), no amount and no Anlage.
  - Draft cards show the field value („Nie → Fast immer“ ("Never → Almost always")), but not where it lands (Anlage N, line 45).
  - The printout is a checklist with a PDF download, without a preview of the forms and without a jump from a line back into the screen.
  - Only the LStB screen („Zeile 3“) and the master data („Zeile 19–24 ESt 1 A“) name lines. That is inconsistent.
  - Origin is shown per screen, not per value. The origin chip in the hero shows „Spannen-Regel · ADR-015“ ("Range rule · ADR-015"), i.e. an internal ADR number ([resources.ts:1235](../../apps/mobile-web/src/i18n/resources.ts:1235)).
- **Suggestion:**
  - Every tile gets a footer „Anlage N · 3 Zeilen · 1.240 €“ ("Anlage N · 3 lines · 1,240 €").
  - Draft cards get a line chip.
  - A „Formular-Ansicht“ ("form view") that shows the official lines filled in live. Tapping a line opens the screen, and the origin is shown per value (document, owl, self).

#### H3 – Interview answers are not carried over: double entry for married couples
- **Persona:** P2 · **Screenshot:** [26](2026-11-interview-review/26-p2-stammdaten-familienstand-nicht-vorbelegt-mobile.jpg), [27](2026-11-interview-review/27-p2-zusammenveranlagung-partner-mobile.jpg), [37](2026-11-interview-review/37-pr510-p2-kind-ehepartner-keines-mobile.jpg)
- **Code:** [MasterDataScreen.tsx:203](../../apps/mobile-web/src/screens/master-data/MasterDataScreen.tsx:203); PR #510: `ChildrenScreen.tsx:166` (`married` only reads `masterData.familienstand`)
- **Observation:**
  - The interview asks „Verheiratet“ ("Married"), in PR #510 additionally „Und dein Ehepartner? → Angestellt → Arbeitet Person B auch in der Schweiz?“ ("And your spouse? → Employed → Does Person B also work in Switzerland?"). Nevertheless:
    - The marital status in the master data is **not prefilled**.
    - The Zusammenveranlagung has to be created by hand. The cockpit says about this: „Ihr seid verheiratet: Leg in ‚Angaben für die Erklärung‘ die Zusammenveranlagung an.“ ("You are married: create the joint assessment in 'Details for the return'.").
    - The partner's occupation is not prefilled.
  - The new choice „Die Kinderzulage kommt mit dem Lohn von [mir] [Person B]“ ("The Kinderzulage comes with the wages of [me] [Person B]") only appears once the marital status is **saved in the master data**. The interview's „Verheiratet“ is not enough.
  - In the children screen, „Kindschaftsverhältnis zu deinem Ehepartner“ ("Parent-child relationship to your spouse") is prefilled with **„Keines“ ("None")** and hidden under „Weitere Angaben“ ("More details"). For joint children this leads to a wrong Anlage Kind.
- **Suggestion:**
  - One source of truth: interview answers set marital status, assessment type and Person B directly (with a „Ändern“ ("Change") link).
  - For Zusammenveranlagung, set "joint child" as the default and move the question forward.
  - Ask for the partner's name early, so that all follow-up questions can say "Julia" instead of "Person B".

#### H4 – The progress indicator is misleading: counters jump, total scope unknown
- **Persona:** P1, P2 · **Screenshot:** [05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg), [06](2026-11-interview-review/06-p1-kontowand-mobile.jpg), [08](2026-11-interview-review/08-p1-onboarding-1von3-mobile.jpg), [13](2026-11-interview-review/13-p1-lohnersatz-schaetzung-verschwindet-mobile.jpg), [32](2026-11-interview-review/32-pr510-p2-partner-frage-0von4-mobile.jpg)
- **Code:** [resources.ts:177](../../apps/mobile-web/src/i18n/resources.ts:177), [CatalogScreen.tsx:242](../../apps/mobile-web/src/screens/catalog/CatalogScreen.tsx:242), PR #510 `QuestionScreen.tsx`
- **Observation:**
  - The interview counts `1/4 … 4/4`, after which it says „**Drei** Antworten, und wir wissen …“ ("**Three** answers, and we know …").
  - The onboarding starts again at `1/3`.
  - In PR #510 the partner question jumps back from `4/4` to **`0/4`** and stays at `0/4` for the follow-up question.
  - Catalog counters start at „0 von 5“ ("0 of 5"). After a „Ja“ the target grows („4 von 6“).
  - Overall it is never visible how far the user is from "ready to file".
- **Suggestion:**
  - One continuous progress up to filing, e.g. „Abgabebereit: 6 von 11 Themen“ ("Ready to file: 6 of 11 topics"), in the cockpit and as a thin bar in the sheet.
  - Show sub-questions as a sub-step (`4a`) instead of moving the target.
  - Derive the texts („Drei Antworten“) from the actual number.

#### H5 – The deadline warning is blanket and alarming
- **Persona:** P2, P3 · **Screenshot:** [21](2026-11-interview-review/21-p2-2025-fristwarnung-mobile.jpg), [31](2026-11-interview-review/31-p3-cockpit-null-euro-mobile.jpg)
- **Code:** [DeadlinesBanner.tsx](../../apps/mobile-web/src/screens/deadlines/DeadlinesBanner.tsx), [resources.ts:996](../../apps/mobile-web/src/i18n/resources.ts:996)
- **Observation:**
  - In the year 2025, every user sees, even before the first answer: „Die Abgabefrist 31.07.2026 ist um 106 Tage überschritten. Verspätungszuschlag (§ 152 AO): mindestens 25 € pro Monat.“ ("The filing deadline 31.07.2026 has been exceeded by 106 days. Late-filing surcharge (§ 152 AO): at least 25 € per month.").
  - This only applies when filing is mandatory. Voluntary tax returns (typical employee, many pensioners) have four years and no surcharge.
  - Even for mandatory assessment, the surcharge is discretionary before 14 months after the end of the year have passed (§ 152 Abs. 2 AO). „Mindestens 25 € pro Monat“ is therefore phrased too harshly for November 2026.
  - For Hans (pensioner, income „0 €“) the warning sits right next to the missing estimate.
- **Suggestion:**
  - Show the deadline only after the mandatory-assessment check. Grenzgänger CH are usually obliged to file, a simple employee is not.
  - For voluntary filing: „Freiwillig, du hast Zeit bis 31.12.2029. Eine Erstattung kommt schneller, je früher du abgibst.“ ("Voluntary, you have until 31.12.2029. A refund comes faster the earlier you file.").
  - In tone, show the solution („Heute abgeben dauert noch ~20 Min.“ ("Filing today still takes ~20 min.")), not only the penalty.

#### H6 – The Switzerland screen is overloaded: 30 fields, sums by hand, no feedback on what is missing
- **Persona:** P2 · **Screenshot:** [24](2026-11-interview-review/24-p2-ch-lohnausweis-titel-abgeschnitten-mobile.jpg), [25](2026-11-interview-review/25-p2-cockpit-nach-fertig-weiter-offen-mobile.jpg), [23](2026-11-interview-review/23-p2-nichtrueckkehrtage-mobile.jpg)
- **Code:** [CrossBorderScreen.tsx](../../apps/mobile-web/src/screens/cross-border/CrossBorderScreen.tsx)
- **Observation:**
  - One page contains 14 Lohnausweis items, exchange rate, pension provision, 13 N-Gre fields and a special-case question. In total there are **30 input fields**.
  - Item 8 (total) and 11 (net) can be derived from the other items but have to be typed.
  - The terms BVG, NBUV, Säule 2a/2b and KK-Taggeld are not explained.
  - After „Fertig“ ("Done"), the app jumps to the cockpit. The tile stays **„Offen“**, „Nächster Schritt: Schweizer Lohnausweis“ ("Next step: Swiss Lohnausweis") remains, and there is no hint at all about *what* is missing (presumably the exchange rate).
  - The title „CH-Lohnausweis“ is cut off on the right.
- **Suggestion:**
  - Split into 3 steps: Lohnausweis (scan first), exchange rate (prefilled with the official annual average), N-Gre extras.
  - Calculate sums live and only flag deviations.
  - On „Fertig“ with open mandatory details, stay on the page and mark the first missing field.

#### H7 – The Person B logic from PR #510 is not yet thought through
- **Persona:** P2 (PR #510) · **Screenshot:** [32](2026-11-interview-review/32-pr510-p2-partner-frage-0von4-mobile.jpg)–[37](2026-11-interview-review/37-pr510-p2-kind-ehepartner-keines-mobile.jpg)
- **Code:** PR #510 `CatalogScreen.tsx:115-126` („Für wen?“), `ChildrenScreen.tsx` (Kinderzulage choice with hard-coded texts „mir“ ("me") / „Person B“ outside of i18n), `CockpitPartnerSection.tsx`
- **Observation:**
  - **„Für wen?“** sits as a switch above the catalog. If you switch to „für Julia“ ("for Julia"), the catalog continues to ask „Hast du gespendet?“ ("Did you donate?") ([36](2026-11-interview-review/36-pr510-p2-fuer-wen-julia-gleiche-frage-mobile.jpg)). Whether the switch applies to the one question or the whole catalog is unclear.
  - With Zusammenveranlagung, the assignment of donations has no tax effect. There the switch creates a decision without any benefit.
  - In the interview the partner is called „**Person B**“ („Arbeitet Person B auch in der Schweiz?“). That is form language.
  - In the cockpit Julia gets **both** „Lohnsteuerbescheinigung“ and „Lohnausweis Schweiz“, although the interview records her as a pure Grenzgängerin ([34](2026-11-interview-review/34-pr510-p2-cockpit-julia-kacheln-mobile.jpg)).
  - The partner question knows neither „Selbstständig“ ("Self-employed") nor "Grenzgänger in retirement".
  - For Julia, the master data still only offer „Lohnsteuerbescheinigung von Julia erfassen“ ("Enter Julia's Lohnsteuerbescheinigung") and „Arbeitsweg“ ("Commute"), no Lohnausweis.
  - The married couple sees the tile „Alleinerziehend“ ("Single parent") and, in the children screen, the block „Entlastungsbetrag für Alleinerziehende“ ("Relief amount for single parents").
- **Suggestion:**
  - Show „Für wen?“ only where the assignment matters (health/long-term care insurance, Riester, commutes, wage replacement). Rewrite the question text („Hat Julia gespendet?“ ("Did Julia donate?")).
  - Place the switch per question as a chip below the question, not globally.
  - Derive tiles from the partner's occupation.
  - Hide single-parent content for married users.
  - Move the Kinderzulage texts into i18n and use the name instead of „Person B“.

### Medium

#### M1 – Line breaks in the middle of words and cut-off titles
- **Persona:** all · **Screenshot:** [05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg) „Familienstan|d“, [09](2026-11-interview-review/09-p1-onboarding-steuernummer-wordbreak-mobile.jpg) „Steuernumm|er“, [10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg) „Lohnsteuerbesch|einigung“, [15](2026-11-interview-review/15-p1-sonderausgaben-kv-wordbreak-mobile.jpg) „Pflegeversicherun|g“, [23](2026-11-interview-review/23-p2-nichtrueckkehrtage-mobile.jpg) „zurückgekeh|rt“, [24](2026-11-interview-review/24-p2-ch-lohnausweis-titel-abgeschnitten-mobile.jpg), [27](2026-11-interview-review/27-p2-zusammenveranlagung-partner-mobile.jpg) chip „Einzelveranlagun…“
- **Code:** [interview/styles.ts:37](../../apps/mobile-web/src/screens/interview/styles.ts:37) (`size['3xl']`), sheet titles in the screens
- **Suggestion:** On web, `hyphens: auto` with `lang="de"`. Break long compounds with `&shy;` or lower the font size one step when too long. Let chip rows wrap. Extend the 375 px screenshot test in `e2e/visual` to cover the titles.

#### M2 – Technical terms without explanation, only a single catalog hint
- **Persona:** all · **Screenshot:** [03](2026-11-interview-review/03-p1-q2-ausland-mobile.jpg), [04](2026-11-interview-review/04-p1-q3-kinder-mobile.jpg), [12](2026-11-interview-review/12-p1-lebenslagen-dhf-mobile.jpg), [28](2026-11-interview-review/28-p2-kinder-maske-mobile.jpg), [30](2026-11-interview-review/30-p3-rente-maske-mobile.jpg)
- **Code:** [resources.ts:1016-1063](../../apps/mobile-web/src/i18n/resources.ts:1016); `katalog.hints` only has `haushalt-gate` ([resources.ts:1057](../../apps/mobile-web/src/i18n/resources.ts:1057), [CatalogScreen.tsx:234](../../apps/mobile-web/src/screens/catalog/CatalogScreen.tsx:234))
- **Observation:** Left without explanation are, among others:
  - „doppelte Haushaltsführung“ ("double household"), „Lohnersatz“, „Minijob/Midijob/Nebenjob“ (the option „Nebenjob“ ("side job") repeats the question)
  - „Günstigerprüfung“, „Splittingtarif“ ("splitting tariff"), „60-Tage-Tracking“ ("60-day tracking") (for non-Grenzgänger)
  - „Rentenbezugsmitteilung“ ("pension statement"), „BEA-Freibetrag“ ("childcare/education allowance"), „unmittelbar/mittelbar“ ("directly/indirectly") (Riester)
  - „Beitragspflichtige Einnahmen im Vorjahr“ ("Income subject to contributions in the previous year")
  - There are no info icons and no glossary.
- **Suggestion:**
  - Every question gets a line „Was heißt das?“ ("What does that mean?") with an example, e.g. „Doppelte Haushaltsführung = zweite Wohnung am Arbeitsort, weil der Weg zu weit ist“ ("Double household = second home at the place of work because the commute is too far").
  - Name the technical term only after the everyday term.
  - A shared glossary that the owl uses too.

#### M3 – Irrelevant questions and tiles
- **Persona:** P1, P3, P2 · **Screenshot:** [29](2026-11-interview-review/29-p3-rentner-pendelfrage-mobile.jpg), [07](2026-11-interview-review/07-p1-cockpit-leer-mobile.jpg), [34](2026-11-interview-review/34-pr510-p2-cockpit-julia-kacheln-mobile.jpg)
- **Code:** [interview.ts:148](../../packages/core/src/interview/interview.ts:148) (fixed `QUESTION_ORDER`), tile personas in [tiles.ts](../../apps/mobile-web/src/screens/cockpit/tiles.ts)
- **Observation:**
  - The pensioner is asked: „Pendelst du **zum Arbeiten** ins Ausland?“ ("Do you commute abroad **for work**?")
  - Single Lena without children sees „Kinder verwalten“ ("Manage children"), „Kapital & Depot prüfen“ ("Check capital & securities account") and „Vermietung prüfen“ ("Check rental income") as fixed buttons.
  - The married couple sees „Alleinerziehend“.
- **Suggestion:** Rephrase `ausland` for „Rente“ ("Pension") („Bekommst du eine Rente aus dem Ausland?“ ("Do you receive a pension from abroad?")) or skip it. Tie the quick links at the bottom of the cockpit to the answers.

#### M4 – Guest loop: the main CTA leads back to the account wall
- **Persona:** P1 · **Screenshot:** [06](2026-11-interview-review/06-p1-kontowand-mobile.jpg), [07](2026-11-interview-review/07-p1-cockpit-leer-mobile.jpg)
- **Code:** [KontoWandScreen.tsx](../../apps/mobile-web/src/screens/funnel/KontoWandScreen.tsx), [afterTheInterview.ts](../../apps/mobile-web/src/screens/funnel/afterTheInterview.ts)
- **Observation:** After „Später — erst mal ins Cockpit“ ("Later — to the cockpit first"), the neon green button „Weiter mit deinem Weg“ ("Continue on your path") leads back to the account wall. The guest sees not a single value and has no way to enter anything. On the phone, the „Später“ ("Later") button lies half under the tab bar.
- **Suggestion:**
  - Let guests fill in the LStB screen and show a first range. Require the account only when saving or filing. This matches "Value First" from ADR-0045.
  - On the account wall, state the reason („damit deine LStB nicht verloren geht“ ("so that your LStB does not get lost")).

#### M5 – Contradictory or empty status messages
- **Persona:** P1, P2 · **Screenshot:** [07](2026-11-interview-review/07-p1-cockpit-leer-mobile.jpg), [11](2026-11-interview-review/11-p1-cockpit-nach-lstb-mobile.jpg), [14](2026-11-interview-review/14-p1-cockpit-bitte-pruefen-mobile.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)
- **Observation:**
  - The cockpit says „Noch offen · 3 Posten offen · **0 Fragen offen**“ ("Still open · 3 items open · 0 questions open").
  - It reports „Kirchensteuer offen: Trag deine Konfession ein“ ("Church tax open: enter your denomination"), although the LStB screen explained: „Ohne Kirche lass beide Felder leer.“ ("Without a church, leave both fields empty.").
  - The life situations tile shows „Erledigt · **Bitte prüfen**“ ("Done · Please check") without a reason.
  - The owl reports „Alles geprüft“ while the cockpit button shows „9 fehlen“ ("9 missing").
  - The tile heading says „Nachzahlung senken“ ("Reduce additional payment") or „Erstattung erhöhen“ ("Increase refund") before there is any estimate at all.
- **Suggestion:** Every warning gets a sentence with the *what* and a button to the *where*. The heading is neutral („Was noch fehlt“ ("What is still missing")) until there is a direction. Derive church tax from the empty LStB line 6 as "none" (with a follow-up question).

#### M6 – The legal status date is inconsistent and hard-coded
- **Persona:** P1 · **Screenshot:** [17](2026-11-interview-review/17-p1-eule-start-desktop.jpg), [18](2026-11-interview-review/18-p1-eule-homeoffice-entwuerfe-desktop.jpg)
- **Code:** [OwlModeScreen.tsx:668](../../apps/mobile-web/src/screens/advisor/OwlModeScreen.tsx:668), [resources.ts:1633](../../apps/mobile-web/src/i18n/resources.ts:1633)
- **Observation:** On the same screen, in tax year 2026, it says „Rechtsstand 01.01.2025“ ("Legal status 01.01.2025") three times (footer, workbench) and „Rechtsstand 13.11.2026“ on the cards.
- **Suggestion:** Derive the legal status date from the rule set of the selected year, never build it in as fixed text.

#### M7 – Missing input aids in the screens
- **Persona:** P1, P3 · **Screenshot:** [10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg), [30](2026-11-interview-review/30-p3-rente-maske-mobile.jpg)
- **Observation:**
  - The user has to add up the „SV-Arbeitnehmeranteil (Summe der Zeilen 23, 25, 26 und 27)“ ("Employee social security share (sum of lines 23, 25, 26 and 27)") herself.
  - All amounts only accept whole euros, although the LStB shows cents.
  - The pension is a **single choice**, although statutory pension plus widow's pension is common.
  - There is no scan for the Rentenbezugsmitteilung as there is for the LStB.
  - „Noch nicht ermittelbar“ ("Cannot be determined yet") remains although amount and start are entered. A live preview of the taxable portion is missing.
  - Health offers no "later" and does not explain that something only has an effect above the reasonable burden.
  - The Enter key does not submit onboarding forms.
- **Suggestion:**
  - Offer four social security fields or take the sum from the scan.
  - Round cent amounts automatically and say so.
  - Allow several pensions.
  - Show live „davon steuerpflichtig: 14.220 € (79 %)“ ("of which taxable: 14,220 € (79 %)").
  - For medical costs, estimate the reasonable burden in advance („wirkt erst ab ca. 900 €“ ("only takes effect from about 900 €")).

#### M8 – Accessibility
- **Persona:** P2 · **Screenshot:** [22](2026-11-interview-review/22-p2-ch-wohnsitz-kontrast-mobile.jpg), [23](2026-11-interview-review/23-p2-nichtrueckkehrtage-mobile.jpg), [27](2026-11-interview-review/27-p2-zusammenveranlagung-partner-mobile.jpg)
- **Code:** [MasterDataScreen.tsx](../../apps/mobile-web/src/screens/master-data/MasterDataScreen.tsx) (partner block)
- **Observation:**
  - The six partner input fields (first name through occupation) have **no accessible name**. Neither `aria-label` nor a linked label is set, so a screen reader reads "text field".
  - Highlighted words in neon lime on beige („du“, „nicht“) have clearly too little contrast.
- **Suggestion:** Pass `accessibilityLabel` from the `Feld` wrapper through to the input. Use the highlight only as a background marker (as with „Geld“), never as text color.

### Low

| # | Finding | Persona | Screenshot | Suggestion |
|---|---|---|---|---|
| N1 | The sheet height jumps from question to question, so the yes/no buttons move (risk of mis-taps) | P1 | [12](2026-11-interview-review/12-p1-lebenslagen-dhf-mobile.jpg), [13](2026-11-interview-review/13-p1-lohnersatz-schaetzung-verschwindet-mobile.jpg) | Fixed sheet height, answers anchored at the bottom |
| N2 | Desktop: narrow column, phone tab bar, tiles without additional information | P1 | [16](2026-11-interview-review/16-p1-cockpit-desktop.jpg) | From 1024 px a two-column layout (tiles \| form preview), navigation on the left |
| N3 | Login for first-time visitors: „weiter, wo du aufgehört hast“ ("continue where you left off") | P1 | [01](2026-11-interview-review/01-login-mobile.jpg) | Text depending on a known session |
| N4 | Two close affordances per sheet („←“ and „Schließen“ ("Close")) | all | [10](2026-11-interview-review/10-p1-lstb-maske-mobile.jpg) | „←“ = previous question, „Schließen“ = close sheet, label both |
| N5 | „Familienstand am 31.12.“ ("Marital status on 31.12."): for splitting, *one* day in the year counts. „Verwitwet“ ("Widowed") without the year of death (widow's splitting in the following year) | P3 | [05](2026-11-interview-review/05-p1-q4-familienstand-wordbreak-mobile.jpg) | „… im Jahr 2025 (auch nur kurz)?“ ("… in the year 2025 (even if only briefly)?"); for widowed, ask for the year |
| N6 | Lohnausweis in CHF, Swiss Kinderzulage in € | P2 | [37](2026-11-interview-review/37-pr510-p2-kind-ehepartner-keines-mobile.jpg) | One currency per document, conversion by the app |

---

## Rating matrix

Scale 1 (poor) to 5 (very good). What is rated is the observed state, not the plan.

| Criterion | P1 employee | P2 Grenzgänger couple | P3 pensioner | **Overall** | Main driver |
|---|:-:|:-:|:-:|:-:|---|
| **Comprehensibility** | 3.5 | 2 | 3 | **2.8** | + clear 4 questions; − technical terms without help (M2), „Person B“, 30-field screen (H6) |
| **Transparency** (what happens in the tax return) | 2.5 | 1.5 | 1 | **1.7** | − no lines/forms (H2), no effect after saving (H1), estimate missing (K3) |
| **Effort** (clicks, double entry) | 3.5 | 2 | 3.5 | **3.0** | + 1 click/question, "later"; − double entry (H3), sums by hand (H6, M7) |
| **Trust** | 2.5 | 2.5 | 1.5 | **2.2** | − 2026 dead end (K2), „0 €“ (K3), owl suggestion (K1), deadline alarm (H5), legal status date (M6); + range, paragraphs |
| **Error tolerance** | 3.5 | 2.5 | 3 | **3.0** | + back, "later", undo on drafts; − „Fertig“ without a hint (H6), batch apply (K1), default „Keines“ (H3) |
| **Ø** | 3.1 | 2.1 | 2.4 | **2.6** | |

---

## Positioning: Steuereule today vs. WISO, Taxfix, ELSTER

| | **ELSTER** | **WISO Steuer** | **Taxfix** | **Steuereule today** |
|---|---|---|---|---|
| Entry | form tree | interview or form, desktop-first | chat-like interview, mobile-first | 4-question path, mobile-first, ✔ |
| View of form/line | maximal (it *is* the form) | good (form view can be toggled) | low | low (only LStB, master data) ✘ |
| Live refund | none | yes, constantly visible | yes | only for single employees, small ✘ |
| Explanation/advice | none | help texts, guides | short tooltips | owl with paragraph, before/after ✔ (quality see K1) |
| Grenzgänger CH | form N-Gre, without help | possible, a lot of manual work | not covered | **deep and guided** ✔✔ |
| Document retrieval / prefill | yes (VaSt) | yes (via ELSTER) | yes | not observed ✘ |
| Honesty about limits | – | – | little | **explicit** („Ehrlich: … können wir noch nicht“) ✔ |

**What already sets Steuereule apart today:**
1. Grenzgänger to Switzerland as a core case, not as an edge case.
2. An advisor in the product who names paragraphs and proposes changes as a reviewable draft with undo instead of writing them silently.
3. An honest range instead of false precision.
4. A household with persons instead of a form with columns.

**What is missing for a game changer:**
1. **"Glass tax return":** every input immediately shows *form → line → euro effect*, and every line of the official view leads back to its source. None of the three competitors does this so consistently: WISO shows lines but no origin; Taxfix shows effect but no lines.
2. **An estimate that applies to everyone** (pensioners, couples, wage replacement); otherwise the core promise only holds for one persona.
3. **One data stream instead of islands:** interview, master data, partner and children share one truth. Nothing is asked twice.
4. **Document retrieval/prefill** (ELSTER VaSt) or at least "carry over previous year" as the default start. That shortens data entry by orders of magnitude.
5. **Year-round mode for the current year** (instead of K2): „Bis 31.12. noch 340 € holen“ ("Get another 340 € by 31.12."), collect documents, count home office days. This is where the owl fits best.

---

## The five levers with the greatest effect

Effort: **S** ≤ 2 person-days, **M** ≤ 1 week, **L** > 1 week.

| # | Lever | Solves | Effect | Effort |
|---|---|---|---|:-:|
| **1** | **Effect line after every save and flip the hero.** Refund/additional payment as the main number. After every save, a banner „Spenden 250 € → Anlage Sonderausgaben Z. 5 → +48 €“. Tiles with amount and Anlage. For the PDF printout there are already field names per Anlage (e.g. `anlN_wegOrt`, [resources.ts:438](../../apps/mobile-web/src/i18n/resources.ts:438)) on which the mapping can build. | H1, H2, M5 | Visibility (question 2) from "barely" to "constantly". Biggest difference to WISO and Taxfix. | **M** (hero S; delta banner + line chips M; full form view L) |
| **2** | **Estimate for all core personas.** Pensions (taxable portion), wage replacement (Progressionsvorbehalt), couples directly from the interview answers. Never „0 €“, never a vanished range, chat and cockpit from one source. | K3, M5 | Trust; P3 gets a value at all for the first time | **L** (core calculation) / **S** (keep the range instead of deleting it, prevent „0 €“) |
| **3** | **One data stream and one progress.** The interview sets marital status, Zusammenveranlagung and Person B (with name). Children of couples "joint" by default. One continuous „Abgabebereit: x von y“ ("Ready to file: x of y"). | H3, H4, H7, M3 | Fewer clicks, no wrong Anlagen | **M** |
| **4** | **Secure the owl.** Suggestions only from user statements, alternatives exclusive (choice instead of batch), dynamic legal status date, „Alles geprüft“ only when true, line chip on drafts. | K1, M6 | Prevents wrong tax returns and breaches of trust | **S–M** |
| **5** | **Set year and deadline correctly.** Default = last completed year. Current year as a "prepare" mode. Deadline warning only for mandatory assessment and with the correct level. | K2, H5 | No dead end at the end, no false alarm | **S** |

**Quick wins on the side (S each):** line breaks and cut-off titles (M1); help line for the 10 most frequent technical terms (M2); hide irrelevant questions and tiles (M3); labels of the partner fields (M8); „Fertig“ in the CH screen shows what is missing (H6, partly).

---

## Implementation in this PR

Assignment: the critical findings K1–K3 and levers 1, 2, 3 and 5. Lever 4 (secure the owl) is excluded; only the critical part K1 is implemented. The branch contains PR NexusHero/Steuereule#510.

| Finding / lever | Implemented | Where |
|---|---|---|
| **K1** owl | Home office draft only with the stated days (`commute.homeOfficeDays`, „80 Tage × 6 € = 480 €“); 210 days only as information now. Mutually exclusive drafts carry `alternativeGroup`: the API rejects a joint batch (`ADVISOR_BATCH_ALTERNATIVE_CONFLICT`), the workbench blocks „Alle übernehmen“ and offers „Diesen Weg übernehmen“ ("Apply this path"). | `packages/core/src/interview/advisor*.ts`, `apps/api/src/advisor/`, `OwlModeScreen.tsx` |
| **K2** + lever 5 | Start year = last completed year (2025). The current year is marked as „läuft“ ("in progress"); cockpit, filing and printout say so up front. Below the first question it says „Anderes Jahr“ ("Other year"). New core function `filingObligation` (pflicht/freiwillig/unklar). The deadline banner distinguishes accordingly and follows § 152 Abs. 2 AO (surcharge mandatory only after 14 months). | `config/taxYear.ts`, `ShellState.tsx`, `DeadlinesBanner.tsx`, `packages/core/src/domains/filing-obligation.ts` |
| **K3** + lever 2 | Single pensioners get a range (Anlage R, 102 € lump sum, KVdR 11–13 % as provision, nothing withheld). Wage replacement is calculated via the Progressionsvorbehalt (§ 32b, minus the unused employee lump-sum allowance), for employees, Grenzgänger and couples. The cockpit counts the pension as recorded income (never „0 €“ again). Wage replacement no longer counts as "recorded, not calculated". All owl drafts take their effect from the real estimate (`previewEffectFor`), otherwise it says „Wirkung noch offen“ ("Effect still open"). | `packages/core/src/engine/tax-estimate.ts`, `married-estimate.ts`, `apps/api/src/tax-estimate/`, `apps/api/src/cockpit/` |
| Lever 1 | With a range, the refund or additional payment is the main number, the income is below it. Effect line after every change („Deine letzte Änderung · Sonderausgaben (Anlage …): +48 € zu deinen Gunsten“ ("Your last change · Sonderausgaben (Anlage …): +48 € in your favor")). Every tile names its form. | `CockpitScreen.tsx`, `effectMemory.ts`, `CockpitTiles.tsx`, `CockpitPartnerSection.tsx` |
| Lever 3 | The interview's „Verheiratet“ sets the marital status in the master data and creates the Zusammenveranlagung, also for guests after the upgrade. Progress 5/6 and 6/6 instead of 0/4. „Dein Partner“ ("Your partner") instead of „Person B“. A new child is prefilled as "joint" for couples. A pure CH partner gets no LStB tile. No single-parent tile for couples. „Für wen?“ says per question for whom it is asking, and that donations count for both. Catalog counter „Frage 1 von 5“ ("Question 1 of 5"). Pensioner phrasing of the foreign question. | `link.service.ts`, `interview.service.ts`, `QuestionScreen.tsx`, `ChildrenScreen.tsx`, `CatalogScreen.tsx`, `tiles.ts` |

**Deliberately not implemented:** official form view with jump to line (lever 1, large), the rest of lever 4 (dynamic legal status date, „Alles geprüft“), self-employed in the estimate, prefilling the partner's name from the interview (the interview has no text field).

## Retest in the browser (after the implementation)

Fresh stack with a throwaway database, all three personas clicked through again. Screenshots: [`2026-11-interview-review/nachtest/`](2026-11-interview-review/nachtest/).

| Check | Result | Screenshot |
|---|---|---|
| Start in the year 2025, „Anderes Jahr“ below question 1 | ✔ | [n01](2026-11-interview-review/nachtest/n01-p1-start-2025-mobile.jpg) |
| Hero „Voraussichtliche Erstattung 483–544 €“ ("Expected refund 483–544 €"), income below, Anlage on every tile, calm banner „Freiwillige Erklärung“ ("Voluntary tax return") | ✔ | [n02](2026-11-interview-review/nachtest/n02-p1-cockpit-erstattung-hero-mobile.jpg) |
| Wage replacement 3,000 €: range stays (248–309 €), effect line names life situations and Anlage, banner correctly switches to mandatory (§ 152 Abs. 2 AO), filing check without "not calculated" | ✔ | [n03](2026-11-interview-review/nachtest/n03-p1-lohnersatz-spanne-wirkungszeile-mobile.jpg) |
| Owl on "80 days in the home office": exactly one draft with 80 days | ✔ | [n04](2026-11-interview-review/nachtest/n04-p1-eule-80-tage-ein-entwurf-desktop.jpg) |
| Owl effect from the real estimate | ✘ → fixed: showed −63 € because § 32b reduced the lump sum incorrectly; now „Im Pauschbetrag (1.230 €)“ ("Within the lump sum (1,230 €)") | [n05](2026-11-interview-review/nachtest/n05-p1-eule-im-pauschbetrag-desktop.jpg) |
| Partner questions count 5/6 and 6/6 | ✔ | [n06](2026-11-interview-review/nachtest/n06-p2-partnerfrage-5von6-mobile.jpg) |
| Zusammenveranlagung automatic, partner without LStB tile, with Lohnausweis Schweiz | ✔ | – |
| First child of the couple prefilled as "joint" | ✘ → fixed (marital status only arrived after the form was opened) | [n07](2026-11-interview-review/nachtest/n07-p2-kind-gemeinsam-vorbelegt-mobile.jpg) |
| „Für wen?“ with donation hint | ✔; text without partner name grammatically wrong („bei deinen Partner“) → fixed | [n08](2026-11-interview-review/nachtest/n08-p2-fuer-wen-spenden-gemeinsam-mobile.jpg) |
| Pensioner: foreign question phrased appropriately | ✔ | [n09](2026-11-interview-review/nachtest/n09-p3-rentner-auslandsfrage-mobile.jpg) |
| Pensioner: income 18,000 €, estimate present, neutral deadline banner („unklar“ ("unclear")) | ✔; „Erstattung 0 €“ → fixed to „Ergebnis 0 € — weder Nachzahlung noch Erstattung“ ("Result 0 € — neither additional payment nor refund") | [n10](2026-11-interview-review/nachtest/n10-p3-rentner-schaetzung-mobile.jpg), [n11](2026-11-interview-review/nachtest/n11-p3-ergebnis-ausgeglichen-mobile.jpg) |

**Left open (not in the assignment):**
- Line break „Familienstan|d“ (M1).
- „Anderes Jahr“ looks like an answer option and should rather appear as a link.
- „Nachzahlung senken“ and „Erstattung erhöhen“ already show before the first estimate (M5).

## Limits of this review

- **AI in basic mode:** no AI key was set locally, so what was tested is the owl's rule-based fallback. A run with a real model is still pending.
- **PR #510** ran as a separate build (own DB, own ports). If the merge changes things, please re-check H7.
- **Not run through:** real document scan (OCR), „Bescheid prüfen“ ("Check tax assessment"), capital/rental income, PDF generation for 2025, ELSTER transmission, email confirmation. I deliberately did not enter a Steuer-ID or tax number.
- **Competitor comparison:** it is based on publicly known product behavior, not on a test within the scope of this review.
