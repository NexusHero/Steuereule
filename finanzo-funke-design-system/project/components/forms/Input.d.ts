/**
 * Texteingabe im Funke-Stil.
 */
export interface InputProps {
  type?: string;
  value?: string;
  /** Erhält direkt den String-Wert, kein Event */
  onChange?: (wert: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}
