# 10.2 — Günstigerprüfung Zusammen/Einzel als Screen (M1)

**What to build:** Ein Screen mit **zwei Zahlen + Empfehlung** aus dem
**Veranlagungsartenvergleich** (Engineering-ADR-0034, `packages/core/src/tarif.ts`): Einzel- vs.
Zusammenveranlagung als Diskriminated Union (`eindeutig`/`zu-knapp`/`unbestimmt`). Der Screen
darf laut ADR-0034 erst erscheinen, wenn **mindestens ein echter Eingabepfad `eindeutig`
erreichen kann** — vorher ist er ein Gate, kein Feature.

**Namens-Disziplin (ADR-0034 §1):** Der Begriff **Günstigerprüfung** ist reserviert für die
§ 32d-Ab6-Kapital-Günstigerprüfung (10.5). Dieser Screen zeigt den **Veranlagungsartenvergleich**
— im Code, in Tests und in Prosa nie „Günstigerprüfung" nennen.

**Blocked by:** **15** (Cockpit-Echtdaten + Kern via `berechne`) — die „zwei Zahlen" (zvE einzeln /
zusammen) kommen aus dem deterministischen Posten-Kern, den t15 gerade an den Cockpit verdrahtet.
Zusätzlich: Engineering-Entwurf 0038 (`berechne`) muss promotet sein. Kein Dep auf 10.1.

**Status:** ready-for-agent

- [ ] `veranlagungsartenvergleich` liefert `eindeutig` über mindestens einen echten zvE-Pfad
      (Soli/Kirchensteuer berechnet oder `unschaerfe` bestimmt — ADR-0034 Regel 3)
- [ ] Screen rendert `aussage` zuerst: `eindeutig` zeigt Empfehlung, `zu-knapp`/`unbestimmt`
      zeigt ehrlich „zu knapp, um das zu sagen"/„können wir noch nicht" — nie ein nacktes Urteil
- [ ] Herkunfts-Chips an beiden Zahlen (welche zvE, welche Unschärfe)
- [ ] TDD, typecheck + lint grün, ADR-0034-Folge (falls nötig), Posture-Zeile
