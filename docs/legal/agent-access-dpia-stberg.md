# Legal classification and Datenschutz-Folgenabschätzung (DSFA, data protection impact assessment) for agent access

> **Status:** Valid from version 1.0 (November 2026)  
> **Reference:** ADR-0052 (agent access via Model Context Protocol), Issue #388 (Slice 17.5)  
> **Legal bases:** Steuerberatungsgesetz (StBerG, Tax Advisory Act), Datenschutz-Grundverordnung (DSGVO, GDPR, Art. 25, 35, 44 ff., 49)

---

## 1. Classification under the Steuerberatungsgesetz (StBerG)

### 1.1 Problem statement and regulatory framework
Under § 2 and § 3 StBerG, *geschäftsmäßige Hilfeleistung in Steuersachen* (business-like assistance in tax matters) is permitted only to persons and associations authorized to provide it (e.g. Steuerberater (tax advisors), Steuerbevollmächtigte (authorized tax agents), Rechtsanwälte (attorneys)). *Unbefugte geschäftsmäßige Hilfeleistung in Steuersachen* (unauthorized business-like assistance in tax matters) is prohibited under § 5 StBerG and can be punished as an administrative offense (*Ordnungswidrigkeit*) under § 160 StBerG.

### 1.2 Technical and legal delimitation of SteuerEule agent access
By providing the Model Context Protocol (MCP) interface, SteuerEule provides **no *Hilfeleistung in Steuersachen* (assistance in tax matters)**, but a technical software tool:

1. **The user's own assistant (tool character):**
   * SteuerEule does not itself operate the AI agent as a closed advisory instance.
   * The user, on their own responsibility, concludes an agreement with a model provider (e.g. Anthropic, OpenAI, local LLM) or operates their own client.
   * The agent acts as the extended arm and personal tool of the taxpayer (*Steuerpflichtiger*) themselves.
2. **No legal subsumption or client mandate (*Mandatsverhältnis*):**
   * SteuerEule does not give binding legal advice through the MCP tools.
   * Calculations of the core (`@steuereule/core`) are deterministic calculation paths based on the official statutes (e.g. § 32a EStG tariff, commuter allowance (*Pendlerpauschale*), official BMF tables), which do not invent open values but honestly show them as open (ADR-0032/0034).
3. **Mandatory human intermediation („Der Nutzer gewinnt“ ("the user wins") & confirmation requirement):**
   * All values entered by the AI assistant are mandatorily marked server-side as **unconfirmed** (`unbestaetigt`) (ADR-0052 §6).
   * Unconfirmed values block the pre-check, the form printout and the payment (REQ-032). A printout or a submission without explicit visual review and confirmation, annex by annex, by the human user is technically impossible.
   * If the user has entered a value themselves, the assistant can never overwrite it; a suggestion is created instead.
4. **No electronic transmission to tax authorities (paper route):**
   * In version 1.0, SteuerEule does not connect an ELSTER certificate and transmits no data to the Finanzämter (tax offices) (ADR-0050). The user prints the forms themselves, checks them and signs them by hand.

---

## 2. Datenschutz-Folgenabschätzung (DSFA under Art. 35 DSGVO)

### 2.1 Threshold analysis (Art. 35(1) DSGVO)
Tax data is financial data of high sensitivity (partly including Art. 9 DSGVO data such as religious affiliation for church tax purposes). Because an automated interface (OAuth 2.1 + remote MCP) is opened to external AI systems, a formalized DSFA was carried out.

### 2.2 Data flows and interface architecture
1. **Authentication:**
   * Authentication is strictly per OAuth 2.1 with PKCE.
   * Authorization requests require explicit scopes (`steuerdaten:read`, `steuerdaten:write`, `belege:write`, `zahllink:read`).
   * The consent screen explicitly informs the user about the requested permissions and the third-country risk.
2. **Read access and PII masking (privacy by design, Art. 25 DSGVO):**
   * When an assistant calls the tool `steuerjahr_stand`, personal identifiers (PII) are **masked** server-side:
     * Steuer-ID (tax identification number): `12*******01`
     * IBAN: `DE** **** **** **** **** 00`
     * First/last name: first letter + `***`
     * Street & house number: masked
     * Phone number: area code + `***`
   * Planning-relevant tax key data (postal code, place of residence, amounts, tax year) remains in plain text, so that the assistant can do tax calculations without being able to identify the person.
