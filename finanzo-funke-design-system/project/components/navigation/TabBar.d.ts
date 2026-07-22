/**
 * Schwebende Pillen-Tab-Bar (fixed bottom). Aktiver Tab = Limetten-Pille.
 */
export interface TabBarProps {
  /** icon: SVG-Pfad (24er-Grid) oder weglassen für eingebaute Schlüssel cockpit|belege|berater|uebertragen|profil */
  tabs: { id: string; label: string; icon?: string }[];
  aktiv: string;
  onWechsel: (id: string) => void;
}
