import React from 'react';

/** Mono-Metadaten-Pille (Steuerjahr, Zähler) — nie interaktiv. */
export function Pill({ children, style }) {
  return <span className="fk-pill num" style={style}>{children}</span>;
}
