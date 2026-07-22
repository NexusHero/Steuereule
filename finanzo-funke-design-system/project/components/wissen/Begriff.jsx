import React from 'react';

/** „Die Eule erklärt's" — nachschlagbarer Begriff im Fließtext.
    Gepunktete Unterstreichung (bewusst anders als die gestrichelte KI-Linie!),
    Tipp öffnet ein Sheet: 3 warme Sätze, ein Beispiel mit Zahl, optional
    „Frag die Eule" in den Berater. Redaktionelle Fakten → NIE Violett.
    Unsichtbar, wenn man's nicht braucht: kein Auto-Popup, keine Tour.
    Self-contained: nutzt die fk-overlay/fk-sheet-Klassen direkt (kein Cross-Import). */
export function Begriff({ titel, erklaerung, beispiel, frage, onFrage, children }) {
  const [offen, setOffen] = React.useState(false);
  const t = titel || children;
  return (
    <React.Fragment>
      <button className="fk-begriff" onClick={() => setOffen(true)} aria-haspopup="dialog">
        {children}
      </button>
      {offen && ReactDOM.createPortal(
        <div
          className="fk-overlay"
          onClick={(e) => e.target === e.currentTarget && setOffen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setOffen(false)}
          role="presentation"
        >
          <div className="fk-sheet" role="dialog" aria-modal="true" aria-label={typeof t === 'string' ? t : 'Erklärung'}>
            <div className="fk-sheet-grip" aria-hidden="true"></div>
            <div className="fk-sheet-kopf">
              <h2>{t}</h2>
              <button className="fk-schliessen" aria-label="Schließen" onClick={() => setOffen(false)}>✕</button>
            </div>
          <div className="fk-begriff-kopf" aria-hidden="true">
            <svg viewBox="0 0 96 96" width="34" height="34">
              <path d="M20 36 L30 10 L41 24 Z" fill="var(--tinte)"></path>
              <path d="M76 36 L66 10 L55 24 Z" fill="var(--tinte)"></path>
              <rect x="14" y="20" width="68" height="64" rx="30" fill="var(--tinte)"></rect>
              <path d="M48 58 L55 65 L48 74 L41 65 Z" fill="var(--funke)"></path>
              <rect x="42" y="44" width="12" height="6" rx="3" fill="var(--grund)"></rect>
              <circle cx="33" cy="47" r="14" fill="var(--grund)" stroke="var(--funke)" strokeWidth="3.5"></circle>
              <circle cx="63" cy="47" r="14" fill="var(--grund)" stroke="var(--funke)" strokeWidth="3.5"></circle>
              <circle cx="36" cy="45" r="5.5" fill="var(--tinte)"></circle>
              <circle cx="66" cy="45" r="5.5" fill="var(--tinte)"></circle>
            </svg>
            <span className="mono-label">Die Eule erklärt's</span>
          </div>
          <p className="fk-begriff-text">{erklaerung}</p>
          {beispiel && (
            <div className="fk-begriff-beispiel">
              <span className="mono-label">Beispiel</span>
              <b className="num">{beispiel}</b>
            </div>
          )}
          {frage && (
            <button
              className="fk-begriff-frage"
              onClick={() => { setOffen(false); if (onFrage) onFrage(frage); }}
            >
              Noch Fragen? Frag die Eule: „{frage}" →
            </button>
          )}
          </div>
        </div>,
        document.body
      )}
    </React.Fragment>
  );
}
