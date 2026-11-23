# ADR-0069 — Owl: advisor stance always, tax knowledge to look up, all tax topics

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #499; `.agents/skills/steuerberater/`, `apps/api/src/ki/{advisor-stance,advisor-knowledge.generated,advisor-income-tax,advisor-tools,advisor-tool-round,advisor-prompt,advisor-topic-guard,ai-runtime-config.service}.ts`, `packages/core/src/interview/{advisor,advisor-answer-check,advisor-topic}.ts`
- **Supplemented:** 2026-11-13, section "Outward topic boundary"
- **Amends:** ADR-0038 and ADR-0066, insofar as they limit the owl to the private income tax return

## Context

The Product Owner wrote a skill "steuerberater" (tax advisor): the stance and workflow of a
thorough tax advisor, eight knowledge files and a tariff calculator. It is meant to always apply in the owl.
The skill is built for a coding agent (reads files, runs a Python script,
looks things up on the web); the owl can do none of that.

## Decision

1. **The stance is in the fixed part of the prompt of every answer** (`ADVISOR_STANCE`): ask first,
   cite the source, pin down the tax year, never calculate in one's head, two ways where there is leeway, plan
   legally, be honest about limits. It is not a skill that can be switched off.
2. **The knowledge is looked up, not sent along.** `lookup_tax_knowledge` returns one
   of the sections. The source is the skill folder `apps/api/skills/steuerberater/`; how it gets into
   the code is governed by "Skills as files" below. `quellen.md` (looking things up on the web) is
   not shipped.
3. **Calculations use the calculation core.** `compute_income_tax` calculates tariff, Soli and
   church tax with `packages/core/src/math`, not with the Python script. The core rounds Soli
   and church tax down to full euros, the script to cents; the income tax is identical.
4. **The app's numbers apply.** The table `kennzahlen` supplements what the app does not calculate.
   A value marked "prüfen" ("check") is named as uncertain. A test compares the
   Grundfreibetrag (basic tax-free allowance) in the table with the core.
5. **The topic boundary within tax is dropped.** The owl also advises, by explanation, on VAT, the self-employed
   and trade, inheritance and gifts, procedure. Drafts still exist only for the app's
   fields, and zero-write applies unchanged. Removed are the rejection of such questions before the
   model call and the notice „gehört nicht zur privaten Einkommensteuererklärung“ ("does not belong to the private income tax return").
6. **What remains:** no binding legal information (still rejected before the model), no
   help with evasion, the protection against prompt injection, the PII check and the check
   "amount not calculated by the app". The referral to a tax advisor in the cases from B8
   is dropped (point 37).

7. **The yardstick is the owl for paying users.** Every knowledge file carries „Stand: Datum,
   geprüft für die Steuerjahre X–Y“ ("As of: date, checked for tax years X–Y"). The amounts of current law have been reconciled against the statute text
   (12 November 2026: 109 places in EStG, UStG, AO, GewStG, ErbStG, SolZG). What is not backed by the
   statute (administrative practice, case law) stays marked "(nicht belegt)" ("(not verified)"), and
   the owl names it as uncertain. A test fires as soon as the calculation core knows a tax year
   for which the knowledge has not been checked.
8. **Proving by hand.** `pnpm --filter @steuereule/api test:eval` asks the real model 21 typical
   advisory questions and checks what a good answer must contain (norm,
   amount, follow-up question, looked up, calculated). No gate, no nightly run: it runs when
   the skill or the prompt changes.

## Outward topic boundary (added 2026-11-13)

Point 5 opens the owl to all tax topics. For everything else it was easy to
misuse up to this point: before the model there were only three word patterns (cake recipe, „schreibe ein Gedicht“ ("write a poem"),
evasion), the prompt said nothing. „Schreib mir ein Gedicht“ ("Write me a poem"), every English question and every
paraphrase got through. Decisions of the Product Owner from 13 November 2026:

9. **Boundary: tax and what directly reaches into it.** Allowed are one's own tax affairs
   (all tax types from point 5), operating the app and what directly reaches into tax:
   documents, mail from the Finanzamt (tax office), Riester/Rürup, Kindergeld, Elterngeld, payslip. Everything else
   is rejected, including general financial, legal and health questions.
