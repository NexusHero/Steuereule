/**
 * Primäraktion im Funke-Stil. Genau EIN primärer Button pro Screen.
 */
export interface ButtonProps {
  /** 'primaer' = Limette (Standard) · 'ghost' = weiß · 'leise' = Limette-weich · 'nacht' = Tinte mit Limetten-Text */
  variante?: 'primaer' | 'ghost' | 'leise' | 'nacht';
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}
