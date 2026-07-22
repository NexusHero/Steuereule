import React from 'react';

/** Interview-Antwortoption — gewählt = Limette. */
export function Option({ gewaehlt = false, onClick, children, style }) {
  return (
    <button className="fk-opt" aria-pressed={gewaehlt} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
