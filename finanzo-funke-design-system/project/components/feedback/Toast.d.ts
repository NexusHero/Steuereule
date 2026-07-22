/**
 * Kurzlebige Bestätigung ("Kopiert") — fixed am unteren Rand.
 * Dauer-Regel: ~1,4 s ohne Aktion; ~5 s mit Aktion (z. B. „Rückgängig" nach Löschen).
 */
export interface ToastProps {
  text: string;
  /** Optionales Aktions-Label (z. B. „Rückgängig") — Pflicht nach destruktiven Aktionen. */
  aktion?: string;
  onAktion?: () => void;
}
