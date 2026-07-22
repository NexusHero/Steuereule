/**
 * Kompakte Pille für Filter, Quellen, Tags und kleine Aktionen.
 */
export interface ChipProps {
  /** 'standard' = weiß · 'src' = Herkunft/Quelle (Limette-weich) · 'pro' = Tinte mit Limetten-Text */
  variante?: 'standard' | 'src' | 'pro';
  /** Gedrückt/ausgewählt — Limetten-Füllung */
  aktiv?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}
