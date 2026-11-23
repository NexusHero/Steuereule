# ADR-0071 — Owl: tax years as projects in the sidebar, conversations answer concurrently

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** Ticket #503; `apps/api/src/advisor/{advisor.service,advisor-shared,advisor.repository}.ts`, `apps/mobile-web/src/screens/advisor/{CopilotBridgeProvider,OwlModeScreen}.tsx`, `apps/mobile-web/src/screens/advisor/chat/ConversationList.tsx`
- **Amends:** ADR-0067 § 2 ("Only one conversation answers at a time … Parallel work was deliberately not built")

## Context

Since ADR-0067 the tax year is the project, but the sidebar only showed the conversations of the
one open year, and switching was locked during an answer. The Product Owner wants
the behavior known from Claude: projects with their conversations below one another, and conversations
that answer side by side.

## Decision

1. **The sidebar shows all tax years as projects.** At the top the open year with its
   conversations (rename, delete, search as before), below it every further year that has conversations,
   collapsed. The session delivers `projects` for this.
2. **A conversation of another year opens that year for the whole app.** Case overview,
   drafts and notes belong to the year; a conversation from 2024 next to the numbers of 2026 would be
   wrong. If the year changes elsewhere in the app, the owl shows the most recently used
   conversation of the new year.
3. **Conversations answer concurrently.** The client keeps the state of an answer per conversation
   (text, thoughts, plan, error, abort). Switching is never locked; stop affects the open
   conversation. The server had already kept runs separate from one another.
4. **A conversation has one answer at a time.** The server rejects a second question in a conversation that is currently
   answering (`ADVISOR_CONVERSATION_BUSY`). An answer that has been stored as "running" for longer than five
   minutes is considered orphaned and does not lock.
5. **Who is answering is visible.** The list shows „antwortet gerade …“ ("answering …"), from the state of the
   device and from the server (`answering`), so also for an answer from another device. A
   conversation that is answering cannot be deleted.

6. **The chat is the stage, the edges are quiet.** The lines between list, chat and workbench
   can be dragged (width remembered per device, arrow keys work too); the chat always keeps
   at least 380 px. List and workbench no longer carry primary buttons: „Neues Gespräch“ ("New conversation"),
   „Änderung übernehmen“ ("Apply change") and „Zurück zum Cockpit“ ("Back to the cockpit") are quiet buttons, the workbench has no
   colored border. The one prominent button per draft stays in the answer in the chat.
7. **Applying from the workbench stays in the conversation.** Previously the app then jumped to the cockpit;
   the cockpit now shows the result when the user goes there themselves.

## Consequences

- Concurrent answers are concurrent model calls. The daily quota still counts per
  user.
- Two conversations can suggest the same value; "replaced by newer draft" applies as
  before across conversations. With Turbo the first one to finish writes; the second fails
  the check against intermediate changes and remains a draft.
- After a reload the device reattaches to the answer of the open conversation; the
  others keep running on the server and are caught up on opening.

## Rejected

- **Reading conversations of other years without switching the year:** see 2.
- **Several answers in the same conversation:** the order in the history would be random.
- **Freely creatable projects:** remains rejected as in ADR-0067.
