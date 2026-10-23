# 09 — Phase 1b: Grenzgänger-CH-Vertikale (paralleler Track)

**What to build:** Der Differenzierer (Marktanalyse: „Grenzgänger-Nische") läuft parallel
auf demselben Kern: Lohnausweis-Scan, Quellensteuer, PK, Säule 3a, Krankenkasse, Zulagen
(ADR-029, volle Tiefe), CHF-Führung (ADR-036), Wechselkurs amtlich als Standard (ADR-012).
Beweis, dass der geteilte Kern zwei komplett verschiedene Fallwelten trägt.

**Blocked by:** 05 — Phase 0.5: Mantel-Abschluss · 06 — Infra-Track: #292

**Status:** ready-for-agent

- [ ] CH-Datenquellen auf der Beleg-Posteingang-Schnitt (0.4): Lohnausweis-Scan,
      Quellensteuer-Belege, PK/3a/KK-Nachweise — Zuordnung als Vorschlag, Konflikt sichtbar
      (ADR-007/008)
- [ ] CH-Interview auf der Interview-Engine: CHF führt, 5 Rentenarten/10er-Katalog
      (ADR-036) nur soweit in dieser Phase gefordert
- [ ] Quellensteuer-/PK-/Zulagen-Berechnung über den deterministischen Kern; Wechselkurs
      amtlich als Default, tatsächlich als belegpflichtige Option (ADR-012)
- [ ] Plausibilitäts-Prüfung (M2) deckt CH-Fälle mit ab; gemeinsames Kern-Review-Gate mit
      Track 1a gegen Divergenz (ADR-0015-Lehre)
- [ ] Register: CH-REQs angelegt und nach REQ-DoD abgenommen

_Phasen-Ticket: wird beim Start per `to-spec`/`to-tickets` fein geschnitten (D11)._
