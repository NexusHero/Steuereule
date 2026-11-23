# ADR-0058 — LStB-Textfallback: Allowlist, Belegprüfung, nie grün

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `packages/core/src/domains/lstb-parser.ts`, `apps/api/src/lstb-scan/`
- **Ergänzt:** ADR-0051 (Eulen-Modus, Beleg-Isolation §5), Ticket #444 (Leitentscheidung 2)

## Kontext

#444 sah ursprünglich ein rein deterministisches LStB-Parsing vor. Gescannte oder schlecht
gesetzte Bescheinigungen lassen dem Parser aber Felder offen. Ein Text-Fallback über das
Sprachmodell kann dort helfen. Das Review von PR #448 fand dafür drei Lücken:

1. Werte des Modells konnten **grün** werden und deterministisch grüne Werte **überschreiben**.
   Damit war AC 4 („niemals ein falscher grüner Wert“) nicht zu halten.
2. Erfundene Beträge (nicht im Text) wurden übernommen.
3. Die Schwärzung arbeitete mit einer **Blocklist** über den ganzen Dokumenttext. Ein Namens- und
   Adressblock ohne Label oder ein Arbeitgeber ohne Rechtsformzusatz ging an den Provider.

## Entscheidung

Der Text-Fallback bleibt, aber nur unter diesen Regeln:

1. **Allowlist statt Blocklist.** `selectLstbRelevantLines()` lässt nur die Zeilen 3, 4, 23a/b,
   25, 26 und 27 (plus eine reine Betrags-Folgezeile) sowie eine synthetische Jahreszeile durch.
   Alles andere verlässt den Server nicht. Schwärzung (`scrubDocumentTextPii`) und
   `checkPiiFree` laufen danach als zweite und dritte Verteidigungslinie. Schlägt
   `checkPiiFree` an, entfällt der Aufruf (`securityBlocked: true`).
2. **Belegprüfung.** Ein vorgeschlagener Betrag zählt nur, wenn er wörtlich in genau dem Text
   steht, den das Modell gesehen hat. Sonst wird er verworfen.
3. **Nur Lücken füllen.** Der Fallback füllt ausschließlich Felder, die der deterministische
   Parser leer gelassen hat. Er überschreibt nie einen gelesenen Wert und kann kein Steuerjahr
   liefern.
4. **Nie grün.** Jedes vom Fallback gefüllte Feld ist `pruefen` mit Grund `llm_suggested` und
   muss vom Nutzer einzeln bestätigt werden. Deterministische Felder werden nie hochgestuft. Sie
   werden nur herabgestuft, wenn die zusammengeführten Werte sich widersprechen (gemeinsame
   Plausibilitätsregel).
5. **Nachvollziehbar.** Jeder externe Aufruf erzeugt einen Audit-Eintrag
   `ki_lstb_textfallback` (ohne Inhalt).

## Konsequenzen

- AC 4 ist durch Core-Tests abgesichert (`lstb-text-fallback.test.ts`): erfundene Werte,
  Überschreiben und grüne Fallback-Felder sind ausgeschlossen.
- Der Nutzen des Fallbacks ist bewusst schmal. Er hilft, wenn eine Zeile erkannt, ihr Betrag aber
  vom Parser nicht sicher zugeordnet wurde. Was nicht im erlaubten Text steht, bleibt offen und
  wird von Hand erfasst.
- Ohne freigeschalteten KI-Slot oder bei aktivem Kill-Switch läuft der Scan rein deterministisch.