3. **Write access and account protection:**
   * Assistant tokens can only write domain data (`maske_eintragen`, `beleg_hochladen`).
   * Administrative actions (password change, account deletion, passkeys, OAuth management, data export under Art. 20) are **blocked server-side** for bearer tokens (`ForbidAssistantGuard`).
4. **Auditing and transparency (Art. 30 DSGVO):**
   * Every read and write access by an assistant is logged atomically in the `AuditEntry` table (with timestamp, client ID and client name).
   * The user can view these accesses in the Art. 15/20 DSGVO data export.
5. **Revocation:**
   * The user can block connected assistants at any time, with immediate effect, under `Profil → Verbundene Assistenten`. Token and session are invalidated in the database.

### 2.3 Third-country transfer (Art. 44 ff. DSGVO)
* **Risk:** Leading AI model providers (Anthropic, OpenAI, Google) are headquartered in the USA (third country per Art. 44 DSGVO).
* **Legal basis:**
  1. The transfer takes place exclusively at the direct initiation and instruction of the user (the user connects their client).
  2. On the OAuth consent screen, SteuerEule obtains **explicit consent per Art. 49(1)(a) DSGVO**. The user is informed that government access risks exist in the USA (e.g. FISA 702).
  3. In addition, the server-side PII masking substantially minimizes the identifiability of the user in the third country.

### 2.4 Risk assessment and residual risk
| Threat / risk | Likelihood | Severity | Technical/organizational measure | Residual risk |
| :--- | :--- | :--- | :--- | :--- |
| Model reads plain-text identifiers | Very low | High | Automatic server-side PII masking before transfer | Minimal |
| Assistant enters incorrect figures | Medium | Medium | Unconfirmed values block the printout; mandatory user review per annex | Low |
| Token theft / misuse | Low | High | Scoped OAuth token; administrative actions blocked; immediate revocation in the UI | Low |
| Unnoticed data leakage | Low | Medium | Complete DSGVO Art. 30 audit trail for every tool call | Very low |
| Assistant reads more than necessary (names, dates of birth, identifiers) | Low | High | Read view (ADR-0052 Amendment 3): amounts in plain text, persons only derived (age, federal state), third parties and free text only as „gesetzt“ ("set"); the token is valid only at the MCP endpoint (Amendment 4), not at the rest of the API | Low |
| Inference of religious affiliation (Art. 9 DSGVO) | Low | High | Only the user enters the denomination and the assistant never reads it; it writes and reads only „kirchensteuerpflichtig ja/nein“ ("liable to church tax yes/no"). The attribute remains an indirect indication of religious affiliation and is covered by the consent given when connecting | Low |
| Misleading task text from a third-party model in the app | Low | Medium | Fixed types, 300 characters, no identifiers and no links, displayed as plain text with the assistant's name; the user discards the task. Names in the text are prevented only by the tool description | Low |
| Third-party client impersonates a connected assistant | Very low | Medium | Own entries and tasks are keyed by the OAuth client ID, not by the name; a registration grants nothing without the user's sign-in and approval, is rate-limited per address, and clients that were never approved are deleted after 7 days | Minimal |

**Result:** The remaining residual risk is appropriate and effectively contained by the implemented security controls.

---

## 3. Product and marketing promises

To avoid misleading advertising (§ 5 UWG, Act Against Unfair Competition) and to respect the limits of professional law, the following binding rules apply to all marketing and product copy:

* **Not permitted:**
  * „SteuerEule macht deine Steuererklärung vollautomatisch ohne dein Zutun.“ ("SteuerEule does your tax return fully automatically without any input from you.")
  * „Unsere KI übernimmt die steuerliche Verantwortung.“ ("Our AI takes on the tax responsibility.")
  * „Steuerberatung per Knopfdruck.“ ("Tax advice at the push of a button.")
* **Permitted and binding:**
  * „Verbinde deinen eigenen KI-Assistenten, um Daten vorzubereiten.“ ("Connect your own AI assistant to prepare data.")
  * „Der Assistent füllt aus – du prüfst und bestätigst jede Anlage selbst.“ ("The assistant fills in – you check and confirm every annex yourself.")
  * „Volle Kontrolle: Du entscheidest, welche Werte in deine Steuererklärung einfließen.“ ("Full control: you decide which values go into your tax return.")
