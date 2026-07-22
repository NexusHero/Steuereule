import React from 'react';

/** Vollständigkeits-Ring — conic-gradient in Limette, Prozent im Kern. */
export function Ring({ pct }) {
  return (
    <div
      className="fk-ring"
      role="img"
      aria-label={`Gesamtfortschritt ${pct} Prozent`}
      style={{ background: `conic-gradient(var(--funke) 0 ${pct}%, var(--linie-weich) ${pct}% 100%)` }}
    >
      <div className="num">{pct} %</div>
    </div>
  );
}
