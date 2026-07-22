import React from 'react';

/* Vier der fünf Icon-Pfade stammen 1:1 aus frontend/src/App.tsx des Quell-Repos —
   Funke zeichnet sie kräftiger (2.2 statt 1.8); „jahr" (Kalender) ist eine Funke-Ergänzung. */
const ICONS = {
  cockpit: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z',
  belege: 'M7 3h7l5 5v13H7V3zm7 0v5h5M9 12h8M9 16h8',
  berater: 'M4 5h16v11H8l-4 4V5z',
  jahr: 'M4 5h16v15H4V5zm0 5h16M8 3v4m8-4v4',
  uebertragen: 'M12 4v12m0-12l-5 5m5-5l5 5M4 20h16',
  profil: 'M12 11a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0',
};

/** Schwebende Pillen-Tab-Bar. tabs: [{id, label, icon?}] — icon ist ein Pfad-String oder einer der Schlüssel oben.
    Die Limetten-Pille gleitet mit --feder hinter den aktiven Tab (Rail: vertikal — gleicher Code). */
export function TabBar({ tabs, aktiv, onWechsel }) {
  const innerRef = React.useRef(null);
  const [pille, setPille] = React.useState(null);
  const messen = React.useCallback(() => {
    const inner = innerRef.current;
    const btn = inner && inner.querySelector('[data-tab-aktiv="true"]');
    if (!btn) { setPille(null); return; }
    setPille({ x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight });
  }, []);
  React.useLayoutEffect(messen, [aktiv, tabs.length, messen]);
  React.useEffect(() => {
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [messen]);
  return (
    <nav className="fk-tabbar" aria-label="Hauptnavigation">
      <div className="fk-tabbar-inner" ref={innerRef}>
        {pille && <span className="fk-tab-pille" aria-hidden="true" style={{ transform: `translate(${pille.x}px, ${pille.y}px)`, width: pille.w, height: pille.h }}></span>}
        {tabs.map((t) => {
          const pfad = t.icon || ICONS[t.id];
          const an = aktiv === t.id;
          return (
            <button key={t.id} className="fk-tab" aria-current={an ? 'page' : undefined} data-tab-aktiv={an ? 'true' : undefined} onClick={() => onWechsel(t.id)}>
              {pfad && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={pfad} />
                </svg>
              )}
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