10. **A pre-checker decides, not a word list.** A small model in its own AI slot
    `advisor_guard` (`AI_GUARD_PROVIDER`/`_MODEL`/`_API_KEY`/`_TIMEOUT_MS`; default: the small
    model of the chat provider, temperature 0, 5 s) classifies every typed message as `tax`, `gray`
    or `off_topic`, with a rough category and language. It sees the message and the last
    two rounds, so that „Und 2025?“ ("And 2025?") is recognized as a tax question, and treats the message as
    data, not as an instruction. It first ran before the main model, so that a rejection only
    costs a small call; since ADR-0100 it runs alongside it, and until its verdict
    nothing from the main model reaches the user or a tool. The slot becomes configurable in the admin panel with #445; until
    then via the environment like the other slots.
11. **What the checker says, and what follows.**
    - `off_topic`: a fixed sentence („Dabei kann ich dir nicht helfen – ich bin nur für deine
      Steuern da.“ ("I can't help you with that – I'm only here for your taxes.")) in the language of the question (de, en, tr, fr, it, es, pl; otherwise German) and up to
      three suggestions from the open hints of the case. No main model, so it cannot be
      talked round and costs nothing.
    - `gray` (e.g. „ETF oder Bausparvertrag?“ ("ETF or building savings contract?")): the main model answers with the addition of only answering the
      tax part.
    - `tax`: as before.
    - **No verdict** (outage, timeout, unreadable answer, not configured): the message goes
      through (fail-open). The second line of defense is the topic rule in the prompt (guardrail 0) and the
      attack patterns (`PROMPT_INJECTION_PATTERNS`), which take effect before any model at no cost.
12. **Only typed text is checked.** An opening (the server replaces its text) and a
    tapped suggestion or an answer to a question round of the last answer, character for
    character, skip the checker. The server does the matching, not a client flag.
    Quick starts and skills are checked, because their text comes from the client.
13. **The owl does not talk about itself.** Questions about instructions, rules, prompt,
    tools and also about its capabilities („Was kannst du?“ ("What can you do?")) count as `off_topic` (category
    `meta`) and get the fixed sentence.
14. **Evasion is explained, never supported.** The word patterns for it have been removed. An
    honest question („Ist das schon Hinterziehung, wenn ich die Zinsen vergessen habe?“ ("Is it already evasion if I forgot the interest?")) goes to the
    main model, which explains the legal situation, consequences, correction (§ 153 AO) and voluntary disclosure (§ 371 AO)
    and refuses any help with concealment.
15. **Language:** The owl answers in the language of the question; forms, Anlagen (schedules), lines and
    technical terms stay German. Its reasoning stays German.
16. **Counting without text.** The verdict (verdict, category, language, the reason in case of an outage)
    is in the internal `engine` info of the answer, which the client never sees, and in the log
    `advisor_turn`. From this follows the count per user and day. Nobody is blocked or
    throttled.
17. **Proving.** Unit tests with fixed verdicts check the wiring in every CI run
    (`advisor-topic-guard.test.ts`, `advisor-topic-boundary.test.ts`). `test/eval/topic-guard.eval.test.ts`
    measures against the real model, nightly and before every model change: at least 90% of around
    40 misuse attempts rejected, at most 5% of around 40 tax and
    gray-zone questions wrongly rejected, and with the checker down the rule in the prompt holds.
    The finished answer is not re-checked: it has already been read during streaming.

## Skills as files (added 2026-11-13)

Decision of the Product Owner: a skill of the owl lives, as with Claude, as a folder of text files
in the repo and is read in verbatim at build time, not copied by hand into TypeScript.

18. **Location:** `apps/api/skills/<id>/SKILL.md` (front matter `name`, `description`, `activation`,
    `command`, `references`; below it the instructions) and `references/*.md`. The stance is the
    skill `steuerberater` with `activation: always`; the advisor interview is `berater-interview`
    with `activation: user` and `command: grill-me`. `advisor-stance.ts` and the hand-written
    interview text are dropped.
19. **At build time, not at runtime:** `scripts/generate-skills.ts` writes
    `src/ki/skills.generated.ts` (not checked in). It runs on `install`, `build`,
    `typecheck` and `test`. Only the built module is shipped; at runtime the API reads
    no skill file. The drift test between skill and checked-in module is thereby dropped.
20. **The build fails if a skill is not right:** front matter missing or unreadable, `name`
    not equal to the folder, unknown `activation`, empty instructions, a reference without a file, not
    exactly one `always` skill, or the `user` skills and their commands deviate from
    `ADVISOR_SKILL_IDS`/`ADVISOR_SKILL_COMMANDS` in `packages/core`. The list there remains the
    typed source for API schema and UI.
