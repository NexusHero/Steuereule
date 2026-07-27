# Contributors

SteuerEule is built by a **role-based crew of AI agents**, orchestrated by **NexusHero** (the human
behind the project). Every "team member" listed below is an **AI persona** — a defined agent with a
role, a toolset, and boundaries — **not a separate human being**. This is stated plainly and on
purpose: the interesting thing about this repository isn't that many people built it, it's that an
**orchestrated AI crew** did — running a genuine, disciplined engineering process (design grilling,
ADRs, tests-first, a local review **and** test gate before every PR, and a hard honesty invariant).

Full, per-role definitions live in [`.claude/agents/`](.claude/agents/); the process the crew runs is
in [`docs/process/`](docs/process/).

## How authorship works here

Commits carry a **`Co-authored-by:`** trailer crediting the crew persona whose role produced the work,
so the history honestly reflects *which part of the crew did what*. To keep it transparent rather than
misleading:

- The commit **author** is always the human, **NexusHero &lt;suhay.sevinc@gmail.com&gt;**.
- The **co-author** is the AI persona, on the reserved, guaranteed-non-real **`.example`** domain — so
  no trailer can ever be mistaken for a real person's contact or linked to a real account.
- These personas are documented (here and in `.claude/agents/`), so anyone reading the log can see at a
  glance that "Kaan", "Robin" and the rest are AI crew roles, not undisclosed humans.

## The crew

| Persona | Role | Co-author identity |
|---------|------|--------------------|
| **Suhay** | Scrum Master — backlog, readiness, ceremonies, WIP & findings→tickets | `Suhay <suhay@steuereule-crew.example>` |
| **Matthias** | Product Owner — requirements, acceptance, outward presentation | `Matthias <matthias@steuereule-crew.example>` |
| **Musti** | Lead Developer / Architect — grilling, local review, ADRs, arc42 | `Musti <musti@steuereule-crew.example>` |
| **Kaan** | Frontend Developer — Expo/RN-Web, the Funke design system, i18n | `Kaan <kaan@steuereule-crew.example>` |
| **Robin** | Backend Developer — NestJS/Fastify/Prisma, the deterministic core | `Robin <robin@steuereule-crew.example>` |
| **Salih** | DevOps / Quality-Platform — the preview, the CI gates & their realism | `Salih <salih@steuereule-crew.example>` |

The human orchestrator (NexusHero) sets direction, makes the strategic/stakeholder calls, and is the
final merge gate on GitHub. The crew does the implementation, review, and testing under that direction.

## Former members

The crew briefly ran with a second developer on each side. Both were retired in **ADR-0015** — the
review and test lanes, not authoring capacity, were the real bottleneck, so the extra tracks cost far
more than they returned. Their entries stay here because **`Co-authored-by:` trailers naming them
remain in the merged history**, and a trailer nobody can resolve is worse than no trailer at all.

| Persona | Role while active | Co-author identity | Left |
|---------|-------------------|--------------------|------|
| **Enis** | Backend Developer (full-stack) — second BE track; senior. Authored `DELETE /v1/account` (REQ-011 BE-B) and found two real defects while building it | `Enis <enis@steuereule-crew.example>` | ADR-0015 |
| **Ogün** | Frontend Developer — second FE track. Never dispatched a slice; the queue never drained far enough to reach him, which is part of why the seat was cut | `Ogün <ogun@steuereule-crew.example>` | ADR-0015 |
