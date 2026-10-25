// Ticket 10.8 (M1) — die Jahresübernahme (Produkt-ADR-021): ein neues Steuerjahr KOPIERT alles
// aus dem Vorjahr, aber jeder kopierte Posten trägt die Herkunft „Übernahme aus {Vorjahr}" und
// gilt als UNBESTÄTIGT, bis er angetippt oder durch einen Beleg gedeckt wird. Unbestätigte
// zählen in die Spanne, nie in den Punktwert — ruhiger Ton (grau), nie ein Konflikt (ADR-008 ist
// für WIDERSPRÜCHE da, nicht für „bitte einmal ansehen").
//
// Pure, no I/O (ADR-0004). Die Persistenz (welche Zeile welchen Vorjahres kopiert wurde) ist die
// API's Sache; dieses Modul ist der deterministische Vertrag des Kopierens/Bestätigens.
import type { Posten } from './berechnung'

/**
 * ADR-021 — der Kopier-Schritt: aus einem Vorjahres-Posten wird der übernommene Posten. Der
 * Betrag, die Einkunftsart und die Rolle bleiben; die Herkunft wird `uebernahme` mit Jahresbezug
 * („Übernahme aus {vorjahr}") und der Posten ist UNBESTÄTIGT, bis ihn jemand antippt oder ein
 * Beleg deckt. `vorjahr` muss ein ganzzahliges Jahr sein — nie ein geratenes Nachbarjahr.
 */
export function uebernommenerPosten(posten: Posten, vorjahr: number): Posten {
  if (!Number.isInteger(vorjahr) || vorjahr < 0) {
    throw new RangeError(`uebernommenerPosten: "${vorjahr}" is not a valid year`)
  }
  return {
    ...posten,
    quelle: { art: 'uebernahme', vorjahr },
    unbestaetigt: true,
  }
}

/**
 * ADR-021 — der Bestätigungs-Schritt (angetippt oder Beleg deckt ihn): der Posten verliert das
 * `unbestaetigt`-Flag, die Herkunft „Übernahme aus {vorjahr}" BLEIBT (eine bestätigte Tatsache
 * ändert ihre Herkunft nicht — dieselbe Regel wie ADR-0012 §4 fürs Audit). Ein bereits
 * bestätigter Posten bleibt unverändert (idempotent).
 */
export function bestaetigePosten(posten: Posten): Posten {
  if (posten.unbestaetigt !== true) return posten
  return { ...posten, unbestaetigt: false }
}

/** ADR-021 — der Herkunfts-Chip: „Übernahme aus {vorjahr}", mit Jahresbezug (ADR-022). */
export function uebernahmeHerkunft(vorjahr: number): string {
  if (!Number.isInteger(vorjahr) || vorjahr < 0) {
    throw new RangeError(`uebernahmeHerkunft: "${vorjahr}" is not a valid year`)
  }
  return `Übernahme aus ${vorjahr}`
}
