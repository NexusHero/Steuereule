/* Abgabe-Abschluss — der emotionale Höhepunkt: alles übertragen, abgeschickt.
   Ein „Zack."-Moment pro Journey: dieser. Danach ehrliche Timeline. */
const { Button, Pill, Sticker, HerkunftsChip } = window.FinanzoFunkeDesignSystem_7e417e;

const SCHRITTE = [
  { wann: 'Heute', was: 'In Mein ELSTER abgeschickt — Werte aus SteuerEule, Zeile für Zeile bestätigt.', status: 'ok' },
  { wann: '4–8 Wochen', was: 'Das Finanzamt prüft. Üblich sind 4–8 Wochen — wir können es nicht beschleunigen, ehrlich.', status: 'laeuft' },
  { wann: 'Danach', was: 'Dein Bescheid kommt. Wir vergleichen ihn kostenlos Zeile für Zeile mit deiner Erklärung — bei Abweichung: Einspruchs-Entwurf.', status: 'offen' },
];

function FunkeAbgabe({ onZurueck }) {
  return (
    <div className="fx-bau">
      <div style={{ textAlign: 'center', padding: '40px 0 8px' }}>
        <Sticker style={{ fontSize: 16 }}>2026 erledigt</Sticker>
        <h1 style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 52, lineHeight: 1, margin: '16px 0 8px' }}>Zack.<br />Drüben.</h1>
        <p style={{ margin: '0 0 4px', color: 'var(--tinte-2)', fontSize: 15 }}>Alle 9 Zeilen übertragen und in Mein ELSTER abgeschickt.</p>
      </div>

      <div className="fk-karte nacht" style={{ textAlign: 'center' }}>
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Eingereicht mit voraussichtlich</span>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 48, color: 'var(--funke)', lineHeight: 1.05, margin: '6px 0' }}>≈ 1.517 €</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <HerkunftsChip quelle={{ regel: 'SCHÄTZ-01 · Stand Abgabe', rechenweg: 'Alle Angaben vollständig — Schätzung auf Basis deiner bestätigten Werte' }} />
        </div>
      </div>

      <div className="fk-karte" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mono-label" style={{ padding: '12px 16px 4px' }}>Wie es weitergeht</div>
        {SCHRITTE.map((s) => (
          <div key={s.wann} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', alignItems: 'baseline' }}>
            <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 11, color: s.status === 'ok' ? 'var(--ok)' : 'var(--tinte-2)', width: 84, flex: 'none', fontWeight: s.status === 'ok' ? 700 : 400 }}>{s.status === 'ok' ? '✓ ' : ''}{s.wann}</span>
            <span style={{ fontSize: 14 }}>{s.was}</span>
          </div>
        ))}
      </div>

      <Button onClick={onZurueck}>Bescheid-Wächter ist aktiv — zur Übersicht</Button>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Wir melden uns, wenn der Bescheid da ist — bis dahin ist hier Ruhe. Verdient.</p>
    </div>
  );
}
Object.assign(window, { FunkeAbgabe });
