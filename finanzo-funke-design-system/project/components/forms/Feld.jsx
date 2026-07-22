import React from 'react';

/** Beschriftetes Formularfeld mit optionalem Fehlertext. */
export function Feld({ label, fehler, children }) {
  return (
    <div className="fk-feld">
      <label>{label}</label>
      {children}
      {fehler && <p className="fk-fehler-text">{fehler}</p>}
    </div>
  );
}
