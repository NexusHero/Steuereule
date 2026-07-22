/* Beleg-Scan — Kamera-Mock (Nacht) → Extraktion → KI-Vorschlag (Stufe 2). Alles Demo.
   Zwei Scan-Typen: Beleg und Lohnsteuerbescheinigung (befüllt Anlage N auf einmal). */
const { Button, Chip, AiChip, Sticker } = window.FinanzoFunkeDesignSystem_7e417e;

const SCAN_DATEN = {
  beleg: {
    label: 'Beleg scannen',
    titel: 'Rechnung „Monitor 27″"',
    kv: [['Betrag', '289,00 €'], ['Datum', '02.05.2026'], ['Aussteller', 'Techmarkt GmbH']],
    konf: 94, ziel: 'Anlage N · Zeile 42',
    weil: 'weil ein Monitor als Arbeitsmittel zählt — über 800 € würde er abgeschrieben, hier nicht nötig',
    cta: 'Übernehmen (+87 €)', sticker: '+87 € drin', titelFertig: 'Übernommen.',
    fertigText: 'In der echten App liegt der Beleg jetzt bestätigt in „Belege" — Herkunft inklusive. (Demo: simuliert.)',
  },
  lstb: {
    label: 'Lohnsteuerbescheinigung',
    titel: 'Lohnsteuerbescheinigung 2026',
    kv: [['Bruttoarbeitslohn', '54.320,00 €'], ['Lohnsteuer', '9.184,00 €'], ['Sozialversicherung', '11.240,00 €']],
    konf: 99, ziel: 'Anlage N · Zeilen 31–46',
    weil: 'weil eTIN und Arbeitgeber zu deinem Profil passen — 6 Felder werden auf einmal befüllt',
    cta: 'Alle 6 Felder übernehmen', sticker: '6 Felder befüllt', titelFertig: 'Vorbefüllt.',
    fertigText: 'Anlage N ist vorbefüllt — jede Zeile behält ihre Herkunft und bleibt einzeln änderbar. (Demo: simuliert.)',
  },
};

