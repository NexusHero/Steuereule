/**
 * Persistente Berater-Präsenz (Muster B) — kontextbewusst, öffnet den Chat, nie modal.
 */
export interface BeraterLeisteProps {
  /** Kontextsatz, z. B. "Was fehlt noch zur Abgabe? Frag mich." */
  text: string;
  onOeffnen?: () => void;
}
