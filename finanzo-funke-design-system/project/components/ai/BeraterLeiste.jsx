import React from 'react';

/** Muster B — der Berater ist auf jedem Screen präsent: schmale violette Leiste, nie modal. */
export function BeraterLeiste({ text, onOeffnen }) {
  return (
    <button className="fk-ai-bar" data-ai="true" onClick={onOeffnen} aria-label={`Berater: ${text}`}>
      <span className="fk-ai-dot" aria-hidden="true">B</span>
      <span>{text}</span>
    </button>
  );
}
