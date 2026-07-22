/**
 * Inline-Marker für KI-befüllte Werte (Stufe 3): violette Strichel-Unterlinie + B-Punkt.
 * Verschwindet, sobald der Nutzer den Wert bestätigt — dann ist es sein Wert.
 */
export interface KiWertProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}
