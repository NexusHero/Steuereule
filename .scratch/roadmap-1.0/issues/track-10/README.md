# Track 10 — Phase 2 Verbreiterung: Feinschnitt (Slice 1 = Beleg-Inbox-UI)

Feinschnitt des Phasen-Tickets `../10-p2-verbreiterung.md` in Tracer-Sub-Tickets. Das
Phasen-Ticket bleibt der Zielzustand des ganzen Tracks; diese Dateien sind die
Implementierungs-Slices mit expliziten Blocking-Edges.

**Slice 1 (dieser Lauf) ist 10.1 (Beleg-Inbox-UI, M3)** — siehe `10-1-beleg-inbox-ui.md`. Es ist
das einzige Sub-Ticket, das sofort starten kann: die Beleg-API (`POST/GET /v1/belege` +
`POST /v1/belege/:id/zuordnung` + `art`-Diskriminator) existiert seit P0.4/09, und der
mobile-web-Belege-Screen wird von keinem parallelen Agenten (t15 Cockpit, t16 CH-Screen)
angefasst.

## Blocking-Graph (DAG)

```
15 (Cockpit-Echtdaten + Kern via `berechne`)  ──► 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
   └─ 10.1 (Beleg-Inbox-UI) ──► 10.3 (Bescheid-PDF) · 10.9 (Eulen-Trigger 4)
10.8 (Jahr-Modell / rückwirkende Jahre) ──► 10.7 (Fristen rückwirkender Jahre, soft)
10.2 … 10.8 ──► 10.9 (Eulen-Modus: braucht die Fakten, über die er räsoniert)
```

Der Graph oben zeigt **nur Ticket→Ticket-Kanten**. Die geteilten **ADR-Promotion-Abhängigkeiten**
sind echte Blocker und stehen deshalb als eigene Knoten (nicht nur als Prosa):

```
Draft-Promotionen (Robin-Entwürfe, `adr-check-ignore` — noch nicht in `docs/adr/`):
  `0037` (Einkunftsarten + Steuerjahr-Modell)     ──► 10.4, 10.5, 10.6, 10.8
  `0038` (`berechne`/`PostenKonflikt`/`ki-port`)   ──► 10.2, 10.3, 10.9 (Eulen-Port)
  `0039` (Steuerjahr-Zustandsmaschine)             ──► 10.3, 10.7
  `0040` (Beleg-Posteingang)                       ──► 10.1 (umgesetzt; Jahr-Konflikt-Semantik offen)
Kern-Modul-Kante (Code, kein ADR — ADR-0034 ist promotet, das Modul nicht):
  Tarif-Modul (`veranlagungsartenvergleich`/§ 32a) ──► 10.2 (nur auf `origin/kaan/321`, ungemerged)
```

- **10.1** ist die einzige Wurzel ohne In-Track-Dep (Beleg-API fertig, Screen unbestritten).
- **15 (Cockpit/Kern)** ist die geteilte Abhängigkeit fast alles anderen: 10.2, 10.3, 10.4,
  10.5, 10.6, 10.7, 10.8 brauchen den deterministischen Posten-Kern (`berechne`/`tarif.ts`),
  den t15 gerade an den Cockpit verdrahtet — ohne ihn gibt es keine "zwei Zahlen", keinen
  Bescheid-Abgleich, keine Rentner-/Kapital-/Vermietungs-Posten, keine Frist- und keine
  Jahresübernahme.
- **10.9 (Eulen)** ist der Abschluss: alle vier Auslöser setzen Fakten voraus, die 10.1–10.8
  erst erzeugen, und er hängt zusätzlich am KI-Port (Entwurf 0038) + der offenen
  KI-Datenschutz-Klärung (ADR-048).

## Querschnitts-Blocker (gelten für alle Tickets)

1. **ADR-Drafts aus P0.4, die Musti noch promoten muss** (Robin-Entwürfe, `adr-check-ignore`):
   - `0037-einkunftsarten-steuerjahr-modell` (Einkunftsart-Set + Steuerjahr/Veranlagung) —
     Voraussetzung für 10.4/10.5/10.6/10.8.
   - `0038-berechnungs-kern-ki-port` (`berechne`/`PostenKonflikt`/`ki-port`) — Voraussetzung
     für 10.2/10.3 und den Eulen-Port.
   - `0039-steuerjahr-zustandsmaschine` — Voraussetzung für 10.3 (Bescheid-Verzweigung),
     10.7 (Frist/Abgabe).
   - `0040-beleg-posteingang` — bereits durch die Beleg-API umgesetzt; die offene Frage, ob der
     *Jahr*-Konflikt ein Produkt-Zustand ist, bleibt ein Musti-Review-Punkt für 10.1.
2. **Produkt-ADR-037–042 (Eulen) sind "Vorgeschlagen", nicht "Akzeptiert"** — 10.9 kann erst
   starten, wenn sie akzeptiert sind.
3. **KI-Datenschutz (ADR-048) ist offen** — harte Grenze für 10.9.

## Nummerierungshinweis (Kollision, ADR-0033/0034-Lektion)

Ticket 10 nutzt die **Produkt-ADR-Nummerierung** (2–3 stellig: ADR-007/008/009/021/022/032/033/
034/036/037–042/045), der Engineering-Log die **vierstellige** (ADR-0032/0034/0037–0041). In den
Sub-Tickets ist das wo nötig ausgeschrieben ("Veranlagungsartenvergleich (Engineering-ADR-0034)" vs.
"Kapital (Produkt-ADR-032)"), damit die beiden "Günstigerprüfungen" — § 26 Veranlagungsartenvergleich
vs. § 32d Abs. 6 Kapital-Günstigerprüfung — nie wieder kollidieren.
