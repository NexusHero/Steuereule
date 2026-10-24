# ADR-0044 — Rentner-Vertikale: Rentenart, gesetzliche Tabellen, Anlage-R-Faltung (Entwurf)

- **Status:** Accepted — promoted 2026-10-24 (reviewed as part of the ticket reviews; Musti)
- **Date:** 2026-10-24
- **Deciders:** Robin (backend, Ticket 10.4) — draft; promotion needs Musti review
- **Implements** Produkt-ADR-034 (Rentner in 1.0, Anlage R), Produkt-ADR-036 §3 (5 Rentenarten),
  Produkt-ADR-030 (frei kombinierbar), Produkt-ADR-032 (kein fabricated zero)
- **Builds on** ADR-0037 (Einkunftsart-Set), ADR-0038 (`berechne`/`Posten`/`Quelle`), ADR-0041
  (LStB-/Angestellte-Vertikale), ADR-0042 (Grenzgänger-CH-Vertikale)
- **Context tags:** architecture, rentner, anlage-r, determinism boundary, honesty principle, security

## Context

Die Rente wird in 1.0 eine vollwertige Einkunftsart (Produkt-ADR-034): gesetzliche Rente +
Betriebsrente (Anlage R), der Besteuerungsanteil automatisch nach dem Rentenbeginn-Jahr, frei
kombinierbar mit allen anderen Einkunftsarten (Rentner mit Vermietung/Kapital ist der Normalfall).
Die Interview-Antwort „Rente" existiert bereits im Minimal-Gate (ADR-0037 hat `Rente` als
Einkunftsart promotet); was fehlt, ist der Posten-/Anlage-R-Ausbau: die geführte Datenschnittstelle
für die Rentenbezugsmitteilung, die zwei gesetzlichen Prozent-Tabellen, und die Faltung des
steuerpflichtigen Anteils in den deterministischen Kern.

## Decision

Ein reines, UI-freies Modul `packages/core/src/rente.ts` (ADR-0004, kein I/O), plus eine Belegart-
Erweiterung, plus der übliche API-/Screen-Ausbau:

1. **`Rentenart`-Vokabular (Produkt-ADR-036 §3)** — die fünf Rentenarten als geschlossene Union
   (`GesetzlicheRente`, `Betriebsrente`, `PrivateRentenversicherung`, `WitwenWaisenrente`,
   `AuslaendischeRente`), deutsche Domain-Werte byte-gleich zur Produkt-ADR (ADR-0033-Zitatform).
   Alle fünf sind Anlage-R-fähig.

2. **Zwei gesetzliche Tabellen, VERBATIM (kein ausgedachter Prozentsatz, Produkt-ADR-032):**
   - `besteuerungsanteilProzent(rentenbeginnJahr)` — die Kohorten-Tabelle (§ 22 Nr. 1 Satz 3
     Buchst. a Doppelbuchst. aa EStG), bis einschließlich 2005 = 50 %, 2006–2058 explizit, nach 2058
     → **offen** (`null`), nie geraten: das Wachstumschancengesetz hat den Endpunkt bereits einmal
     verschoben (2040 → 2058), ein späteres Jahr ist nie ein geratener Wert.
   - `ertragsanteilProzent(vollendetesLebensjahr)` — die Ertragsanteil-Tabelle (§ 22 Nr. 1 Satz 3
     Buchst. a Doppelbuchst. bb EStG) für die private Rentenversicherung, „ab 97" = 1 %.
   Die Tabellen sind als explizite Daten gespeichert, nicht als abgeleitete Arithmetik — der Test
   pinnt die Grenzwerte des Gesetzes selbst.

3. **Geführte Datenschnittstelle (`RentenDaten`)** — Rentenart (null = noch nicht gewählt),
   Jahresbetrag, Rentenbeginn-Jahr (Besteuerungsanteil-Pfad) und Rentenbeginn-Lebensalter
   (Ertragsanteil-Pfad), jeweils `erfasst`/`offen`/`unklar` (dieselbe Ehrlichkeits-Zustandsmaschine
   wie `lstb.ts`). Serialisierung in EINER Stelle (`null`/`unklar`/Zahl-String), damit Repository
   und Tests nie auseinanderlaufen (ADR-0033-Ein-Regel-Instinkt).