21. **Coding agent and owl share the knowledge, not the instructions.** `.agents/skills/steuerberater/`
    keeps its own `SKILL.md` (Python script, web search) and reads `references/` via symlink
    from the owl's folder.

## Calculating instead of rough estimates (added 2026-11-13)

22. **New tools on the checked core.** `compare_filing_types` (Zusammenveranlagung (joint assessment) versus
    Einzelveranlagung (separate assessment), `filingTypeComparison`) and `check_capital_taxation` (Günstigerprüfung (most-favorable check)
    § 32d Abs. 6, `mostFavourableCheck`). If it is unknown whether there were wage replacement benefits, the result is
    `open` instead of a guessed recommendation.
23. **Progressionsvorbehalt (progression clause) exact.** `progressionClauseTax` in the core applies the special
    tax rate (§ 32b Abs. 2 EStG); `compute_income_tax` takes `wageReplacementEur`. The old
    instruction in the knowledge ("calculate twice") was wrong and has been replaced. How the Finanzamt rounds the
    rate is not backed by the statute; the core calculates it unrounded.
24. **Bug in the core fixed:** the Günstigerprüfung deducted the Sparer-Pauschbetrag (saver's lump-sum allowance) only on the
    Abgeltungsteuer (flat-rate withholding tax) side. § 20 Abs. 9 EStG applies to both sides; the personal rate
    therefore appeared too expensive, also in the screen „Kapital“ ("Capital").
25. **§ 35a and § 33 honest.** The fields for them exist, but the estimate does not count them
    as long as `HOUSEHOLD_AND_HEALTH_BOOSTERS` is off (#443 slice 5, paused: GdE and
    print mappings are missing). A draft there therefore shows „nicht berechenbar“ ("not calculable") instead of €0, and the
    savings plan asks about it if nothing has been entered.

## Deadlines, dates and checks (added 2026-11-13)

26. **Appeal deadline exact.** `appealDeadlineEnd` calculates from the notification: date of the Bescheid (tax assessment notice)
    plus four days (from 2025, previously three; § 122 Abs. 2 AO), a day on a weekend or public holiday
    moves to the next working day, then one month, the end moved the same way (§ 108 Abs. 3 AO).
    Without a federal state, only nationwide public holidays count, so that the deadline is never later than the
    real one. Previously: date of the Bescheid plus one month, i.e. up to a week too early.
27. **Dates.** The owl receives the fixed dates of the next 90 days
    (`upcomingTaxDates`: advance tax payments, loss certificate 15 Dec, payments by 31 Dec,
    filing deadlines), nothing assumed about the case.
28. **Savings levers with thresholds.** If the entered Werbungskosten (work-related expenses) are up to €300 below the
    lump sum, the savings plan asks about forgotten items; more than €600 above it, it suggests the
    wage tax allowance (§ 39a). Wage replacement benefits over €410 are named as a mandatory assessment.
29. **New tools.** `check_holding_period` (§ 23 EStG: deadlines to the day, own home,
    exemption limit €600/€1,000) and `check_rental_repairs` (15% limit, § 6 Abs. 1 Nr. 1a EStG).

## Gifts, self-employed, key figures (added 2026-11-13)

30. **New calculators in the core, as tools of the owl:** `compute_gift_tax` (ErbStG: class,
    allowances §§ 16, 17, rates with hardship equalization § 19 Abs. 3, ten years § 14; exemptions and
    valuation remain a follow-up question), `check_small_business` (§ 19 UStG, limits until 2024 and from 2025)
    and `estimate_trade_tax` (rough estimate GewStG with credit § 35 EStG, without capping at the
    proportional income tax). This drops the rough estimate for these topics.
31. **Key figures against the core.** `advisor-kennzahlen.test.ts` reads the skill's table and
    compares Soli exemption limits, Kindergeld, child and BEA allowance, single-parent relief amount,
    lump-sum allowances, Entfernungspauschale (distance allowance), home office, § 35a, other provident expenses and the filing deadlines
    2023–2026 with `getTaxYearParameters`. Today everything matches. Point 4 and "Rejected:
    skill table as the authoritative source of numbers" still apply: the core calculates, the test only finds
    deviations.
32. **Verified on 13 November 2026** (gesetze-im-internet.de): childcare 80%, at most €4,800
    (§ 10 Abs. 1 Nr. 5), Übungsleiter (coach/instructor allowance) €3,300 (§ 3 Nr. 26), volunteering €960 (§ 3 Nr. 26a),
    party donations at most €1,650/€3,300 (§ 34g). It remains open from which year § 34g applies at this
    level, and whether „in allen offenen Fällen“ ("in all open cases") (§ 52 Abs. 4 S. 10) also covers the amounts of § 3
    Nr. 26, 26a for earlier years.

## Laws change (added 2026-11-13)

33. **Guard.** `apps/api/scripts/check-law-changes.ts` reads every norm the skill cites
    or the source catalog names (102 today) from gesetze-im-internet.de and compares wording
    and footnotes with the fingerprint in `skills/steuerberater/law-watch.json`. Nightly in CI
    (`law-watch.yml`); on a change it opens an issue or adds to the open one. Skill and calculation core
    are adjusted by hand, then `laws:check --update`. A test fires when
    the skill cites a norm the guard does not know yet.
34. **The owl reads the wording.** `read_law_text` fetches a norm (or a paragraph, a
    number) from gesetze-im-internet.de: only this site, only the listed tax laws, the
    server builds the address. The text comes back as data with a notice, cached for one day,
    truncated to 4,000 characters, with the site's application notes. B3 makes reading
    mandatory when a norm carries the answer. This lifts point 2 ("no web") for this one
    source.
35. **Today is not the tax year.** The site only shows the current version. For an earlier
    year the owl says so; which version applies is governed by § 52 EStG and Art. 97 EGAO. Amounts
    of the tax return remain those of the app: if a law changes, the calculation core must follow first
    (point 33), otherwise the owl says something different from what the app calculates.
36. **Source catalog checked.** The nine summaries were read against the wording on 13 November 2026
    (`LEGAL_SOURCES_CHECKED_ON`); childcare now states 80%/€4,800. The
    legal-status date of the owl cards (`LEGAL_STATUS_DATE`, 01.01.2025) is separate from this and
    has not been re-checked.

## Advising itself instead of referring (added 2026-11-13)

37. **Decision of the Product Owner: the owl sends nobody to another advisor.** It also
    explains and calculates tax audits, business sales, inheritances with business assets, emigration, GmbH structuring
    and a dispute before the fiscal court itself (B8). It says openly where a lot of
    money or liability is at stake and what it cannot check (valuation, contracts, unseen
    documents); it names a notary as a step where the law requires one.
38. **Two exceptions remain.** Voluntary disclosure and tax criminal law: referral to a specialist lawyer for
    tax criminal law (B7), because a faulty voluntary disclosure loses immunity from prosecution. And still
    no binding legal information, no representation before the Finanzamt, the sentence „kein zugelassener
    Steuerberater“ ("not a licensed tax advisor") remains; the fixed rejection before it, however, no longer refers elsewhere but offers
    to explain the legal situation and to prepare the letter to the Finanzamt.
39. **Golden set.** The `stberg` cases now require the owl's own advice without referral (metric
    "advice instead of referral", D1 stays ≥ 95%); plus one case each for the two exceptions.

