# ADR-0047 — Fristen-/Verspätungszuschlag-Warnmodus: Abgabefrist-Regelwerk, 60-Tage-Banner, kein `verspätet`-Status (Entwurf)

- **Status:** Draft — promotion needs Musti review (ticket 10.7 review)
- **Date:** 2026-10-25
- **Deciders:** Suhay (agent, Ticket 10.7) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-022 (Jahresregelwerke: die UI zeigt die Regeln des gewählten Jahres,
  nie „aktuelle" Werte), Produkt-ADR-023 (Fristen sind kritisch → nüchtern und präzise), ADR-0039
  (eine verpasste Frist ist KEIN Status: bleibt `entwurf` + Warnbanner)
- **Builds on** ADR-0039 (Steuerjahr-Zustandsmaschine), ADR-0004 (pure core), die
  Datums-Disziplin von bescheid.ts (ISO yyyy-mm-dd, UTC-Arithmetik)
- **Context tags:** architecture, fristen, verspaetungszuschlag, determinism boundary, honesty
  principle

## Context

Der Warnmodus (M6) warnt **ab 60 Tagen vor der Abgabefrist** vor dem Verspätungszuschlag
(§ 152 AO). Produkt-ADR-018/Engineering-ADR-0039 haben entschieden: die verpasste Frist ist
KEIN eigener Status — das Steuerjahr bleibt `entwurf`, dazu kommt ein Warnbanner (ein
technischer/zeitlicher Zustand darf nie wie ein Steuer-Status aussehen). Produkt-ADR-022
verlangt Jahresregelwerke: die Abgabefrist ist eine Konfiguration PRO JAHR, nie ein aus
„aktuellen" Werten abgeleitetes Datum. Produkt-ADR-023 verlangt den nüchternen Ton: was ist
passiert, was tun, keine Pointe, nie Schuld beim Nutzer.

## Decision

Ein reines, UI-freies Modul `packages/core/src/fristen.ts` (ADR-0004, kein I/O), ein
read-only-API-Modul, ein Banner im Cockpit:

1. **Abgabefrist als explizites Regelwerk (`abgabefristFuer`)** — § 149 Abs. 2 AO: 31. Juli des
   Folgejahres (generell seit VZ 2018). Eine explizite Tabelle je Jahr (2024 → 31.07.2025,
   2025 → 31.07.2026, 2026 → 31.07.2027), zitiert, im Test gepinnt — nie aus „aktuellen" Werten
   abgeleitet (Produkt-ADR-022). Ein Jahr außerhalb der Tabelle WIRFT (throw, don't approximate —
   dieselbe Regel wie tarif.ts); die rückwirkenden Jahre (bis 4) kommen mit 10.8 dazu, dann
   wächst die Tabelle.

2. **Warnmodus (`fristenWarnung`)** — eine abgeleitete Stufe `keine` | `warnung` | `abgelaufen`
   aus ganzen verbleibenden Tagen (Frist − heute, exklusiv): `warnung` ab 60 Tagen (einschließlich
   des Fristtags selbst, 0 Tage), `abgelaufen` ab dem Folgetag. Die Stufe ist der BANNER-INPUT,
   nie ein Status (ADR-0039 — es gibt schlicht keinen `verspätet`-Wert in
   steuerjahr-status.ts, so bleibt die verpasste Frist `entwurf`). Die § 152 Abs. 2 AO-Zahlen
   (0,25 % je angefangenem Monat, mindestens 25 €) sind zitierte Konstanten, die das Banner
   nüchtern nennt (Produkt-ADR-023).

3. **„Heute" gehört dem Server** — der Kern rechnet mit ISO yyyy-mm-dd-Daten (UTC, locale-
   unabhängig, dieselbe Disziplin wie bescheid.ts's Einspruchsfrist). Die API erzeugt „heute"
   in Europe/Berlin (`heuteInBerlin`, injectable `now` — der Mitternachtsfall ist unit-getestet),
   nie die Client-Uhr, die der Nutzer verstellen könnte.

4. **API (`Fristen`-Modul) + Cockpit-Banner** — `GET /v1/steuerjahre/{jahr}/fristen` liefert
   `{ abgabefrist, heute, stufe, verbleibendeTage, verspaetungszuschlag }`. Kein Persistieren,
   kein Audit (die Fristen sind gesetzliche Fakten, keine Nutzerdaten — REQ-004 greift nicht).
   Ein nicht unterstütztes Jahr ist ein ehrlicher 400 an der Grenze, nie die Frist eines
   Nachbarjahres. Das `FristenBanner` im Cockpit (Empty- UND Loaded-State) rendert bei `keine`
   NICHTS (ehrliche Abwesenheit, kein Dauer-Banner) und sonst nüchtern mit Frist- und
   Betrags-Angabe.

## Consequences

- **Ehrliche Grenze, einmal benannt:** § 108 Abs. 3 AO (Fristende an Sa/So/Feiertag verschiebt
  sich auf den nächsten Werktag) ist NICHT hier — die Tabelle nennt das Kalenderdatum der
  Regelfrist; die § 108-Verschiebung ist ein benannter Follow-up (dieselbe Feiertags-Grenze wie
  werktage.ts). Die 60-Tage-Schwelle ist die Produkt-Vorgabe aus dem Ticket, keine erfundene.
- **Die Stufen-Logik ist kern-pur getestet**; die Acceptance prüft die Selbstkonsistenz der
  Response (verbleibendeTage = Frist − heute des Servers) statt eines festen Datums — die Stufe
  hängt ehrlich vom echten Server-Tag ab.
- **Kein neuer Steuerjahr-Status, nirgends** — die Warnung kann den Statusfluss nicht berühren;
  ein „verspätet" ist unrepresentable (ADR-0039/ADR-0031 §4-Instinkt).
- **Register:** REQ-027; 10.5/10.6 belegen 025/026 auf den Parallel-Branches — beim Merge auf
  Kollision prüfen (REQ-Nummern sind stabil und werden nie wiederverwendet).

## Alternatives considered

- **`verspätet` als Steuerjahr-Status.** Verworfen: Produkt-ADR-018/ADR-0039 haben das explizit
  ausgeschlossen — ein zeitlicher Zustand darf nie wie ein Steuer-Status aussehen.
- **Die Frist aus „aktuellen" Werten ableiten (heute + X).** Verworfen: Produkt-ADR-022 verlangt
  Jahresregelwerke; eine Ableitung driftet beim Jahreswechsel und bei Gesetzesänderungen still.
- **„Heute" vom Client.** Verworfen: die Client-Uhr ist manipulierbar und zeitversetzt; der
  Server-Stichtag in Europe/Berlin ist die eine ehrliche Quelle.
- **Das Banner in einen eigenen Steuerjahr-Status-Bereich.** Verworfen: das Banner ist
  abgeleitete UI-Wahrheit über dem Status, nicht selbst Status — die Trennung ist die Kontrolle.
