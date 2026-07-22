import React from 'react';

/** Funke-Button — Limette, Tinte-Kontur, harter Schatten. Druck drückt auf den Schatten. */
export function Button({ variante = 'primaer', disabled = false, onClick, style, children, ...rest }) {
  const cls = 'fk-btn' + (variante && variante !== 'primaer' ? ' ' + variante : '');
  return (
    <button className={cls} disabled={disabled} onClick={onClick} style={style} {...rest}>
      {children}
    </button>
  );
}
