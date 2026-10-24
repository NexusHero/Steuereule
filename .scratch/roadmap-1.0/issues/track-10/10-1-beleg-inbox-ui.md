# 10.1 — Beleg-Inbox-UI ganzjährig (M3) — Slice 1 dieses Laufs

**What to build:** Der mobile-web-Belege-Tab wird real: die Inbox zeigt alle Belege aus
`GET /v1/belege`, jeder Beleg rendert seinen abgeleiteten Zuordnungs-Zustand ehrlich
(`ungebunden` / `vorgeschlagen` / `zugeordnet` / `konflikt`), der Vorschlag ist ein Vorschlag
(„Regel: Zahlungsdatum"-Chip + Tap bestätigt, Produkt-ADR-007), ein Konflikt ist ein sichtbarer
Zustand statt stillem Überschreiben (Produkt-ADR-008) und **in beide Richtungen auflösbar**
(Vorschlag übernehmen ODER „bei meinem Jahr bleiben" = Vorschlag verwerfen — kein
Sackgassen-Zustand), und die `art` (CH-Typen aus 09, REQ-019) wird angezeigt. Der Tab ist
**ganzjährig** (kein Saison-Gate — die Inbox ist immer da). **Draft `0040-beleg-posteingang`
(offen):** ob der *Jahr*-Konflikt überhaupt ein Produkt-Zustand ist, bleibt ein
Musti-Review-Punkt — die UI nennt den Zustand als solchen, nicht als gesetztes Recht.

**Ehrliche Grenze (Produkt-ADR-032):** Beleg-*Scan*/PDF-Upload ist bewusst Folge-Ticket
(ADR-036/045 — Binary-Speicherung + Kamera/OCR). Der Screen zeigt das ehrlich als
„Scan folgt"-Platzhalter, KEIN Fake-Upload-Button, der eine Binary-Speicherung verspricht, die
es nicht gibt. `POST /v1/belege` (Metadaten, `dateiname` + optional `art`/Daten) ist die
bestehende API-Schnittstelle, kein neuer Binary-Endpoint.

**Blocked by:** nichts In-Track — die Beleg-API existiert seit P0.4/09 (`beleg.ts`/`belegart.ts`
in core, `apps/api/src/beleg/*`), und der Belege-Screen wird von t15/t16 nicht angefasst.

**Status:** ready-for-review (Musti-REQUEST-CHANGES-Fixes eingearbeitet: Draft-`0040`-Qualifizierung +
beidseitige Konflikt-Auflösung — „bei meinem Jahr bleiben")

- [x] Belege-Tab in der mobile-web-Tab-Bar (Icon `TAB_ICON_PATHS.belege`), ganzjährig sichtbar
- [x] Inbox rendert `GET /v1/belege` mit ehrlichen Lade-/Leer-/Fehlerzuständen (nie Mock-Daten)
- [x] `vorgeschlagen`: Herkunfts-Chip „Regel: Zahlungsdatum"/„Belegdatum" + Tap bestätigt via
      `POST /v1/belege/:id/zuordnung` — Zuordnung ist Vorschlag, nicht Zwang (ADR-007)
- [x] `konflikt`: beide Jahre sichtbar (zugeordnet vs. Vorschlag), Amber statt Rot — sichtbar,
      nie stilles Überschreiben (ADR-008); Auflösung in **beide** Richtungen (Vorschlag übernehmen
      ODER „bei meinem Jahr bleiben" = Vorschlag verwerfen, kein Sackgassen-Zustand). **Offen:
      die Produkt-Semantik des Jahr-Konflikts („ist der Jahr-Konflikt überhaupt ein
      Produkt-Zustand?") bleibt offen (Draft `0040-beleg-posteingang`)** — im UI als solcher
      benannt, nicht als gesetztes Recht.
- [x] `art`-Anzeige: CH-Typen (Lohnausweis/Quellensteuer/PK/3a/KK/Zulagen/Sonstiges) als Chip,
      `null` = generischer Beleg (nicht "noch nicht klassifiziert" verschleiern)
- [x] Upload-Affordanz ehrlich: „Scan folgt" statt Fake-Scan-Button (ADR-032 §2)
- [x] MSW-Tests gegen die orval-generierte Beleg-Client-API + App-Flow-Test (Tab → Screen)
- [x] TDD rot→grün, `typecheck` + `pnpm lint` grün, warum-Kommentare, Posture-Zeile
