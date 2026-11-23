# User test: old ↔ new navigation (#450 part 2B, D12)

Goal: find out whether the new navigation (#443, hub cockpit) actually gets people through the tax return faster and more reliably than the old tunnel. The automated measurement (part 2A) counts clicks; this test measures time, errors and the points at which someone does not know how to continue.

The participants are German-speaking. Text that is read aloud or handed to participants stays in German in these materials, with an English translation next to or below it.

| File | Purpose |
| :--- | :--- |
| [session-log.md](session-log.md) | Flow of each session, role of the facilitator, template for the notes |
| [tasks.md](tasks.md) | The four tasks with test data and success criterion |
| [sus-questionnaire.md](sus-questionnaire.md) | System Usability Scale (10 questions) with scoring |
| [evaluation.md](evaluation.md) | Table for the results and the report |

## Setup

- **10 people**, 5 per variant (**between-subjects**: each person sees only one variant, so that they do not learn from the first).
  - **Old:** tag `baseline/pre-443` (commit `1990ed3`), the state before #443.
  - **New:** current `main`.
- Same tasks, same test data, same order, same device (laptop, Chrome, 1280 px).
- Duration per session about 40 minutes: 5 welcome, 25 tasks, 5 SUS, 5 debrief.
- Recruitment by the product owner. Mix per variant as equal as possible: at least 2 people who have so far done their tax return themselves, at least 1 person over 55, at most 1 person from the team or with knowledge of the app.

## Data protection

- Only **synthetic test data** from [tasks.md](tasks.md). Participants never enter their own data.
- Test accounts are created beforehand and deleted afterwards.
- No video or audio recording without written consent. Without consent: only notes and a stopwatch.
- The results use codes (A1–A5, N1–N5), no names.

## Preparation (once per variant)

1. Start the stack (see `e2e/harness/README.md`); for **Old**, first run `git worktree add ../steuereule-alt baseline/pre-443`.
2. Create a fresh, confirmed account per person (email `nutzertest-<kürzel>@beispiel.de`), still without any details.
3. Browser: new profile, no autofill, zoom 100 %, window 1280 × 800.
4. Stopwatch, printed task cards, printed SUS form, note template from [session-log.md](session-log.md).
