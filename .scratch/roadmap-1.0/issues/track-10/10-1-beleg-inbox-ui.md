# 10.1 — Beleg-Inbox-UI ganzjährig (M3) — Slice 1 dieses Laufs

**What to build:** Der mobile-web-Belege-Tab wird real: die Inbox zeigt alle Belege aus
`GET /v1/belege`, jeder Beleg rendert seinen abgeleiteten Zuordnungs-Zustand ehrlich
(`ungebunden` / `vorgeschlagen` / `zugeordnet` / `konflikt`), der Vorschlag ist ein Vorschlag
(„Regel: Zahlungsdatum"-Chip + Tap bestätigt, Produkt-ADR-007), ein Konflikt ist ein sichtbarer
Zustand statt stillem Überschreiben (Produkt-ADR-008), und die `art` (CH-Typen aus 09,
REQ-019) wird angezeigt. Der Tab ist **ganzjährig** (kein Saison-Gate — die Inbox ist immer da).

**Ehrliche Grenze (Produkt-ADR-032):** Beleg-*Scan*/PDF-Upload ist bewusst Folge-Ticket
(ADR-036/045 — Binary-Speicherung + Kamera/OCR). Der Screen zeigt das ehrlich als
„Scan folgt"-Platzhalter, KEIN Fake-Upload-Button, der eine Binary-Speicherung verspricht, die
es nicht gibt. `POST /v1/belege` (Metadaten, `dateiname` + optional `art`/Daten) ist die
bestehende API-Schnittstelle, kein neuer Binary-Endpoint.

**Blocked by:** nichts In-Track — die Beleg-API existiert seit P0.4/09 (`beleg.ts`/`belegart.ts`
in core, `apps/api/src/beleg/*`), und der Belege-Screen wird von t15/t16 nicht angefasst.

**Status:** in-progress (dieser Lauf)

- [ ] Belege-Tab in der mobile-web-Tab-Bar (Icon `TAB_ICON_PATHS.belege`), ganzjährig sichtbar
- [ ] Inbox rendert `GET /v1/belege` mit ehrlichen Lade-/Leer-/Fehlerzuständen (nie Mock-Daten)
- [ ] `vorgeschlagen`: Herkunfts-Chip „Regel: Zahlungsdatum"/„Belegdatum" + Tap bestätigt via
      `POST /v1/belege/:id/zuordnung` — Zuordnung ist Vorschlag, nicht Zwang (ADR-007)
- [ ] `konflikt`: beide Jahre sichtbar (zugeordnet vs. Vorschlag), Amber statt Rot — sichtbar,
      nie stilles Überschreiben (ADR-008)
- [ ] `art`-Anzeige: CH-Typen (Lohnausweis/Quellensteuer/PK/3a/KK/Zulagen/Sonstiges) als Chip,
      `null` = generischer Beleg (nicht "noch nicht klassifiziert" verschleiern)
- [ ] Upload-Affordanz ehrlich: „Scan folgt" statt Fake-Scan-Button (ADR-032 §2)
- [ ] MSW-Tests gegen die orval-generierte Beleg-Client-API + App-Flow-Test (Tab → Screen)
- [ ] TDD rot→grün, `typecheck` + `pnpm lint` grün, warum-Kommentare, Posture-Zeile
