# Skills der Eule

Jeder Ordner ist ein Skill: `SKILL.md` (Frontmatter + Anweisungen) und optional `references/*.md`
(Wissen, das die Eule mit `lookup_tax_knowledge` nachschlägt). Der Text wird beim Bauen wörtlich
eingelesen (`pnpm --filter @steuereule/api run skills:generate`, läuft auch bei `install`, `build`,
`typecheck` und `test`) und landet in `src/ki/skills.generated.ts`. Zur Laufzeit wird nichts
nachgeladen, und kein Skill-Text steht von Hand in TypeScript.

Frontmatter:

| Feld | Bedeutung |
| :--- | :--- |
| `name` | ID des Skills, gleich dem Ordnernamen und einem Eintrag in `ADVISOR_SKILL_IDS` (core), außer bei `activation: always` |
| `description` | Ein Satz, wofür der Skill da ist |
| `activation` | `always`: steht im festen Teil jedes Prompts. `user`: der Nutzer schaltet ihn ein |
| `command` | Slash-Befehl im Chat (nur `user`), muss in `ADVISOR_SKILL_COMMANDS` stehen |
| `references` | Welche Dateien aus `references/` die Eule nachschlagen darf, in dieser Reihenfolge |

`references/quellen.md` gehört nur zum Coding-Agenten (`.agents/skills/steuerberater`, der per
Symlink dieselben Referenzen liest): Die Eule hat kein Netz. Neue Skills sind eine Codeänderung
mit Review (ADR-0068); Texte von Nutzern oder aus dem Admin-Panel gibt es nicht.
