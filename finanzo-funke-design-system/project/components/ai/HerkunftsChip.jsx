import React, { useState } from 'react';

/** Muster A — jede Zahl ist anfassbar: Beleg, Regel, Rechenweg in einem Popover. */
export function HerkunftsChip({ quelle }) {
  const [offen, setOffen] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button className="fk-chip src" onClick={() => setOffen(!offen)} aria-expanded={offen} style={{ minHeight: 28, fontSize: 12, padding: '2px 10px' }}>
        Herkunft
      </button>
      {offen && (
        <span
          role="dialog"
          aria-label="Herkunft dieses Werts"
          style={{
            position: 'absolute', right: 0, top: '115%', zIndex: 5, width: 240,
            background: 'var(--karte)', border: 'var(--kontur) solid var(--tinte)',
            borderRadius: 'var(--radius-s)', boxShadow: 'var(--schatten-hart)',
            padding: 12, fontSize: 13, display: 'block', textAlign: 'left',
          }}
        >
          {quelle.beleg && (
            <span style={{ display: 'block' }}><b>Beleg:</b> {quelle.beleg}</span>
          )}
          <span style={{ display: 'block' }}><b>Regel:</b> <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 12 }}>{quelle.regel}</span></span>
          {quelle.rechenweg && (
            <span style={{ display: 'block' }}><b>Rechenweg:</b> <span className="num">{quelle.rechenweg}</span></span>
          )}
        </span>
      )}
    </span>
  );
}
