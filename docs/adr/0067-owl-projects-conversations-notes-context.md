# ADR-0067 — Owl: tax year as a project, several conversations, project notes, context with summary

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #481; `apps/api/src/advisor/`, `apps/api/src/ki/{langgraph-advisor.engine,ai-runtime-config.service,chat-model.factory}.ts`, `packages/core/src/interview/{advisor-history,advisor-notes,ki-port}.ts`, `apps/mobile-web/src/screens/advisor/`
- **Supplements:** ADR-0038 (AI port, zero-write), ADR-0064 (answer runs), ADR-0066 (field catalog, checked answer)
- **Number:** 0065 is taken by a parallel branch (address search).

## Context

The owl held exactly one conversation per tax year. The history grew with every topic, answers
became slower and less precise, and the older part silently dropped away for the model. It took
around twelve seconds until the first word, during which the user saw nothing. The model for the solution is
projects with several sessions: a shared state of knowledge, and beneath it any number of separate
contexts.

The decisions come from the grilling session with the Product Owner on 12 November 2026.

## Decision

### 1. The tax year is the project

Nobody creates a project. With the tax return of a year come the project and its first
conversation. What all conversations of a year share:

- the state of the tax return (the case overview goes into every answer as before),
- the project notes (§ 3),
- the drafts: they belong to the tax return, not to the conversation. A draft from conversation A can
  be applied while conversation B is open, and "replaced by newer draft" applies across
  conversations.

### 2. Several conversations, each with its own context

A conversation is a separate context: the model sees only its history.

- Without a selection, the most recently used conversation opens.
- „Neues Gespräch“ ("New conversation") reuses one that is still empty; empty ones do not pile up.
- The title is derived from the first question (without names and identifiers, at most 60 characters),
  without a model call. Renaming is possible.
- At most 50 conversations per year. The daily quota counts per user, not per conversation.
- Conversations and notes are private per user, also with Zusammenveranlagung (joint assessment).
- Quick starts run in the open conversation.
- The existing history of a year becomes the first conversation in the migration.
- ~~Only one conversation answers at a time; during an answer, switching is
  locked.~~ Since ADR-0071 conversations answer concurrently; a conversation still has only one
  answer at a time.

A search finds text in the titles and messages of all conversations of the year; upper and
lower case and umlauts do not matter. The messages are stored encrypted in the
database, so the server searches over the decrypted text of the one user and year
(at most 50 conversations) instead of in the database.

On wide screens, the list sits in a sidebar to the left of the chat. It starts open
and remembers when it was collapsed. ~~On narrow screens the same content opens as a
sheet.~~ Since section 10, it opens below 1280 px as a drawer from the left, and the search is a
dialog.

### 3. Project notes: the owl writes here itself

What was clarified in a conversation but is not a value of the tax return („Arbeitszimmer geprüft:
lohnt sich nicht, weil kein eigener Raum“ ("Home office room checked: not worth it, because no separate room")), the owl records as a note on the tax year. Every
conversation of the year reads the notes.

**The owl creates, replaces and removes notes without a click.** This is a deliberate exception
to the principle from ADR-0038 that the owl writes nothing itself. It applies to notes and only to
notes: the tax return still only changes when the user applies a draft.

What makes the exception acceptable:

- Every change appears under the answer („Gemerkt: …“ ("Noted: …"), „Notiz aktualisiert: …“ ("Note updated: …"), „Notiz entfernt:
  …“ ("Note removed: …")) with „Rückgängig“ ("Undo"). Undo restores the previous text or the removed note.
- All notes are visible (since section 10 behind the situation chip in the input field); the user can change or delete any of them and add their own.
- At most 20 notes per year with 200 characters each, one line, no personal data
  (checked when the model creates them and on saving).
- The model knows notes only under neutral names („Notiz 2“ ("Note 2")), never under their identifier.
- Notes apply per tax year and do not carry over into the next year.

### 4. The context of a conversation is visible and is summarized when it is full

The model reads the most recent turns of a conversation verbatim, up to a budget of 6,000
estimated tokens. A small ring in the input field shows how full this context is; from 80%
it changes color.

- **Full:** Before the next answer, the owl summarizes the older part and says so in the chat.
  The most recent turns (a quarter of the budget, at least the last question with its answer) stay
  verbatim.
- **On request:** A tap on the ring shows the fill level and offers „Jetzt zusammenfassen“ ("Summarize now").
- **The user keeps everything:** All messages remain readable. A divider „Älterer Verlauf
  zusammengefasst“ ("Older history summarized") marks the spot; the summary can be expanded there.
