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
| **Musti** | Lead Developer / Architect — grilling, local review, ADRs, arc42 | `Musti <musti@steuereule-crew.example>` |
| **Kaan** | Frontend Developer — Expo/RN-Web, the Funke design system, i18n | `Kaan <kaan@steuereule-crew.example>` |
| **Robin** | Backend Developer — NestJS/Fastify/Prisma, the deterministic core | `Robin <robin@steuereule-crew.example>` |
| **Salih** | DevOps / Quality-Platform — the preview, the CI gates & their realism | `Salih <salih@steuereule-crew.example>` |

The human orchestrator (NexusHero) sets direction, makes the strategic/stakeholder calls, and is the
final merge gate on GitHub. The crew does the implementation, review, and testing under that direction.

## Former members

The crew has been trimmed twice, on evidence rather than instinct.

**ADR-0015** retired the second developer on each side: the review and test lanes, not authoring
capacity, were the bottleneck, so the extra tracks cost far more than they returned. **ADR-0016**
retired the two coordination seats, after a full working session in which the two *gates* (review and
test) each caught defects nothing else did, while the two coordination roles were never invoked at all
— their work being routing of information already written down.

Their entries stay here because **`Co-authored-by:` trailers and in-code decision records naming them
remain in the repository**, and a name nobody can resolve is worse than no name at all.

| Persona | Role while active | Co-author identity | Left |
|---------|-------------------|--------------------|------|
| **Matthias** | Product Owner — held the Requirements Register and the acceptance criteria, and ruled on product copy (e.g. the login wording on issue #65, still recorded in the code) | `Matthias <matthias@steuereule-crew.example>` | ADR-0016 |
| **Suhay** | Scrum Master — backlog, readiness, ceremonies, the WIP limit, findings→tickets | `Suhay <suhay@steuereule-crew.example>` | ADR-0016 |
| **Enis** | Backend Developer (full-stack) — second BE track; senior. Authored `DELETE /v1/account` (REQ-011 BE-B) and found two real defects while building it | `Enis <enis@steuereule-crew.example>` | ADR-0015 |
| **Ogün** | Frontend Developer — second FE track. Never dispatched a slice; the queue never drained far enough to reach him, which is part of why the seat was cut | `Ogün <ogun@steuereule-crew.example>` | ADR-0015 |
