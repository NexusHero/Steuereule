import React from 'react';

/** KI-Absender-Chip — Violett-Territorium, immer mit „B"-Punkt gekennzeichnet. */
export function AiChip({ children, style }) {
  return (
    <span className="fk-ai-chip" data-ai="true" style={style}>
      <span className="fk-ai-dot" style={{ width: 16, height: 16, fontSize: 10 }} aria-hidden="true">B</span>
      {children}
    </span>
  );
}
