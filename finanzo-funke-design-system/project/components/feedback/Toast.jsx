import React from 'react';

/** Toast — Nacht-Pille mit Limetten-Schatten, poppt federnd auf.
    Mit `aktion` (z. B. „Rückgängig") wird er zur Handlungs-Pille — dann ~5 s zeigen statt ~1,4 s. */
export function Toast({ text, aktion, onAktion }) {
  return (
    <div className="fk-toast" role="status" style={aktion ? { display: 'flex', alignItems: 'center', gap: 12 } : undefined}>
      {text}
      {aktion && (
        <button onClick={onAktion} style={{ color: 'var(--funke)', fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: 3, minHeight: 44, padding: '0 2px', flex: 'none' }}>
          {aktion}
        </button>
      )}
    </div>
  );
}
