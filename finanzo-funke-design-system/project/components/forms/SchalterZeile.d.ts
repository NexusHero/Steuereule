/**
 * Einstellungszeile mit federndem Schalter (Profil-Screen).
 */
export interface SchalterZeileProps {
  titel: string;
  detail?: string;
  an: boolean;
  onChange: (an: boolean) => void;
}
