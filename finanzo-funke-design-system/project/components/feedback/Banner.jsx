import React from 'react';

/** Semantisches Banner — für Fakten und Warnungen, NIE für KI-Output. */
export function Banner({ art = 'warnung', children }) {
  return (
    <div className={`fk-banner ${art}`} role="alert">
      <span aria-hidden="true">{art === 'gefahr' ? '⚠' : '◔'}</span>
      <span>{children}</span>
    </div>
  );
}
