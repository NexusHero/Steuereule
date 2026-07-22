import React from 'react';

/** Fortschrittsbalken — chunky, Tinte-Kontur, Limetten-Füllung. */
export function Balken({ pct, style }) {
  return (
    <span className="fk-balken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ display: 'block', ...style }}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}
