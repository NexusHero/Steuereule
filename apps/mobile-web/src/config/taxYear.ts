export const CURRENT_TAX_YEAR = 2026

/** The years the cockpit offers: the current one and the four before it. */
export const AUSWAHL_STEUERJAHRE: readonly number[] = Array.from({ length: 5 }, (_, i) => CURRENT_TAX_YEAR - i)
