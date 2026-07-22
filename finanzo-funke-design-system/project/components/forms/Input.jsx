import React from 'react';

/** Texteingabe — 2px Tinte-Kontur, Fokus bekommt harten Schatten. */
export function Input({ type = 'text', value, onChange, placeholder, style, ...rest }) {
  return (
    <input
      className="fk-input"
      type={type}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      style={style}
      {...rest}
    />
  );
}
