import React from 'react';

/** Bottom-Sheet / Modal — schließt per Backdrop-Klick und Escape. */
export function Sheet({ titel, onClose, children }) {
  return (
    <div
      className="fk-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div className="fk-sheet" role="dialog" aria-modal="true" aria-label={titel}>
        <div className="fk-sheet-grip" aria-hidden="true"></div>
        <div className="fk-sheet-kopf">
          <h2>{titel}</h2>
          <button className="fk-schliessen" aria-label="Schließen" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
