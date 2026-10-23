# Review-Report — ADR-Entwürfe 0028 / 0029 / 051

**Reviewer:** Musti (Lead, Review-Rolle) · **Autor der Entwürfe:** NexusHero
**Datum:** 2026-10-23 · **Scope:** `.scratch/roadmap-1.0/adr-drafts/` (0028, 0029, 051)

Alle Fundstellen sind belegt (`Datei:Zeile`). Nicht selbst verifizierte Behauptungen sind als
„nicht verifiziert" markiert. Die Entwürfe wurden **nicht** verändert.

---

## 1. Gesamturteil

Die drei Entwürfe bilden die Entscheidungen D1–D20 im Kern **korrekt und vollständig** ab
(alle 20 Entscheidungen sind auf die drei ADRs verteilt: 051 → D1/D2/D5/D7/D8/D10/D11/D12,
0028 → D3/D4/D6/D9, 0029 → D13–D20). Die Eigenbau-Behauptungen aus 0028 sind **durchgängig
im Code belegt** (drei Limiter + geteilte `consumeDbRateLimit` + `RateLimit`-Tabelle existieren
genau so; `session-cookie.ts` reimplementiert das better-auth-Cookie-Format; `trusted-proxies.ts`
dokumentiert die Asymmetrie). Die Zeilenzahlen stimmen (LoginScreen 727, DatenschutzScreen 520,
better-auth.ts 539). Die Nummerierung kollidiert nicht (Engineering nächstfrei 0028/0029,
Research nächstfrei 051).

Es gibt aber **zwei Blocking-Findings**: (a) ein offenes, im Register als „pending" geführtes
ADR-Amendment (Produkt-ADR-027(b) für REQ-007) wird von den Entwürfen nicht erfasst, obwohl
genau die Entwürfe laut Roadmap der Ort für Amendments sind; (b) 0028 verlinkt Research-ADRs
mit relativen Dateinamen, die nach Promotion nach `docs/adr/` ins Leere zeigen. Dazu kommen
eine inhaltlich **falsche** ADR-0021-Paraphrase in 0029 und mehrere Konsistenz-/Vollständigkeitslücken.

