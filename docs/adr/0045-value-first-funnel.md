# ADR-0045 — Value-First-Funnel: Gast darf das Minimal-Gate, Steuer-ID wird optional, Upgrade nimmt Interview-Antworten mit

- **Status:** Accepted — entschieden vom Nutzer (Stakeholder) am 2026-10-25; Promotion des
  Texts im Review
- **Date:** 2026-10-25
- **Deciders:** NexusHero (Stakeholder-Entscheid „Stufe 2 Value-First-Funnel") — Umsetzung:
  Suhay (agent)
- **Context tags:** funnel, onboarding, identity, data-ownership, honesty principle

## Context

Die App verlangte bisher Konto + Steuer-ID, BEVOR der Nutzer irgendeinen Wert sieht. Der
Stakeholder hat entschieden („Stufe 2 Value-First-Funnel"): der Nutzer soll zuerst Wert erleben —
Gast → Minimal-Gate (drei Fragen) → Cockpit-Spanne → erst DANN die Konto-Wand (Registrierung/
Login) → Profil, und die Steuer-ID darf dabei zunächst fehlen (sie wird später im Profil ergänzt).
Im selben Zug entschied der Stakeholder die Lizenz: **PolyForm Noncommercial 1.0.0** (LICENSE
ersetzt MIT) — eine Stakeholder-Entscheidung, hier referenziert, nicht technisch begründet.

Die Folgen für den Datenfluss: ein Gast, der das Minimal-Gate beantwortet, hat bereits
InterviewAnswer- und TaxYear-Zeilen unter seiner Gast-UserId; der Gast→Konto-Upgrade (REQ-006)
muss diese übernehmen statt sie zu verlieren.

## Decision

1. **Gast darf das Minimal-Gate (Segment 1), sonst nichts.** `InterviewController` verliert das
   pauschale `@RequiresAccount`; `InterviewService` lässt einen Gast NUR für den Eintrag
   `minimal-gate` lesen/schreiben — jeder andere Katalog-Eintrag bleibt 401 (dieselbe Fehlerform
   wie zuvor, ADR-0031 §4: der Zugriffsschutz bleibt serverseitig, nicht im Client).

2. **Steuer-ID wird optional.** `Profile.steuerId` wird nullable (Migration
   `profile_steuer_id_optional`); `PutProfileDto.steuerId` optional, fehlt sie → `null`
   („noch nicht angegeben", nie ein leerer String); Export-Template und Profile-DTOs behandeln
   `null` ehrlich („—"). Die Validierung (`isValidSteuerId`) greift weiterhin für jeden
   angegebenen Wert — optional heißt nur „darf fehlen", nie „darf beliebig sein".

3. **Der Upgrade nimmt die Gast-Antworten mit.** `upgradeGuestToAccount` re-keyed
   `InterviewAnswer`- und `TaxYear`-Zeilen je Steuerjahr auf die Account-UserId; bei Konflikt
   gewinnt das Konto (idempotent — ein zweiter Lauf ändert nichts). Audit-Einträge des
   Interviews wandern mit; der Rest des Gast-Audits bleibt beim Gast-Kontext.

4. **Konto-Wand als Screen.** `KontoWandScreen` sitzt im Funnel-Pfad (Gast → Interview →
   Cockpit-Spanne → Konto-Wand → Profil); „Später"-Pfad bleibt ehrlich sichtbar (der Nutzer
   kann zur Cockpit-Spanne zurück, die Konto-Aufforderung kommt wieder, wenn der Funnel es
   vorsieht).

## Consequences

- REQ-015 (Minimal-Gate) P3 kippt bewusst: der Gast darf das Minimal-Gate — die Acceptance
  (real socket) beweist den neuen Gast-Pfad UND dass Katalog-Einträge für Gäste 401 bleiben.
- REQ-006 (Gast→Konto, atomar) wächst um die Carry-over-Fälle: InterviewAnswer + TaxYear je
  Steuerjahr re-keyed, idempotent, Konflikt-Regel dokumentiert.
- Lizenz: LICENSE ist jetzt PolyForm Noncommercial 1.0.0 — eine rechtliche Stakeholder-
  Entscheidung, die kein Gate berührt (kein Build-Impact, nur Text).
- Die Steuer-ID-Nullability reicht durch Profile-Repository, Export-Report, Onboarding-Mapping
  und die generierten Clients — `null` ist der neue ehrliche „noch nicht angegeben"-Zustand.

## Alternatives considered

- **Gast voll sperren (Status quo).** Verworfen vom Stakeholder: genau der Wert-vor-Konto-
  Einstieg fehlt.
- **Gast darf den ganzen Katalog.** Verworfen: Segment 2 ist noch nicht server-seitig
  zugelassen, und jeder weitere Gast-Zugriff wäre ein Sicherheits- und Datenhygiene-Risiko
  ohne Produkt-Grund.
- **Steuer-ID als leerer String „nicht angegeben".** Verworfen: `null` ist der eine ehrliche
  Zustand; ein leerer String würde die Validierung und den Export umgehen.
- **Upgrade wirft Gast-Antworten weg.** Verworfen: das wäre genau der Wertverlust, den der
  Funnel dem Nutzer zuerst gezeigt hat.
