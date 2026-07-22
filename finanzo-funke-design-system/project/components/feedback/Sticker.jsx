import React from 'react';

/** Erfolgs-Sticker — leicht gedreht, poppt federnd auf. Für Deltas und Funde. */
export function Sticker({ children, style }) {
  return <span className="fk-sticker num" role="status" style={style}>{children}</span>;
}