## Open points and risks

- **Not legally reviewed.** Commercial assistance in tax matters is reserved under the
  StBerG (Tax Advisory Act) to licensed persons. Point 5 and point 37 are decisions of the
  Product Owner from 12/13 November 2026; a legal review before sale is pending. Without
  referral in serious cases this weighs more heavily.
- For VAT and inheritance tax there is no calculator in the app. There the owl shows
  formula and steps and calls it a rough estimate; the answer check flags
  effect amounts that no tool calculated.
- The knowledge is as current as the skill; the build reads it in afresh every time.
- Not tested against a real model: whether the model reliably looks things up before it answers.
- The topic boundary has not yet been measured against the real model; the thresholds (90% / 5%) are
  starting values. The checker costs a small call per typed message and about 0.3–1 s until
  the first word.
- With tricks in the message, the checker can also be fooled. Then the rule in the prompt remains.
- `read_law_text` depends on a third-party site: if it changes its structure, tool and guard fail (the guard reports „nicht erreichbar“ ("not reachable")). Whether the model really reads before every load-bearing norm has not yet been measured against the real model.

## Rejected

- **All knowledge fixed in the prompt:** around 40 KB per answer, slower, more expensive.
- **Running the Python script on the server:** a second calculation path alongside the checked core.
- **Topic boundary only via word list or only in the prompt:** word lists have gaps and reject
  honest questions; a rule only in the prompt can be talked away.
- **Checker in parallel with the main model:** faster, but every rejection also pays for the large call. With ADR-0100, after measurement, decided this way after all (1.3 to 3 s per answer).
- **Skill table as the authoritative source of numbers:** two sources that can drift apart.
