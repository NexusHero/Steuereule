/* Jahr-Tab — der Phasen-Ort: Stepper (Interview → Sammeln → Übertragen → Abgegeben → Bescheid),
   Schnellzugriff Statistik/Alle Jahre, darunter der Inhalt der gewählten Phase. */
const { Chip, Toast } = window.FinanzoFunkeDesignSystem_7e417e;

const JAHR_PHASEN = [
  { id: 'interview', label: 'Interview' },
  { id: 'sammeln', label: 'Sammeln' },
  { id: 'uebertragen', label: 'Übertragen' },
  { id: 'abgegeben', label: 'Abgegeben' },
  { id: 'bescheid', label: 'Bescheid' },
];

function FunkeJahrTab({ zeilen, onToggle, geheZu }) {
  const [fortschritt, setFortschritt] = React.useState(() => {
    try { return localStorage.getItem('funke.jahrPhase') || 'uebertragen'; } catch (e) { return 'uebertragen'; }
  });
  const [ansicht, setAnsicht] = React.useState(fortschritt === 'abgegeben' ? 'abgegeben' : 'uebertragen');
  const [rueckfrage, setRueckfrage] = React.useState('offen'); /* ADR-018: Rückfrage-Zustand nach Abgabe (Demo) */
  const [hinweis, setHinweis] = React.useState(''); /* Inline statt Toast: Lernstoff darf nicht nach 2 s verschwinden */
  const fIdx = JAHR_PHASEN.findIndex((p) => p.id === fortschritt);

  function abgeschickt() {
    setFortschritt('abgegeben');
    setAnsicht('abgegeben');
    try { localStorage.setItem('funke.jahrPhase', 'abgegeben'); } catch (e) {}
  }
  function klick(p, idx) {
    if (idx > fIdx) { setHinweis(p.id === 'bescheid' ? 'Der Bescheid kommt in 4–8 Wochen nach der Abgabe — wir vergleichen ihn dann Zeile für Zeile mit deiner Erklärung.' : 'Dieser Schritt öffnet sich nach der Abgabe.'); return; }
    setHinweis('');
    if (p.id === 'interview') { window.location.href = 'interview.html'; return; }
    if (p.id === 'sammeln') { geheZu('belege'); return; }
    setAnsicht(p.id);
  }

  return (
    <div>
      <div className="fk-karte" style={{ padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono-label">Steuerjahr 2026</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Chip onClick={() => geheZu('statistik')} style={{ minHeight: 32, fontSize: 12 }}>Statistik</Chip>
            <Chip onClick={() => geheZu('jahre')} style={{ minHeight: 32, fontSize: 12 }}>Alle Jahre</Chip>
          </div>
        </div>
        <div className="fx-stepper" role="tablist" aria-label="Phasen des Steuerjahrs">
          {JAHR_PHASEN.map((p, idx) => {
            const done = idx < fIdx;
            const aktuell = idx === fIdx;
            const offen = idx > fIdx;
            return (
              <React.Fragment key={p.id}>
                {idx > 0 && <span className="fx-step-linie" data-offen={idx > fIdx} aria-hidden="true"></span>}
                <button className="fx-step" role="tab" aria-selected={ansicht === p.id || (aktuell && ansicht === 'uebertragen' && p.id === 'uebertragen')} aria-disabled={offen} onClick={() => klick(p, idx)}>
                  <span className="fx-step-kreis" data-done={done} data-aktuell={aktuell} data-offen={offen}>{done ? '✓' : idx + 1}</span>
                  <span className="fx-step-label" style={{ fontWeight: aktuell ? 800 : 600, color: offen ? 'var(--tinte-2)' : 'var(--tinte)' }}>{p.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {hinweis && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', borderTop: '1.5px dashed var(--linie-weich)', marginTop: 10, padding: '10px 2px 2px', fontSize: 13, color: 'var(--tinte-2)' }}>
            <span style={{ flex: 1 }}>{hinweis}</span>
            <button onClick={() => setHinweis('')} aria-label="Hinweis schließen" style={{ fontWeight: 800, color: 'var(--tinte)', minHeight: 32, padding: '0 6px', flex: 'none' }}>×</button>
          </div>
        )}
      </div>

      {ansicht === 'abgegeben'
        ? <div>
            {rueckfrage === 'offen' ? (
              <div className="fk-karte" style={{ borderColor: 'var(--warn)', boxShadow: '4px 4px 0 var(--warn)' }}>
                <span className="mono-label" style={{ color: 'var(--warn)' }}>Rückfrage vom Finanzamt</span>
                <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 22, lineHeight: 1.15, margin: '6px 0' }}>Das Amt will die Fortbildung sehen.</div>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tinte-2)' }}>Nachweis „Rechnung Fortbildung" (890 €) nachreichen · Frist: <b className="num">14 Tage</b>. Ganz normal — dein Bescheid kommt, sobald der Beleg da ist.</p>
                <button onClick={() => setRueckfrage('erledigt')} className="fk-btn fk-btn-leise" style={{ minHeight: 42, width: 'auto', padding: '0 16px', fontWeight: 700, border: 'var(--kontur) solid var(--tinte)', borderRadius: 12, background: 'var(--funke)', boxShadow: 'var(--schatten-hart-s)' }}>Beleg nachreichen (liegt schon in Belege)</button>
              </div>
            ) : (
              <div className="fk-karte" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--ok)', fontWeight: 800 }} aria-hidden="true">✓</span>
                <span style={{ fontSize: 14 }}>Rückfrage beantwortet — der Nachweis ist beim Amt, der Bescheid läuft weiter.</span>
              </div>
            )}
            <FunkeAbgabe onZurueck={() => setAnsicht('uebertragen')} />
          </div>
        : <FunkeUebertragen zeilen={zeilen} onToggle={onToggle} onAbgabe={abgeschickt} />}
    </div>
  );
}
Object.assign(window, { FunkeJahrTab });
