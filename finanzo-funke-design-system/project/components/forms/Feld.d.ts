/**
 * Label-Wrapper für Eingaben, mit Fehlertext-Slot.
 */
export interface FeldProps {
  label: string;
  /** Fehlermeldung unterhalb (semantisches Rot) */
  fehler?: string;
  children: React.ReactNode;
}
