# ADR-0058 — LStB text fallback: allowlist, evidence check, never green

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/lstb-parser.ts`, `apps/api/src/lstb-scan/`
- **Supplements:** ADR-0051 (owl mode, document isolation §5), ticket #444 (guiding decision 2)

## Context

#444 originally planned purely deterministic LStB (Lohnsteuerbescheinigung, wage tax
certificate) parsing. Scanned or poorly typeset certificates, however, leave fields open for the
parser. A text fallback via the language model can help there. The review of PR #448 found three
gaps in it:

1. Values from the model could turn **green** and **overwrite** deterministically green values.
   That made AC 4 („niemals ein falscher grüner Wert“, "never a wrong green value") impossible to hold.
2. Invented amounts (not in the text) were accepted.
3. The redaction worked with a **blocklist** over the whole document text. A name and
   address block without a label, or an employer without a legal-form suffix, went to the provider.

## Decision

The text fallback stays, but only under these rules:

1. **Allowlist instead of blocklist.** `selectLstbRelevantLines()` lets through only lines 3, 4, 23a/b,
   25, 26 and 27 (plus a pure amount continuation line) and a synthetic year line.
   Everything else does not leave the server. Redaction (`scrubDocumentTextPii`) and
   `checkPiiFree` then run as the second and third lines of defense. If
   `checkPiiFree` triggers, the call is skipped (`securityBlocked: true`).
2. **Evidence check.** A proposed amount only counts if it appears verbatim in exactly the text
   the model saw. Otherwise it is discarded.
3. **Only fill gaps.** The fallback fills only fields that the deterministic
   parser left empty. It never overwrites a value that was read and cannot supply a tax year.
4. **Never green.** Every field filled by the fallback is `pruefen` with reason `llm_suggested` and
   must be confirmed individually by the user. Deterministic fields are never upgraded. They
   are only downgraded if the merged values contradict each other (shared
   plausibility rule).
5. **Traceable.** Every external call creates an audit entry
   `ki_lstb_textfallback` (without content).

## Consequences

- AC 4 is secured by core tests (`lstb-text-fallback.test.ts`): invented values,
  overwriting and green fallback fields are ruled out.
- The benefit of the fallback is deliberately narrow. It helps when a line was recognized but its
  amount was not reliably assigned by the parser. Whatever is not in the permitted text stays open and
  is entered by hand.
- Without an unlocked AI slot, or with the kill switch active, the scan runs purely deterministically.