**Empfehlung:** Nicht vor den zwei Blocking-Fixes promoten; die Important-Findings sollten im
selben Zug mitbehandelt werden, weil eines davon (#170) sonst ohne Heimat bleibt.

---

## 2. Blocking Findings

### B1 — Produkt-ADR-027(b)-Amendment für REQ-007 fehlt in allen drei Entwürfen und im Roadmap-Master

- **Datei:** `adr-drafts/0028-foundation-konsolidierung.md:51`, `adr-drafts/051-roadmap-1.0.md:29`,
  `docs/roadmap-1.0.md:116–117`
- **Problem:** 0028 entscheidet in der Decision explizit „Mantle completion: **REQ-007 (TOTP/passkey)**"
  (Zeile 51) und die Roadmap legt das in Phase 0.5 fest. Produkt-ADR-027(b) lautet aber wörtlich
  **„keine 2FA in 1.0"** (`finanzo-funke-design-system/project/research/adr/025-027-a11y-export-konto.md:23`).
  Das Register führt diesen Widerspruch seit 2026-07-23 als **offenes Amendment**:
  > „this needs a formal ADR-027 amendment and is flagged … Until that amendment lands, treat REQ-007
  > as the operative requirement and ADR-027(b) as superseded on this one point only"
  (`docs/requirements/register.md:231–238`, REQ-007-Status `docs/requirements/register.md:18`).
  Das Ticket kennt das Amendment (`.scratch/roadmap-1.0/issues/05-p0-5-mantel-abschluss.md:20`
  „ADR-Amendment zu ADR-027(b) nachgezogen") — aber weder 0028 noch 051 noch der Roadmap-Master
  erwähnen es. Der Roadmap-Master listet Amendments sogar ausdrücklich auf
  (`docs/roadmap-1.0.md:116–117` „inkl. Amendments, wo bestehende ADRs berührt sind") — und nennt
  dort ADR-0015 und ADR-0026/0027, aber **nicht** Produkt-ADR-027(b).
- **Warum blockierend:** Die Entwürfe sind laut Roadmap der Ort, an dem D1–D20 **inklusive Amendments**
  festgeschrieben werden. Sie führen REQ-007 als Foundation-Umfang ein und lassen dabei eine bekannte,
  im Register als „pending" markierte ADR-Kollision unaufgelöst. Promotet man 0028/051 so, steht ein
  neuer ADR-Entscheid (TOTP/passkey in 1.0) neben einem nicht-amendierten Alt-ADR („keine 2FA in 1.0"),
  ohne Supersession-Nachweis — genau die Klasse „documentation drifted from a decision already made",
  die dieses Repo laut Register-Ruling R1 als eigenen Prozessfehler führt.
- **Änderungsvorschlag:** In 0028 §Decision (Punkt 5 „Mantle completion") und in 051 §Mantel-Abschluss
  einen Satz ergänzen: REQ-007 superseded Produkt-ADR-027(b) „keine 2FA in 1.0" auf genau diesem Punkt;
  das Amendment wird als eigener Eintrag im Research-ADR-Log nachgezogen (Ticket 05, Zeile 20, ist der
  Durchsetzungsort). Im Roadmap-Master Zeile 117 die Amendment-Liste um Produkt-ADR-027(b) ergänzen.

### B2 — 0028 verlinkt Research-ADRs mit relativen Dateinamen, die nach Promotion brechen

- **Datei:** `adr-drafts/0028-foundation-konsolidierung.md:10–11`
- **Problem:** Die „Builds on"-Zeile verlinkt `[ADR-046](046-backend-nestjs-api.md)`,
  `[ADR-048](048-ki-architektur-agnostisch.md)`, `[ADR-049](049-deployment-k3s-hetzner.md)` — relative
  Dateinamen, die nur im Verzeichnis `finanzo-funke-design-system/project/research/adr/` auflösen.
  0028 ist ein **Engineering**-ADR und wandert nach Review nach `docs/adr/`; dort zeigen diese Links
  ins Leere. Die Repo-Konvention für den Cross-Log-Verweis ist anders: Engineering-ADRs referenzieren
  Produkt-ADRs **per Name/Nummer in Prosa ohne Markdown-Link** — vgl. `docs/adr/0026-…:28–29`
  („the product ADR log's ADR-049") und `docs/adr/index.md:16–18` („cross-references … rather than
  duplicating").
- **Änderungsvorschlag:** Die drei Links in Prosa-Referenzen umwandeln („research ADR-046/048/049")
  oder, falls ein Link gewünscht ist, mit korrektem relativen Pfad ab `docs/adr/`
  (`../../finanzo-funke-design-system/project/research/adr/046-…`). Gleiches gilt für den Verweis
  „see `051-roadmap-1.0.md`" (Zeile 10) — beim Umzug nach `docs/adr/` ist das kein Pfad in demselben
  Verzeichnis mehr.

---

## 3. Important Findings

### I1 — 0029 paraphrasiert ADR-0021 inhaltlich falsch („observed to work" statt „observed to fail")

- **Datei:** `adr-drafts/0029-definition-of-done.md:7–8`
- **Problem:** „Builds on … [ADR-0021] (a control is established only when **observed to work**)".
  ADR-0021 heißt „A control is proven by **breaking it**, not by watching it pass"
  (`docs/adr/0021-controls-are-proven-by-breaking-them.md:1`) und seine eigentliche Decision ist
  laut ADR-0027 „a control is not established until it has been **observed to fail**"
  (`docs/adr/0027-…:10–11`). „observed to work" ist das genaue Gegenteil des Prinzips. Die spätere
  Konsequenz (Zeile 70 „observed, not claimed") trifft es richtig — die Header-Paraphrase widerspricht
  ihr also.
- **Änderungsvorschlag:** „(a control is established only when observed to **fail**)" oder direkt den
  Titel „proven by breaking it" verwenden.

### I2 — 0028 „Builds on" ohne ADR-0027, während der Roadmap-Master ADR-0026/0027 als amendierungsbedürftig nennt

- **Datei:** `adr-drafts/0028-foundation-konsolidierung.md:6–11` vs. `docs/roadmap-1.0.md:117`
- **Problem:** Der Roadmap-Master sagt, bei der Foundation-Strategie seien „ADR-0026/0027" berührt
  und als Amendment vorzusehen. 0028 „Builds on" führt **ADR-0026** (mit der #292-Lücke, Zeile 9–10)
  korrekt, aber **ADR-0027 fehlt völlig** — und nirgends ist erklärt, welches Amendment die Foundation
  an ADR-0027 (session freshness `freshAge: 0`) nach sich zieht. Zwei Lesarten sind möglich, keine ist
  belegt: (a) die Roadmap meint tatsächlich Engineering-ADR-0027, dann fehlt die Begründung; (b) die
  Roadmap meint fälschlich zwei Engineering-ADRs, obwohl das eigentliche Produkt-Amendment ADR-027(b)
  ist (siehe B1). In beiden Fällen ist die Referenz nicht auflösbar.
- **Änderungsvorschlag:** Entweder in 0028 „Builds on"/Consequences ergänzen, welches ADR-0027-Amendment
  die Foundation auslöst, oder die Roadmap-Formulierung (Zeile 117) präzisieren und Produkt-ADR-027(b)
  als das tatsächlich betroffene Amendment führen (Zusammenhang mit B1).

### I3 — #170 (echte Google-Credentials) hat in Roadmap und Entwürfen keine Heimat

- **Datei:** `adr-drafts/051-roadmap-1.0.md:17–21` (Infra-/ELSTER-Track), `docs/roadmap-1.0.md:24–30`,
  `docs/requirements/register.md:19` (REQ-008 „Google: Done")
- **Problem:** REQ-008 Google ist im Register „Done", aber **mit Platzhalter-Credentials**; der echte
  OAuth-Handshake ist offen und als **#170** dokumentiert (`docs/adr/0026-…:79` „it is not a real Google
  OAuth handshake (#170, still open)", `README.md:57` „real Google sign-in needs real credentials …
  out of scope for a local stack (#170, still open)"). Kein Ticket, keine Phase, kein Track der Roadmap
  übernimmt #170. Da 1.0 „zeigbar" sein soll (DoD-4, inkl. Stakeholder-Durchlauf mit Registrierung),
  ist „Google anmelden funktioniert in echt" eine Lücke im 1.0-Kriterium, die nirgends als solche benannt
  wird.
- **Änderungsvorschlag:** #170 einem Track zuordnen (naheliegend: Phase 3 Go-Live-Readiness oder der
  Infra-/Secret-Teil von #292) und im Register REQ-008/1.0-DoD den Unterschied „Button + Plumbing
  nachgewiesen" vs. „echter OAuth-Handshake" explizit machen.

### I4 — Zirkuläre „Builds on"-Kette 0028 ↔ 051 und Log-Zuordnung von 051

- **Datei:** `adr-drafts/0028-…:10` (verweist auf `051-roadmap-1.0.md`) und `adr-drafts/051-…:14,34`
  (verweist auf „Engineering-ADR-0028"/„0029")
- **Problem:** 0028 (Engineering) baut laut Zeile 64 auf „research ADR-051" auf, während 051 (Research)
  auf „Engineering-ADR-0028/0029" aufbaut — eine wechselseitige Vorwärtsreferenz auf Entwürfe, die
  gemeinsam promotet werden. Zusätzlich liegt 051 in der Research-Sequenz, aber der Research-Log ist
  laut Index auf „product & design-language decisions (001–050)" zugeschnitten
  (`finanzo-funke-design-system/project/research/adr/index.md:16`); eine Roadmap-/Track-Entscheidung
  passt dort nur bedingt. Der Inhalt (Foundation, Infra, Engineering-Phasen) ist überwiegend
  Engineering-Nähe.
- **Änderungsvorschlag:** Referenzrichtung auflösen (051 als Roadmap-Dokument ist bereits
  `docs/roadmap-1.0.md`; 0028 sollte darauf verweisen, nicht umgekehrt „Builds on" auf 051). Klären,
  ob 051 als Research-ADR oder als Engineering-ADR (dann andere Nummer) geführt wird; aktuell doppelt
  er fast 1:1 den Inhalt des Master-Dokuments `docs/roadmap-1.0.md`.

---

## 4. Minor / Nits

- **M1 — `docs/roadmap-1.0.md:117` „ADR-0026/0027":** siehe I2; die Schreibweise „ADR-0026/0027"
  (4-stellig, Engineering) kollidiert semantisch mit dem eigentlich betroffenen **Produkt**-ADR-027(b).
  Notation vereinheitlichen.
- **M2 — 051 nennt D11 in der Historie, hat aber keinen D11-Abschnitt:**
  `adr-drafts/051-roadmap-1.0.md:56` listet D11, der Body enthält aber keinen „Prozess (unverändert)"-
  Abschnitt (im Master `docs/roadmap-1.0.md:111–118` vorhanden). Historie und Body auseinanderhalten.
- **M3 — arm64 fehlt in 051/Roadmap, ist aber im Infra-Ticket:** `.scratch/roadmap-1.0/issues/06-…:23`
  („arm64-Verifikation (README-Lücke)"), `README.md:31` („genuinely unverified"). In 051/Roadmap
  (§ Infra-Track) nicht erwähnt. Geringfügig, aber „Build + Boot auf linux/arm64 gemessen" ist ein
  hartes DoD-Kriterium des Infra-Tickets, das die ADR-Ebene nicht spiegelt.
- **M4 — Redis-Einsatzzweck unbenannt:** 051/`docs/roadmap-1.0.md:29` sagen nur „Redis"; der Zweck
  (Scan-/OCR-Queues via BullMQ + Caching) steht in `finanzo-funke-design-system/project/research/adr/047-…:18`.
  Für die Roadmap reicht das, aber die Fundstelle lohnt einen Verweis.
- **M5 — Hygiene-Ticket adressiert nur das Entfernen, nicht das Verhindern:**
  `.scratch/roadmap-1.0/issues/01-…:12` („package-lock.json entfernt"). `package-lock.json` ist aktuell
  **untracked und nicht in `.gitignore`** (kein Lockfile-Eintrag in `.gitignore`; `git check-ignore`
  meldet „not ignored"). Löschen allein lässt `npm install` die Datei neu erzeugen — ein `.gitignore`-
  Eintrag gehört zum selben Hygiene-Schritt. („Zweiter Lockfile-Fix": ein weiterer, davon
  unabhängiger „zweiter" Fix ist aus dem Repo nicht belegbar — **nicht verifiziert**.)
- **M6 — „Comment volume: headers explain 'what' (20–40 lines)" ist lose belegt:**
  `adr-drafts/0028-…:31`. Die zitierten Header (`session-cookie.ts:1–26`, `trusted-proxies.ts:1–40`,
  `db-rate-limit.ts:1–13`) erklären überwiegend **warum** (Begründung des Nachbaus, der Asymmetrie,
  der geteilten Implementierung), nicht was. Die Zeilenzahlen stimmen grob, die „what statt why"-
  Charakterisierung trifft auf die genannten Beispiele nicht zu.
- **M7 — „hand-rolled rate limiter" vs. Code-Gegenargument:** `apps/api/src/auth/db-rate-limit.ts:8–13`
  behauptet „same table (RateLimit), same storage shape, no new mechanism" (Nachbau von better-auths
  eigenem Storage-Adapter). Die Decision in 0028 (Ersatz durch `@nestjs/throttler`) sollte dieses
  Gegenargument benennen, statt die Limiter pauschal als „hand-rolled" zu führen — sonst wirkt die
  Begründung angreifbar, obwohl der Ersatz-Wille (ein Standard statt Drei-Nachbauten) tragfähig ist.
- **M8 — Deciders-Feld vermischt Decider und Reviewer:** `adr-drafts/0028-…:5`,
  `adr-drafts/0029-…:5` führen „NexusHero (Stakeholder), Musti (Lead, Review-Rolle)" als Deciders.
  Konvention im Log trennt das (`docs/adr/0027-…:5` „Deciders: Robin …; reviewed by Musti"). Musti
  ist Review-Rolle, nicht Decider — Feld auf den Stakeholder beschränken oder die Review-Rolle
  explizit als solche (nicht als Decider) führen.
- **M9 — „Introduced by"-Feld fehlt:** `docs/adr/0027-…:15`/`docs/adr/0024-…:14` führen ein
  „Introduced by"-Feld; 0028/0029 haben keines. Für Grilling-Session-ADRs vertretbar, aber die
  Referenz-ADRs setzen den Standard.
- **M10 — Research-Index hat doppelten Eintrag „036":**
  `finanzo-funke-design-system/project/research/adr/index.md:43` und `:50` führen beide „036 | Details"
  (unterschiedlicher Wortlaut). Vorbestehend, nicht von den Entwürfen verursacht — aber beim Eintrag
  von 051 in den Index fällt es auf und sollte bereinigt werden.
- **M11 — Research-ADRs 001–005 haben keine Dateien:** Der Index führt 001–005, aber das Verzeichnis
  beginnt bei 006. 051 referenziert ADR-005 (`051-roadmap-1.0.md:21`), Ticket 10 referenziert ADR-002
  (`.scratch/…/10-p2-verbreiterung.md:24`). Beide Verweise sind über den Index auflösbar, aber
  index-only. Vorbestehend; Hinweis genügt.

---

## 5. Empfehlung für die Autoren (vor der Promotion)

1. **B1 umsetzen** — Produkt-ADR-027(b)-Amendment in 0028, 051 und `docs/roadmap-1.0.md:117` sichtbar
   machen; Durchsetzungsort ist Ticket 05 (Zeile 20).
2. **B2 umsetzen** — relative Research-ADR-Links in 0028 in Prosa-Referenzen (Repo-Konvention ADR-0026)
   oder korrekt relative Pfade umwandeln.
3. **I1 korrigieren** — ADR-0021-Paraphrase in 0029 auf „observed to fail" / „proven by breaking it".
4. **I2/I3 klären** — entweder das ADR-0027-Amendment in 0028 benennen oder die Roadmap-Referenz
   präzisieren; #170 (echte Google-Credentials) einem Track/Phase zuordnen.
5. **I4 entscheiden** — Zirkularität 0028↔051 auflösen; Log-Zuordnung von 051 (Research vs. Engineering
   vs. reines Roadmap-Dokument) festlegen.
6. M2 (D11-Abschnitt), M3 (arm64), M5 (`.gitignore`-Eintrag für `package-lock.json`) und M8
   (Deciders-Feld) im selben Zug mitziehen — alles Ein-Zeilen-Fixes.
7. Nach Promotion: 0028/0029 in `docs/adr/index.md`, 051 in den Research-Index eintragen (inkl.
   Bereinigung des doppelten 036, M10).

**Nicht verifiziert:** ein von M5 unabhängiger „zweiter Lockfile-Fix" (kein Beleg im Repo);
die genaue Absicht hinter der Roadmap-Formulierung „ADR-0026/0027" (Engineering vs. Produkt, I2).
