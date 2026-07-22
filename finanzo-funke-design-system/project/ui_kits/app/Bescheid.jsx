/* Bescheid-Vergleich — der Retention-Moment: Bescheid kam, Zeile für Zeile gegen
   unsere Berechnung. Abweichungen erklärt; Einspruch (1 Monat Frist!) als klarer Weg. */
const { Button, Chip, Pill, Banner, AiChip, HerkunftsChip, Sticker, Sheet, Begriff } = window.FinanzoFunkeDesignSystem_7e417e;

const ZEILEN = [
  { was: 'Bruttoarbeitslohn', wir: '54.320,00 €', amt: '54.320,00 €', gleich: true },
  { was: 'Werbungskosten', wir: '3.184,00 €', amt: '3.184,00 €', gleich: true },
  { was: 'Fortbildungskosten', wir: '890,00 €', amt: '847,00 €', gleich: false, grund: 'Das Amt hat 43 € Verpflegungspauschale gestrichen — vermutlich fehlte die Abwesenheitsdauer.' },
  { was: 'Sonderausgaben', wir: '2.150,00 €', amt: '2.150,00 €', gleich: true },
];

function FunkeBescheid({ onBerater, onZurueck }) {
  const [detail, setDetail] = React.useState(null);
  const [einspruchOffen, setEinspruchOffen] = React.useState(false);
  const abweichungen = ZEILEN.filter((z) => !z.gleich);

  return (
    <div className="fx-bau">
      <div className="appbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onZurueck ? <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800 }}>←</button> : <a href="index.html" aria-label="Zurück zur App" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>←</a>}
          <h1>Dein Bescheid</h1>
        </div>
        <Pill>{window.FunkeDemo.bescheid.jahr}</Pill>
      </div>

      <div className="fk-karte nacht">
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Erstattung laut Bescheid</span>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 48, color: 'var(--funke)', lineHeight: 1.05 }}>{window.FunkeDemo.formatEuroCent(window.FunkeDemo.bescheid.betrag)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>Wir hatten berechnet: <b className="num">{window.FunkeDemo.formatEuroCent(window.FunkeDemo.bescheid.berechnet)}</b></span>
          <span className="fk-sticker num" style={{ background: 'var(--warn-weich)', color: 'var(--warn)', borderColor: 'var(--warn)', boxShadow: '2px 2px 0 var(--warn)', fontSize: 13 }}>{window.FunkeDemo.bescheid.delta} €</span>
        </div>
      </div>

      <Banner art="warnung">1 Abweichung gefunden. <Begriff titel="Einspruchsfrist" erklaerung="Ein Monat ab dem Tag, an dem der Bescheid als bekannt gegeben gilt — danach ist er bestandskräftig und lässt sich kaum noch ändern. Ein Einspruch kostet nichts und muss nicht perfekt begründet sein: fristgerecht einlegen genügt, nachbessern geht später." beispiel="Bescheid vom 15.07. → Einspruch bis 18.08.">Einspruchsfrist</Begriff>: <b>bis {window.FunkeDemo.bescheid.frist}</b> — ein Monat ab Bekanntgabe.</Banner>

      <div className="fk-karte" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mono-label" style={{ padding: '12px 16px 4px' }}>Zeile für Zeile</div>
        {ZEILEN.map((z) => (
          <button
            key={z.was}
            onClick={() => !z.gleich && setDetail(z)}
            aria-expanded={detail === z}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, cursor: z.gleich ? 'default' : 'pointer', background: z.gleich ? 'transparent' : 'var(--warn-weich)' }}
          >
            <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{z.was}</span>
            <span className="num" style={{ fontSize: 13, color: 'var(--tinte-2)', whiteSpace: 'nowrap' }}>{z.wir}</span>
            <span aria-hidden="true" style={{ color: 'var(--tinte-2)' }}>→</span>
            <b className="num" style={{ fontSize: 13, whiteSpace: 'nowrap', color: z.gleich ? 'var(--ok)' : 'var(--warn)' }}>{z.amt}</b>
            <span aria-hidden="true" style={{ fontWeight: 800, width: 18, textAlign: 'center', color: z.gleich ? 'var(--ok)' : 'var(--warn)' }}>{z.gleich ? '✓' : '!'}</span>
          </button>
        ))}
      </div>

      {detail && (
        <div className="fk-ai-karte" data-ai="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <AiChip>Einschätzung</AiChip>
            <b style={{ fontSize: 14, color: 'var(--ki-tinte)' }}>{detail.was}</b>
          </div>
          <p style={{ margin: '8px 0 10px', fontSize: 13, color: 'var(--ki-tinte)' }}>{detail.grund}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variante="leise" style={{ minHeight: 42, width: 'auto' }} onClick={() => setEinspruchOffen(true)}>Einspruch vorbereiten</Button>
            <Button variante="ghost" style={{ minHeight: 42, width: 'auto' }} onClick={onBerater}>Berater fragen</Button>
          </div>
        </div>
      )}

      <Button onClick={() => setEinspruchOffen(true)}>Einspruch vorbereiten (+43 €)</Button>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Einschätzungen sind kein Ersatz für Rechts- oder Steuerberatung.</p>

      {einspruchOffen && (
        <Sheet titel="Einspruch vorbereiten" onClose={() => setEinspruchOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 14 }}>Wir erstellen ein fertiges Einspruchsschreiben mit Begründung und Nachweis (Abwesenheitszeiten der Fortbildung). Du prüfst, unterschreibst, sendest — per Post oder Mein ELSTER.</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px dashed var(--linie-weich)', padding: '6px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--tinte-2)' }}>Streitwert</span><b className="num">43,00 €</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 14px', fontSize: 13 }}>
            <span style={{ color: 'var(--tinte-2)' }}>Frist</span><b>{window.FunkeDemo.bescheid.frist}</b>
          </div>
          <Button onClick={() => setEinspruchOffen(false)}>Schreiben erstellen (PDF)</Button>
        </Sheet>
      )}
    </div>
  );
}
Object.assign(window, { FunkeBescheid });
