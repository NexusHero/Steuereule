# ADR-0089 — The stream: one selection instead of yes/no pages, one page per topic

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/interview/{interview,strom}.ts`, `apps/api/src/interview/interview.service.ts`, `apps/mobile-web/src/screens/strom/`, `apps/mobile-web/src/screens/cockpit/CockpitScreen.tsx`, `apps/mobile-web/src/navigation/{routes,linking,CockpitStack}.ts(x)`, `e2e/scenarios/`
- **Builds on:** ADR-0031 (catalog engine), ADR-0045 (value-first), ADR-0066 (the owl's field catalog), ADR-0088 (Person B)

## Context

The engine asked each question on a page of its own. Measured with the efficiency meter:

| Case | Pages | of which "No" |
| --- | --- | --- |
| Lena (single, employed) | 17 | 13 |
| Richter (single parent) | 21 | 13 |
| Sommer (Grenzgänger family, without B) | 27 | 10 |

On top of that came the ways back: after each topic it went to the cockpit and from there to the next topic.

The goal is not an "Elster 2.0", but a path that gets the user to the goal considerably faster. The chat with the owl stays available with all its capabilities.

## Decision

The stream is the default path through the tax return. „Weiter“ ("Continue") in the cockpit always leads to its next open point. The steps:

1. **Base:** one page with what branches: work, Switzerland, children, marital status and, for married users, what the partner does. Hints such as trade business or other foreign countries are on the page itself.
2. **Documents first:** the forms of the path, i.e. LStB, Swiss Lohnausweis (salary certificate) or pension, then commute and children. They run as steps of their own; nothing is rebuilt. Their „Weiter“ leads to the next step instead of the cockpit.
   A Grenzgänger (cross-border commuter) with a job change during the year additionally gets the
   German LStB after the commute. The change is recognizable by the end of the first commute or by
   the second commute (ADR-0079) or by an already entered LStB. Found in the 2024 real case: there
   the LStB was missing in the stream.
3. **Selection** „Was trifft {Jahr} auf dich zu?“ ("What applies to you in {year}?"): all topics on one page, grouped by work, housing, provision, health and other. Rare topics (severance pay, capital/rental income, advance tax payments) are behind „Mehr anzeigen“ ("Show more"). Topics with a type (side job, income) ask for the type directly on tap. Anything not selected is answered with "No" and never asked again.
4. **One page per selected topic** with all amounts of the topic, for example health insurance, long-term care insurance and optional benefits together. Below it says which form the amount goes into. „Später“ ("Later") marks amounts that may wait; the topic then stays open. After that comes single parent, where it applies.
5. **Summary:** the refund, the applied items with their measured effect in euros, the open items to tap, then „Abgabe vorbereiten“ ("Prepare filing").

Each step has its own address: `/app/steuerjahr/:jahr/strom/:schritt`. If the base is still open,
every later step leads to the base page.

The following rules belong to this:

- **No new field.** The selection is only a view on the existing yes/no answers of the catalogs. Owl, printout, estimate and field catalog (ADR-0066) read and write the same fields as before. What the owl enters in the chat is already selected and filled in the stream.
- **Order-free catalogs.** Lebenslagen, Sonderausgaben, segment 2 and Alleinerziehend have `orderFree`: their questions are reachable individually, a follow-up amount still only after its "Yes". The base stays ordered.
- **Further training** is allowed as a single question from segment 2 (`fortbildung`, `fortbildung-kosten`). The rest of segment 2 stays locked.
- **Deselecting** a topic with an amount asks first. The amount stays stored in case the topic is selected again.
- **Changing later:** an open item in the summary opens only its one page.
- **Catalogs remain** reachable as „Alles ansehen“ ("View all") via the cockpit tiles, unchanged.
- **Effect:** only what a page changed in the estimate is measured, after saving. There is no live estimate per keystroke; before saving, the page therefore names only the form line.

## Consequences

- **Shorter path:** Lena manages with base, LStB, commute, selection, donations and summary, i.e. 5 steps plus summary instead of 17 question pages. The efficiency meter reports the numbers and aborts nothing.
- **E2E:** the scenarios walk the stream. Where a scenario checks a catalog itself, it uses the tile.
- **Open, separate PRs:**
  - Person B in the stream: „Was trifft auf ‹Name› zu?“ ("What applies to ‹name›?"); until then „Für wen?“ ("For whom?") stays in the catalogs.
  - Documents prefill the selection.
  - The previous year prefills the selection („Hat sich etwas geändert?“ ("Has anything changed?")).

## Addendum 18.11.2026: Person B and German employment in the stream

The manual real-data test (Grenzgänger married couple, 2024 with a change from Germany to Switzerland) showed two gaps: after „Arbeitet dein Partner auch in der Schweiz?“ ("Does your partner also work in Switzerland?") the stream never asked for the partner's documents, and the German Lohnsteuerbescheinigung (wage tax certificate) only entered the stream via a job change in the commute. After the stream there was therefore a refund of €27,688 instead of an additional payment of €3,797.90.

- **German employment in the base:** after „Ja, in die Schweiz“ ("Yes, to Switzerland") the base asks „Warst du im Jahr auch in Deutschland angestellt?“ ("Were you also employed in Germany during the year?") (`de-job`), likewise for a Grenzgänger partner (`partner-de-job`). It does not ask pensioners (new condition `askedWhen` on the question). "Also in Germany" sets the same signal as the job change (ADR-0079): LStB step in the stream, LStB tile open and mandatory.
- **Partner step:** in a Zusammenveranlagung (joint assessment) without B's own account, the base is followed by „Wer ist dein Partner?“ ("Who is your partner?") with first name and date of birth. The rest of B stays in „Angaben für die Erklärung“ ("Details for the tax return").
- **B's forms** come after one's own and before the children, depending on the base: Grenzgänger Lohnausweis and commute (plus LStB for German employment), employee in Germany LStB and commute, pensioner the pension. Addresses: `partner-schweiz`, `partner-arbeitsweg`, `partner-lohnsteuerbescheinigung`, `partner-rente`. The forms call B by name.
- **Progress** counts these steps too. Existing accounts honestly see them as open; anything already entered counts as done immediately. This settles the open point "Person B in the stream" above for forms; „Was trifft auf ‹Name› zu?“ for the topics stays open.
