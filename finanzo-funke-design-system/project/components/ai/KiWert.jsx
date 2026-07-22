import React from 'react';

/** Stufe 3 der KI-Kennzeichnung: ein Wert, den der Berater befüllt hat —
    violette Strichel-Linie + B-Punkt. Nach Nutzer-Bestätigung entfernen. */
export function KiWert({ children, style }) {
  return (
    <span className="fk-ki-wert num" data-ai="true" style={style}>
      <span className="fk-ai-dot" style={{ width: 15, height: 15, fontSize: 9 }} aria-hidden="true">B</span>
      {children}
    </span>
  );
}
