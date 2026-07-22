/**
 * Herkunfts-Chip (Muster A): Provenienz jedes Werts — ein Tap öffnet Beleg, Regel-ID und Rechenweg.
 */
export interface HerkunftsChipProps {
  quelle: {
    /** Quell-Dokument, z. B. "Lohnsteuerbescheinigung 2026" */
    beleg?: string;
    /** Regel-ID, z. B. "WK-PENDLER-01 · Stand 2026" */
    regel: string;
    /** Rechenweg als Text, z. B. "218 Tage × 28 km × 0,30 €" */
    rechenweg?: string;
  };
}
