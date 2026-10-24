# 10.3 — Bescheidprüfung 1.0 (M7): PDF + manuell, Abgleich, Korrektur/Einspruch

**What to build:** Der Bescheid (Steuerbescheid) kommt als PDF in die Inbox und/oder wird manuell
eingetippt; seine Beträge werden gegen die berechneten Beträge abgeglichen. Die Zustandsmaschine
verzweigt am Punkt „Bescheid eingegangen" (Produkt-ADR-009): **vor** dem Bescheid „Korrigieren"
(Fassung n+1 als Kopie der eingereichten Fassung, Diff markiert), **nach** dem Bescheid ein eigener
**Einspruch-Flow** mit Fristen-Countdown, Grund-Auswahl und Diff der strittigen Posten — und
kein „Korrigieren"-Button mehr (das Wort wäre eine falsche Zusage, ADR-032).

**Blocked by:** **10.1** (Beleg-Inbox für das Bescheid-PDF) · **15** (Posten-Kern für den
Abgleich Bescheid vs. berechnet) · Engineering-Entwurf 0039 (Zustandsmaschine mit
`bescheid`-Zustand, promotet).

**Status:** ready-for-review (Kaan, Worktree `ticket-10-3-bescheidpruefung`)

- [x] Bescheid-PDF importierbar (Inbox-Dokumenttyp `Steuerbescheid` in `belegart.ts`), manuelle
      Betrag-Eingabe als Fallback (ADR-036 — geführte Maske, offen/unklar/erfasst; Scan/OCR OUT, ADR-045)
- [x] Abgleich: Bescheid-Beträge vs. `berechne` (`gleicheBescheidAb`), Abweichungen als Diff sichtbar, nie still
- [~] Vor Bescheid: „Korrigieren" = Kopie der *eingereichten* Fassung (nicht Arbeitsstand) — **reiner Kern
      `korrigiereFassung` (Kopie + Diff, Fassung n unveränderlich) gebaut und getestet; die FASSUNG-PERSISTENZ +
      Endpoint fehlen, weil das Einreichungs-/Fassungs-Modell im Repo noch nicht existiert (liegt beim
      Einreichungs-Flow, nicht bei dieser Bescheidprüfung). Ehrlich im Register vermerkt.
- [x] Nach Bescheid: Einspruch-Flow mit Fristen-Countdown ab Bescheiddatum (§ 355 AO, +1 Monat),
      Grund-Auswahl (closed set), Diff der strittigen Posten; kein „Korrigieren"-Button (ADR-009/ADR-032 —
      Screen-Test pinnt die Abwesenheit)
- [x] Zustandsmaschine: `bescheid`-Zustand erreichbar + bescheid-Sub-Zustände (eingegangen → geprüft →
      einspruch-eingelegt) server-validiert (`istBescheidUebergangErlaubt`, illegaler Sprung → 409, kein
      stiller Übergang)
- [x] TDD, typecheck + lint grün, Posture-Zeile (Bescheid = Steuerdaten: Feldverschlüsselung ADR-0008 + Audit REQ-004)

**REQ:** REQ-023 (nächste freie Nummer nach 021; **REQ-022** ist für 10.2 angenommen, **REQ-024** für 10.4 —
beide laufen parallel in eigenen Worktrees. Falls 10.2/10.4 eine andere Nummer belegen → beim Merge auflösen.)

**DoD-Posture:** Bescheid = Steuerdaten. Der Kern ist reine, I/O-freie Logik; die fünf Beträge liegen
feldverschlüsselt at rest (ADR-0008, AES-256-GCM, `@encrypted?mode=strict`), jeder Lese-/Schreibzugriff
wird auditiert (REQ-004, `resource: 'bescheid'`), Übergänge server-validiert. Kein client-seitiges
Persistieren; der Screen hält nur flüchtigen UI-Zustand. Kein Performance-Achsen-Touch (ein Upsert pro
Feld, keine neuen Indizes über die `(userId, steuerjahr)`-Unique + `(userId)`-Index hinaus).
