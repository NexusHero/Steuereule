# ADR-0074 — Reading documents: Swiss Lohnausweis and scanned Lohnsteuerbescheinigung

- **Status:** Accepted
- **Date:** 2026-11-13
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/{ch-salary-certificate-parser,lstb-parser,document-kind}.ts`, `apps/api/src/ch-certificate-scan/`, `apps/api/src/advisor/advisor.service.ts` (`stageDocumentDrafts`, `householdNames`), `apps/api/src/receipt/{receipt-parse.service,dto/parse-receipt.dto}.ts`, `apps/api/src/lstb/lstb.service.ts`, `apps/api/src/lstb-scan/`, `apps/mobile-web/src/lib/receipts/captureReceipt.ts`, `apps/mobile-web/src/screens/advisor/{CopilotBridgeProvider,AdvisorChatPanel}.tsx`, `apps/mobile-web/src/screens/lstb/scan/`
- **Builds on:** ADR-0058 (allowlist before the model), ADR-0060 (OCR never green), ADR-0072 (N-Gre), ADR-0073 (drafts for Person B)

## Context

In the real-case test (married couple, both Grenzgänger (cross-border commuters) to CH) the app read
neither of the two Swiss Lohnausweise (Swiss salary certificates): the general document recognition
creates at most one field, and only health insurance, Krankentaggeld (sickness daily allowance) or
pillar 3a. A document always ended up with the person who uploaded it. Scanned German
Lohnsteuerbescheinigungen (wage tax certificates) (two columns, OCR) were read only partly by the
fixed part: text from the left column stood before the line number, umlauts were missing, „für“
came out as „fur“. A second certificate in the same year (second employer, later payment) could
only replace the first.

## Decision

1. **A dedicated reader for the Lohnausweis (Form 11).** A fixed rule in the core reads the header
   (year, period, fields F and G), items 1–14 and 10.1/10.2. It checks itself with the form's
   totals: item 8 = 1 to 7, item 11 = 8 − 9 − 10. Figures that break a total are
   „prüfen“ ("check"). If OCR splits a number apart („1 1 1 839“), the value the total requires
   applies only if exactly its digits are on the line.
2. **The model sees only items 1–12.** Header (name, address, AHV number, date of birth), remarks
   and employer never leave the server. The model fills only empty items, only with amounts that
   appear verbatim in the text shown, and never as „gelesen“ ("read").
3. **The name on it says whose certificate it is.** A person's first and last name (umlauts also as
   "ue") must both appear on the certificate. If the name matches neither or both persons, the app
   asks „Wessen Lohnausweis ist das?“ ("Whose salary certificate is this?") and reads only with the
   answer; the document is not uploaded a second time for this. If Person B has their own account,
   nothing is prepared.
4. **Drafts instead of writes.** The items become owl drafts for the Lohnausweis form of the
   correct person (`stageDocumentDrafts`, Person B via ADR-0073). Only „Übernehmen“ ("Apply")
   writes. Negative items (such as a correction in item 7) are not applied, because the form does
   not support any; item 8 already contains them. The employer address is left to the user (the
   field is locked for the AI); the Pensionskasse split is not on the certificate.
5. **Recognition in one place.** `classifyDocumentKind` recognizes the certificate by
   „Lohnausweis“, „Certificat de salaire“ and „Bruttolohn total“; app and server route with it the
   same way.
6. **Scanned LStB.** The line number is also found after left-column text when the line's heading
   follows; headings match without umlauts; „für“ also as „fur/fiir“; thousands with a comma
   („61,234,56“). Only the line from its number onward goes to the model, never the left column.
7. **A further certificate in the year** is added on request (`addToExisting`). The server rejects
   the same certificate twice (`LSTB_SAME_CERTIFICATE`). A sum of two documents is no longer a
   single document: provenance „nutzer“ (user), confirmed.

## Consequences

- Real case 2025: both Lohnausweise are read completely, both totals add up, the wife's scanned
  certificate lands with Person B. 2024: a scanned certificate from a German employer yields
  gross salary, wage tax, pension, health and unemployment insurance; the long-term care insurance
  was illegible in the scan and is left to the model or the user.
- Values from OCR remain „prüfen“ (ADR-0060); only the user confirms.
- Not included: pension certificate (field B), Pensionskasse certificate, person recognition for the
  German LStB (there the user chooses the person as before).