4. **Anlage-R-Faltung (`renteAlsKernposten`/`renteStand`)** — der steuerpflichtige Anteil
   (Jahresbetrag × Anteil, auf ganze Euro gerundet) wird ein `Posten` der Einkunftsart `Rente` mit
   `Quelle: { art: 'regel', regel: '§ 22 … — Besteuerungs-/Ertragsanteil … %' }` (Herkunft, ADR-014/
   015). Fehlt ein Pflichtfeld oder liegt das Jahr außerhalb der Tabelle, ist das Ergebnis **offen**
   mit einem offenen Posten — nie eine erfundene Null. `renteStand` faltet über `berechne` (ADR-0038)
   und reicht `gegated` unverändert durch, sodass ein Rentner mit zusätzlich gegatetem
   Gewerbe/Krypto weiterhin `offen` liest (ADR-030/034-Kombinierbarkeit).

5. **`Rentenbezugsmitteilung` als Belegart** — die `Belegart`-Union (ADR-0040/0042) wächst um einen
   Wert, kein Rename, keine Semantik-Änderung der bestehenden Werte.

6. **API (`Rente`-Modul) + Screen** — `GET`/`PUT /v1/steuerjahre/{jahr}/rente[/(art|{feld})]`, eine
   Zeile pro `(userId, steuerjahr)`, `rentenart` als Klartext-Diskriminator (wie `Beleg.art`), die
   drei Zahlen feldencrypted at rest (ADR-0008). Der Screen ist der geführte Fallback (ADR-036
   Scan-Fallback), Scan/OCR außerhalb des Slices (ADR-045).

## Consequences

- **Ehrliche Grenze, einmal benannt:** der steuerpflichtige Anteil ist der einzig faltbare Posten;
  die Tarif-/Günstigerprüfung über diesen Anteil ist der Steuerformel-Slice, nicht hier. Was nicht
  ermittelbar ist, ist `offen`, nie ein geratener Punktwert.
- **CH AHV** wird als „ausländische Rente" mit dem Besteuerungsanteil behandelt (vergleichbar mit
  einer deutschen gesetzlichen Rente); der CHF→EUR-Umrechnungsweg über den bestehenden
  Wechselkurs-Kern (ADR-0042/Produkt-ADR-012) ist ein eigener späterer Schritt — hier wird der
  Jahresbetrag in EUR erfasst.
- **Mehrere gleichzeitige Renten** (gesetzlich + Betriebsrente + …) sind die 1.0-Einschränkung: die
  Datenschnittstelle hält EINE Rente pro `(userId, steuerjahr)`. Der Kern ist so geschnitten, dass
  eine Listen-Erweiterung den `Posten`-Vertrag nicht bricht — ein benannter Follow-up, keine
  stille Lücke.
- **Security posture:** `rentenart` ist ein Klartext-Diskriminator (kein joinbares PII); die drei
  Zahlen (Jahresbetrag = Einkommen, Rentenbeginn-Jahr/-Alter = steuerfixierende Fakten) sind
  field-encrypted at rest (ADR-0008); WRITE/READ auditiert (REQ-004). Kein Performance-Achse.

## Alternatives considered

- **Prozentsätze per Formel ableiten statt als Tabelle speichern.** Verworfen: eine explizite
  Tabelle ist reviewbar und „kein ausgedachter Prozentsatz" ist die belastbare Eigenschaft; eine
  Formel ist anfällig für Off-by-one und driftet leichter vom Gesetz.
- **Mehrere Renten pro Jahr als JSON-Spalte.** Verworfen: bricht das feldverschlüsselte Spalten-
  Muster und die `(userId, steuerjahr)`-Eindeutigkeit; als benannter Follow-up verschoben.
- **Ertragsanteil weglassen und privat immer „offen".** Verworfen: Produkt-ADR-036 §3 nennt die
  private Rentenversicherung explizit als 1.0-Rentenart, und die Tabelle ist zitierbar — „offen"
  wäre hier eine vermeidbare Lücke, keine Ehrlichkeit.
