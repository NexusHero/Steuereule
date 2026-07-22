import React from 'react';

/** Einstellungszeile mit Titel, Detail und Schalter. */
export function SchalterZeile({ titel, detail, an, onChange }) {
  return (
    <div className="fk-schalter-zeile">
      <div>
        <div className="tt">{titel}</div>
        {detail && <div className="td">{detail}</div>}
      </div>
      <button className="fk-schalter" role="switch" aria-checked={an} aria-label={titel} onClick={() => onChange(!an)}>
        <i />
      </button>
    </div>
  );
}