- The model writes the summary in a plain call without tools, with the
  instruction not to invent anything and to continue an earlier summary. If no
  model answers, it is produced without a model from the questions and the fate of the suggestions. A full
  conversation therefore never blocks.

### 5. Reasoning visible, medium thinking level

The reasoning (the provider's thinking summary) is on by default: a wait that
one can watch is a shorter wait. The thinking level for Gemini is `medium`.

Measured against Gemini (`scripts/ai-eval/latency-check.ts`), time to the first word of the answer:

| Thinking level | first sign of life | first word |
| --- | --- | --- |
| low | 2 to 3 s | 3 to 6 s |
| **medium (default)** | 3 to 4 s | 6 to 9 s |
| model chooses | 3 to 4 s | 10 to 13 s |
| high | 3 to 4 s | 13 to 20 s |

Medium is the Product Owner's decision: thoroughness over the last few seconds.
`AI_ADVISOR_THINKING_LEVEL` and `AI_ADVISOR_REASONING=off` change it.

### 6. Around the input field there is only the field

The banner with the dictation tip has been removed. The microphone icon still appears where
dictation is possible on the device (ADR-0061).

### 7. When the language model does not answer, the owl says why

A provider error is not a silent switch to the built-in rules and not a bare "aborted".
The API maps it to a reason (key or model rejected, quota, overloaded,
timeout, connection, blocked, unknown) and attaches it as `meta.modelFailure` to the
answer. The UI shows a notice beneath it with the reason, that the answer comes from fixed rules,
and the technical detail "provider · HTTP status". The provider's message texts do not leave the
server. „Noch einmal versuchen“ ("Try again") only appears where retrying can help; a rejected
key is presented to the user as the operator's matter. The notice is in the stored
answer and remains after reloading. If the stream breaks off in the middle of the answer, the
error also names the reason.

### 8. Turbo: the owl applies by itself and shows it

A switch „Turbo“ at the input field (off in every new session, #491). Off, everything stays as in
ADR-0038: the owl prepares drafts and waits for the click. On, the server applies the
open drafts of an answer as soon as it is finished and stored, in one step, exactly like
„Alle übernehmen“ ("Apply all"): with a check against intermediate changes, origin „Assistent: SteuerEule“,
audit trail and undo.

- The cards remain visible, now as „Übernommen“ ("Applied") with old and new value; above them a
  line says how many changes the owl has applied (`meta.turbo`).
- What does not fit (field changed in the meantime, conflict, rejected value) is not forced:
  all drafts stay open. „Zwei Wege“ ("Two ways") always waits for a choice.
- This is the second deliberate exception to zero-write, this time at the user's request per message.

### 9. If the model fails, a second one answers (#493)

Every provider client retries short errors (429, 503, dropped connection) twice with a wait.
If the call still fails before the first word has arrived, the owl asks the model of the slot
`fallback` (`AI_FALLBACK_PROVIDER`, `_MODEL`, `_API_KEY`), once, with its own time limit. The
reasoning then says: „Gemini antwortet nicht. Die Eule fragt Claude …“ ("Gemini is not answering. The owl is asking Claude …"). The result names the
model that answered and the error of the first one (`primaryFailure`), which the connection indicator
counts. No second model configured, or the same model with the same key, or a
blocked question: the fixed rules answer as before, with the reason. There is no switch in the middle of an answer;
there the abort stays honestly visible.

### 10. Chat first (addendum 13 November 2026)

Next to the sidebar, explanatory texts and search field, the chat received too little attention. The screen
now follows the layout users know from Claude:

- **Sidebar only for conversations:** „Neues Gespräch“, „Suchen“ ("Search") with a magnifier, „Steuerjahr 2026 ▾“ ("Tax year 2026 ▾")
  and one row per conversation. Rename and delete sit behind the row's "…". No
  explanatory texts. The other years are in the tax year menu; another year opens with
  its most recently used conversation. Width still draggable, default 260 px.
- **Search as a dialog** behind the magnifier and with Cmd/Ctrl+K, via the same server search.
- **Below 1280 px** the conversations open as a drawer from the left via the icon at the top left.
- **Situation and notes** are no longer in the sidebar, but behind a chip in the
  input field („Situation: …“, empty „Situation ergänzen“ ("Add situation")). It opens „Was die Eule über euch weiß“ ("What the owl knows about you")
  with the situation and the notes of the year.
- **Header:** privacy, hints (with a number when hints or drafts are waiting) and
  settings are icons. The legal status appears as one line under the chat.
- **Empty chat:** question and input field in the middle, beneath them four quick starts; the rest
  are expanded by „Mehr …“ ("More …").
- **Reasoning as in Claude:** a line „Nachgedacht · 8 s · 4 Schritte“ ("Thought · 8 s · 4 steps"), expandable to
  the steps with icon and result, beneath it the thinking summary. While the owl is
  working: „Denkt nach · 4 s“ ("Thinking · 4 s") with the current step, also expandable. The steps
  are stored in structured form (`meta.thoughtSteps`: kind, tool, label, result); older
  answers with plain text lines (`meta.steps`) are still shown by the app. The result of a tool
  comes as its own event `tool_result` and is built on the server from a fixed template per
  tool, only from numbers, amounts and catalog titles: never from text of the model or the
  user, never with the reason for a rejection. The duration (`durationMs`) was already stored and
  now goes to the app with the finished answer; costs and tokens stay with operations.

### 11. The owl opens the conversation (addendum 13 November 2026)

A new conversation no longer starts empty if the app already knows something about the year. The owl
speaks first, with the tax advisor skill and the case overview it receives in every turn anyway.
The overview now covers everything the interview and the screens know
(`furtherFacts`: pension, rental income totals, capital with withheld tax, side job,
wage replacement, severance, medical costs, household-related services, deadlines), still only amounts and
counts, never names, addresses or identifiers.

- **Stage without a model:** The calculation core determines the stage before every model call.
  - `empty`: nothing recorded. No opening; the chat offers „Lass uns anfangen“ ("Let's get started"), which starts the advisor interview.
  - `partial`: something recorded, but no income with an amount or no detail on the assessment type. The owl briefly says what it knows and asks about the gaps as a question round with tappable answers.
  - `ready`: at least one income with an amount and the assessment type. The owl analyzes freely.
- **Only when something has changed:** A fingerprint (FNV-1a) from the case overview, the user's own
  description and notes is attached to every opening. If it matches that of the last opening of the
  year, the new conversation stays empty and links „Letzte Analyse vom … ansehen“ ("View last analysis from …").
- **Numbers from the calculation core:** Before the model call, the app computes the key figures of the opening
  (result range of the estimate, distance and home office allowance from the recorded days,
  Werbungskosten (work-related expenses) against the Arbeitnehmer-Pauschbetrag (employee lump-sum allowance)). They are in the prompt as the only
  amounts the owl may name; any further one it must compute with `compute_income_tax` or
  `simulate_tax_delta`. The answer check counts the key figures as computed.
- **The check blocks:** The opening is held back until it has been checked. If it names an
  amount the app has not computed, it is rewritten once, with these amounts named as
  wrong. Only a second miss appears, then with the usual notice.
- **No drafts:** An opening never creates drafts, not even with Turbo. Drafts
  arise from the user's answer to the question round.
- An opened conversation is called „Einschätzung 2026“ ("Assessment 2026") (with the tax year) until the user renames it.
- Technically, the opening is a turn with `quickAction: 'opening'`. The question behind it is a
  placeholder the chat does not show (`meta.opening` on both messages); without a language model
  there is no opening.

The results of the tools in the reasoning no longer repeat their label („Schlage im
Steuerwissen nach: Kennzahlen je Steuerjahr“ ("Looking up tax knowledge: key figures per tax year") instead of „…: Gefunden: …“ ("…: Found: …")), and the thinking summary
appears as headings and paragraphs instead of raw Markdown; the owl is asked to think in
German.

## Consequences

- Deleting a conversation removes its messages and the drafts still open in it;
  applied values remain.
- A summary costs one model call as soon as a conversation reaches its budget.
- The summary is the model's only memory of the older part. What it
  leaves out, the owl no longer knows in this conversation; the tax return and the notes catch the
  essentials.
- Notes without a click means: the owl can also forget something the user wanted to keep.
  This is caught by the notice with "Undo" and the list in the sidebar.
- Data export and account deletion cover conversations and notes.

## Rejected

- **Freely creatable projects, custom instructions per project, file uploads into the project:** bring
  tax users nothing; documents already exist.
- **Notes only after confirmation:** The Product Owner decided in favor of autonomous writing,
  with undo as a safeguard.
- **Title worded by the model:** costs a call per conversation and arrives delayed.
- **Parallel work in several conversations:** no discernible need.
- **Notes across all years:** outdated statements would carry over into new years.