function FunkeScan({ onZurueck }) {
  const [phase, setPhase] = React.useState('kamera'); // kamera → lesen → vorschlag → fertig
  const [typ, setTyp] = React.useState('beleg');
  const [quelle, setQuelle] = React.useState('kamera'); // kamera | datei
  const d = SCAN_DATEN[typ];

  React.useEffect(() => {
    if (phase === 'lesen') {
      const t = setTimeout(() => setPhase('vorschlag'), 1800);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (phase === 'kamera' || phase === 'lesen') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--nacht)', color: 'var(--nacht-text)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: '2px solid var(--nacht-text)', borderRadius: 999, color: 'var(--nacht-text)', fontWeight: 800 }}>←</button>
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>{phase === 'lesen' ? 'Lese Dokument …' : d.label}</span>
          <span style={{ width: 44 }}></span>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 24px' }}>
          <div style={{ position: 'relative', height: '100%', maxHeight: 400, aspectRatio: typ === 'lstb' ? '3/4.2' : '3/4', maxWidth: '100%' }}>
            <div aria-hidden="true" style={{ position: 'absolute', inset: 18, background: '#f4efe2', borderRadius: 8, transform: phase === 'lesen' ? 'rotate(0deg)' : 'rotate(-2deg)', transition: 'transform 0.4s var(--feder)', padding: 16 }}>
              <i style={{ display: 'block', height: 6, background: '#c9c2ae', margin: '0 0 10px', borderRadius: 3, width: '70%' }}></i>
              <i style={{ display: 'block', height: 6, background: '#c9c2ae', margin: '0 0 10px', borderRadius: 3 }}></i>
              <i style={{ display: 'block', height: 6, background: '#c9c2ae', margin: '0 0 10px', borderRadius: 3, width: '55%' }}></i>
              <i style={{ display: 'block', height: 6, background: '#c9c2ae', borderRadius: 3, width: '40%' }}></i>
            </div>
            {[
              { top: 0, left: 0, borderWidth: '5px 0 0 5px' },
              { top: 0, right: 0, borderWidth: '5px 5px 0 0' },
              { bottom: 0, left: 0, borderWidth: '0 0 5px 5px' },
              { bottom: 0, right: 0, borderWidth: '0 5px 5px 0' },
            ].map((p, n) => (
              <i key={n} aria-hidden="true" style={{ position: 'absolute', width: 34, height: 34, borderStyle: 'solid', borderColor: 'var(--funke)', borderRadius: 4, ...p }}></i>
            ))}
            {phase === 'lesen' && <i aria-hidden="true" className="fx-scanlinie"></i>}
          </div>
        </div>

        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 'none' }}>
          {phase === 'kamera' && (
            <div style={{ display: 'flex', gap: 8 }} role="tablist" aria-label="Scan-Typ wählen">
              {Object.entries(SCAN_DATEN).map(([k, v]) => (
                <button key={k} onClick={() => setTyp(k)} aria-pressed={typ === k} style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, border: '2px solid ' + (typ === k ? 'var(--funke)' : 'var(--nacht-karte)'), background: typ === k ? 'var(--funke)' : 'transparent', color: typ === k ? '#191b12' : 'var(--nacht-text)' }}>
                  {k === 'beleg' ? 'Beleg' : 'Lohnsteuerbescheinigung'}
                </button>
              ))}
            </div>
          )}
          {phase === 'kamera' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setPhase('lesen')} aria-label="Auslösen" style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--funke)', border: '4px solid var(--nacht-text)', boxShadow: '0 0 0 4px var(--funke-tinte)', flex: 'none' }}></button>
              <button onClick={() => { setQuelle('datei'); setPhase('lesen'); }} style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, fontSize: 14, fontWeight: 700, border: '2px solid var(--nacht-karte)', color: 'var(--nacht-text)', background: 'transparent' }}>Ohne Kamera: PDF oder Foto hochladen</button>
            </div>
          ) : (
            <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>{quelle === 'datei' ? 'Lese PDF … ' : ''}{typ === 'lstb' ? 'Brutto · Lohnsteuer · SV-Beiträge …' : 'Betrag · Datum · Aussteller …'}</span>
          )}
          <span style={{ fontSize: 12, opacity: 0.6, textAlign: 'center' }}>Verschlüsselt verarbeitet, nur für deine Erklärung — löschbar mit einem Tap. PDF, JPG und PNG — auch mehrseitig.</span>
        </div>
      </div>
    );
  }

  if (phase === 'vorschlag') {
    return (
      <div className="fx-schritt" key="vorschlag">
        <div className="appbar">
          <h1>Gefunden.</h1>
          <Sticker style={{ fontSize: 13 }}>{typ === 'lstb' ? '1 Bescheinigung' : '1 Beleg'}</Sticker>
        </div>
        <div className="fk-karte">
          <b style={{ fontSize: 15 }}>{d.titel}</b>
          {d.kv.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px dashed var(--linie-weich)', padding: '6px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--tinte-2)' }}>{k}</span><b className="num">{v}</b>
            </div>
          ))}
          <div className="fk-ai-karte" data-ai="true" style={{ margin: '12px 0 0', padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <AiChip>Vorschlag · {d.konf} %</AiChip>
              <b style={{ fontSize: 14, color: 'var(--ki-tinte)' }}>{d.ziel}</b>
            </div>
            <p style={{ margin: '8px 0 10px', fontSize: 13, color: 'var(--ki-tinte)' }}>{d.weil}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variante="leise" style={{ minHeight: 42, width: 'auto' }} onClick={() => setPhase('fertig')}>{d.cta}</Button>
              <Button variante="ghost" style={{ minHeight: 42, width: 'auto' }} onClick={onZurueck}>Trifft nicht zu</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fx-schritt" key="fertig" style={{ textAlign: 'center', paddingTop: 60 }}>
      <Sticker style={{ fontSize: 16 }}>{d.sticker}</Sticker>
      <h1 style={{ fontSize: 36, fontWeight: 800, margin: '18px 0 8px' }}>{d.titelFertig}</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--tinte-2)' }}>{d.fertigText}</p>
      <Button onClick={() => setPhase('kamera')}>Nächstes Dokument scannen</Button>
      <Button variante="ghost" style={{ marginTop: 10 }} onClick={onZurueck}>Fertig</Button>
    </div>
  );
}
Object.assign(window, { FunkeScan });
