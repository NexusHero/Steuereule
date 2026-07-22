/* Paywall — Abgabe-Paket mit echtem Kauf-Flow: Angebot → Zahlung (Sheet) → freigeschaltet.
   Fehlerzustand demonstriert: Karte schlägt fehl (Demo), Apple/Google Pay gelingen. */
const { Button, Chip, Pill, Sheet, Banner, Sticker } = window.FinanzoFunkeDesignSystem_7e417e;

const PRO_PUNKTE = [
  ['Rechnen, Belege & Berater', 'Kostenlos', 'Kostenlos'],
  ['Übertragungshilfe & Exporte', '—', 'Inklusive'],
  ['Grenzgänger Kalender-Import', '—', 'Inklusive'],
  ['ERiC-geprüft übermitteln', '—', 'Kommt (1.x)'],
];

function FunkePaywall({ onSchliessen, onKaufen }) {
  const [zahlungOffen, setZahlungOffen] = React.useState(false);
  const [fehler, setFehler] = React.useState(false);
  const [gekauft, setGekauft] = React.useState(false);

  if (gekauft) {
    return (
      <div className="fx-bau" style={{ textAlign: 'center', paddingTop: 60 }}>
        <Sticker style={{ fontSize: 16 }}>Abgabe-Paket aktiv</Sticker>
        <h1 style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 44, margin: '18px 0 8px' }}>Freigeschaltet.</h1>
        <p style={{ margin: '0 0 6px', color: 'var(--tinte-2)' }}>34,99 € für das Steuerjahr 2026 — die Rechnung liegt in deinem Profil unter „Deine Daten".</p>
        <p style={{ margin: '0 0 24px', color: 'var(--tinte-2)', fontSize: 13 }}>Kein Abo: nächstes Jahr fragst du uns wieder — nicht umgekehrt.</p>
        <Button onClick={onKaufen}>Weiter zu Übertragen</Button>
      </div>
    );
  }

  return (
    <div className="fx-bau">
      <div className="fk-karte nacht" style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Abgabe-Paket</span>
          <Chip variante="pro" style={{ minHeight: 28, fontSize: 12 }}>∞</Chip>
        </div>
        <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 34, lineHeight: 1.1, margin: '8px 0 4px', color: 'var(--nacht-text)' }}>
          Bereit für die Abgabe?
        </div>
        <p style={{ margin: '0 0 4px', fontSize: 14, opacity: 0.8 }}>Rechnen, prüfen, Berater — alles kostenlos. Du zahlst erst, wenn du abgibst. Unter 50 € Erstattung: gar nicht.</p>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 44, color: 'var(--funke)', margin: '10px 0 2px' }}>
          34,99 €<span style={{ fontSize: 16, opacity: 0.8 }}> / Steuerjahr</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Einmal pro Jahr. Kein Abo, keine automatische Verlängerung.</p>
      </div>

      <div className="fk-karte" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', padding: '12px 16px 8px', gap: 8 }}>
          <span></span>
          <span className="mono-label">Basis</span>
          <span className="mono-label" style={{ color: 'var(--funke-tinte)' }}>Pro</span>
        </div>
        {PRO_PUNKTE.map(([was, basis, pro]) => (
          <div key={was} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8, padding: '10px 16px', borderTop: '1.5px solid var(--linie-weich)', fontSize: 13, alignItems: 'center' }}>
            <b>{was}</b>
            <span style={{ color: 'var(--tinte-2)' }} className="num">{basis}</span>
            <b className="num" style={{ color: 'var(--funke-tinte)' }}>{pro}</b>
          </div>
        ))}
      </div>

      <Button onClick={() => { setFehler(false); setZahlungOffen(true); }}>Abgabe freischalten — 34,99 €</Button>
      <Button variante="ghost" style={{ marginTop: 10 }} onClick={onSchliessen}>Später — erstmal weiter rechnen</Button>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Alles Erfasste bleibt — bezahlt wird nur das Abgeben.</p>

      {zahlungOffen && (
        <Sheet titel="Bezahlen — 34,99 €" onClose={() => setZahlungOffen(false)}>
          {fehler && (
            <Banner art="gefahr"><b>Zahlung fehlgeschlagen.</b> Deine Bank hat abgelehnt — es wurde nichts abgebucht. Versuch es mit einem anderen Weg oder später noch einmal.</Banner>
          )}
          <p style={{ marginTop: fehler ? 12 : 0, fontSize: 13, color: 'var(--tinte-2)' }}>Einmalzahlung für Steuerjahr 2026. Kein Abo, keine Verlängerung.</p>
          <button onClick={() => { setZahlungOffen(false); setGekauft(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 52, borderRadius: 14, background: '#000', color: '#fff', fontWeight: 700, fontSize: 16, border: 'var(--kontur) solid var(--tinte)', marginBottom: 10 }}> Pay</button>
          <button onClick={() => { setZahlungOffen(false); setGekauft(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 52, borderRadius: 14, background: '#fff', fontWeight: 700, fontSize: 16, border: 'var(--kontur) solid var(--tinte)', marginBottom: 10 }}>Google Pay</button>
          <button onClick={() => setFehler(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 52, borderRadius: 14, background: 'var(--karte)', fontWeight: 700, fontSize: 15, border: '1.5px solid var(--linie-weich)' }}>Mit Karte zahlen (Demo: schlägt fehl)</button>
          <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '12px 0 0' }}>Abgewickelt über den jeweiligen Store — wir sehen keine Kartendaten.</p>
        </Sheet>
      )}
    </div>
  );
}
Object.assign(window, { FunkePaywall });
