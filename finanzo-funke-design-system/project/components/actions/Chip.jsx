import React from 'react';

/** Chip — Pille mit Tinte-Kontur. Als <button> wenn onClick gesetzt, sonst <span>. */
export function Chip({ variante = 'standard', aktiv = false, onClick, style, children, ...rest }) {
  const cls = 'fk-chip' + (variante !== 'standard' ? ' ' + variante : '');
  if (onClick) {
    return (
      <button className={cls} aria-pressed={aktiv || undefined} onClick={onClick} style={style} {...rest}>
        {children}
      </button>
    );
  }
  return <span className={cls + (aktiv ? ' aktiv' : '')} style={style} {...rest}>{children}</span>;
}
