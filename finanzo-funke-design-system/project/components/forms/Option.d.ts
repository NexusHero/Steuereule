/**
 * Antwortoption im Interview (eine Frage pro Screen).
 */
export interface OptionProps {
  /** Ausgewählt — Limetten-Füllung + Schatten */
  gewaehlt?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}
