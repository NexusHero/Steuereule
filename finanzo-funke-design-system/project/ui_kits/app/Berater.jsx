/* Berater (F5) — gegründeter Chat mit Quellen-Chips, Vorschlags-Chips, Quota. */
const { Button, Chip, Pill, AiChip, Input } = window.FinanzoFunkeDesignSystem_7e417e;

const FUNKE_VORSCHLAEGE = ['Was fehlt zur Abgabe?', 'Homeoffice erklären', 'Grenzgänger-Status?'];

function FunkeBerater({ chat, onFrage }) {
  const [text, setText] = React.useState('');
  const [abruf, setAbruf] = React.useState(false);

  /* Eulen-Modus (ADR-037/038): ein Wesen — segmentierte Weiche statt versteckter Chip */
  const eulenZahl = (window.FunkeEulenFunde ? window.FunkeEulenFunde.length : 4) + 1;
  const weiche = (
    <div role="tablist" aria-label="Berater-Modus" style={{ display: 'flex', gap: 4, border: '1.5px solid var(--linie-weich)', borderRadius: 14, padding: 4, margin: '0 0 14px', background: 'var(--flaeche)' }}>
      <button role="tab" aria-selected={!abruf} onClick={() => setAbruf(false)} style={{ flex: 1, minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, background: !abruf ? 'var(--tinte)' : 'transparent', color: !abruf ? 'var(--papier)' : 'var(--tinte-2)' }}>Fragen</button>
      <button role="tab" aria-selected={abruf} onClick={() => { if (window.funkeEulenAn && !window.funkeEulenAn()) window.funkeSetEulenAn(true); setAbruf(true); }} style={{ flex: 1, minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: abruf ? 'var(--ki)' : 'transparent', color: abruf ? '#fff' : 'var(--ki)' }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: abruf ? '#fff' : 'var(--ki)', flex: 'none' }}></span>Eule fragt dich · {eulenZahl}</button>
    </div>
  );
  if (abruf) {
    return (
      <div>
        <div className="appbar">
          <h1>Berater</h1>
          <Pill>Unbegrenzt · kostenlos</Pill>
        </div>
        {weiche}
        <window.FunkeEulenAbruf onSchliessen={() => setAbruf(false)}></window.FunkeEulenAbruf>
      </div>
    );
  }

  function senden(f) {
    const frage = (f || '').trim();
    if (!frage) return;
    onFrage(frage);
    setText('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '70vh' }}>
      <div className="appbar">
        <h1>Berater</h1>
        <Pill>Unbegrenzt · kostenlos</Pill>
      </div>
      {weiche}

      <div role="log" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {chat.map((m, i) => (
          <div
            key={i}
            className="fx-bubble"
            data-ai={m.rolle === 'assistant' ? 'true' : undefined}
            style={
              m.rolle === 'user'
                ? { alignSelf: 'flex-end', maxWidth: 'min(85%, 480px)', background: 'var(--funke)', color: '#191b12', border: 'var(--kontur) solid var(--tinte)', borderRadius: '18px 18px 4px 18px', padding: '10px 16px', fontSize: 15, boxShadow: 'var(--schatten-hart-s)' }
                : { alignSelf: 'flex-start', maxWidth: 'min(85%, 480px)', background: 'var(--ki-weich)', border: 'var(--kontur) solid var(--ki)', borderRadius: '18px 18px 18px 4px', padding: '10px 16px', fontSize: 15, boxShadow: 'var(--schatten-ki)', color: 'var(--ki-tinte)' }
            }
          >
            {m.rolle === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13, fontWeight: 700 }}>
                <span className="fk-ai-dot" style={{ width: 18, height: 18, fontSize: 11 }} aria-hidden="true">B</span>
                Berater
              </div>
            )}
            {m.text}
            {m.quellen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {m.quellen.map((q) => <Chip key={q} variante="src" style={{ minHeight: 28, fontSize: 12 }}>{q}</Chip>)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 0 10px', scrollbarWidth: 'none' }}>
        {FUNKE_VORSCHLAEGE.map((v) => <Chip key={v} onClick={() => senden(v)} style={{ flex: 'none' }}>{v}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input placeholder="Frag zu deinem Steuerjahr …" value={text} onChange={setText} onKeyDown={(e) => e.key === 'Enter' && senden(text)} aria-label="Frage an den Berater" />
        <Button style={{ width: 'auto', flex: 'none', padding: '0 22px' }} onClick={() => senden(text)} aria-label="Senden">→</Button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center', margin: '10px 0 0' }}>
        Vorschläge auf Basis deiner Unterlagen — kein Ersatz für Rechts- oder Steuerberatung.
      </p>
    </div>
  );
}
Object.assign(window, { FunkeBerater });
