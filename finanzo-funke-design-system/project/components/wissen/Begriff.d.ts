/**
 * „Die Eule erklärt's" — nachschlagbarer Fachbegriff im Fließtext.
 * Gepunktete Unterstreichung, Tipp öffnet ein Erklär-Sheet (3 Sätze, Beispiel, Frag-die-Eule).
 * Redaktionelle Fakten — nie Violett, nie automatisch, max. 1–2 pro Screen.
 */
export interface BegriffProps {
  /** Sheet-Titel; Default: der Begriff selbst (children) */
  titel?: string;
  /** Die Erklärung — 3 warme Sätze in du-Form, kein Beamtendeutsch */
  erklaerung: React.ReactNode;
  /** Ein Beispiel mit konkreter Zahl, z. B. „812 € Erträge → 0 € Steuer" */
  beispiel?: string;
  /** Vorbefüllte Berater-Frage für „Frag die Eule" */
  frage?: string;
  /** Callback, der die Frage in den Berater trägt */
  onFrage?: (frage: string) => void;
  /** Der Begriff, wie er im Fließtext steht */
  children: React.ReactNode;
}
