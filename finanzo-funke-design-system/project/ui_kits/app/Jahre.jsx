/* Steuerjahre — Archiv + Vorjahresübernahme + Rückjahre (ADR-021/022) + Extern erledigt (ADR-018). */
const { Button, Chip, Pill, Sticker, Sheet } = window.FinanzoFunkeDesignSystem_7e417e;

const ARCHIV_JAHRE = [
  { jahr: 2025, status: 'Bescheid da', erstattung: '1.212,00 €', fertig: true },
  { jahr: 2024, status: 'Bescheid da', erstattung: '987,00 €', fertig: true },
  { jahr: 2023, status: 'Extern erledigt', erstattung: '810,00 €', extern: true },
  { jahr: 2022, status: 'Extern erledigt', erstattung: '640,00 €', extern: true },
];

function FunkeJahre({ onWeiter, onZurueck, onJahr }) {
  const [uebernahmeOffen, setUebernahmeOffen] = React.useState(false);
  const [uebernommen, setUebernommen] = React.useState(false);
  const [vastOffen, setVastOffen] = React.useState(false);
  const [vastStatus, setVastStatus] = React.useState('');

  return (
    <div>
      <div className="appbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onZurueck ? <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800 }}>←</button> : <a href="index.html" aria-label="Zurück zur App" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>←</a>}
          <h1>Steuerjahre</h1>
        </div>
        <Pill>5 Jahre</Pill>
      </div>

      <div className="fk-karte nacht">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Neu: Steuerjahr 2026</span>
          {uebernommen && <Sticker style={{ fontSize: 13 }}>80 % vorausgefüllt</Sticker>}
        </div>
        <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 34, lineHeight: 1.1, margin: '8px 0 6px', color: 'var(--nacht-text)' }}>
          {uebernommen ? 'Fast fertig, bevor du anfängst.' : 'Alles wie letztes Jahr?'}
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 14, opacity: 0.8 }}>
          {uebernommen
            ? 'Arbeitgeber, Weg, Homeoffice und Bankverbindung sind übernommen — alles Übernommene ist grau markiert und gilt als unbestätigt, bis du es antippst oder ein Beleg es deckt.'
            : 'Wir übernehmen Stammdaten, Arbeitsweg, Homeoffice-Muster und wiederkehrende Belege aus 2025 — du bestätigst nur, was sich geändert hat.'}
        </p>
        {uebernommen ? (
          <Button onClick={onWeiter}>Weiter im Cockpit →</Button>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button style={{ width: 'auto' }} onClick={() => setUebernahmeOffen(true)}>Aus 2025 übernehmen</Button>
            <Button variante="ghost" style={{ width: 'auto', background: 'transparent', borderColor: 'var(--funke)', color: 'var(--nacht-text)' }} onClick={onWeiter}>Leer starten</Button>
          </div>
        )}
      </div>

      <div className="fk-karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <b>Vorausgefüllte Erklärung</b>
          {vastStatus ? <Chip variante="src">{vastStatus}</Chip> : <Chip onClick={() => setVastOffen(true)}>Vom Finanzamt abrufen</Chip>}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tinte-2)' }}>Lohn, Versicherungsbeiträge und Lohnersatz direkt aus der Finanzverwaltung — statt Abtippen.</p>
      </div>

      <div className="fk-karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <b>Bis zu 4 Jahre rückwirkend</b>
          <span style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 700 }}>✓ alles drin</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tinte-2)' }}>Ohne Abgabepflicht kannst du freiwillig bis 2022 zurück — oft mehrere Erstattungen auf einmal. Bei dir: 2022–2025 sind erledigt. Jedes Jahr rechnet mit seinen eigenen Pauschalen.</p>
      </div>

      {window.funkeEulenAn && window.funkeEulenAn() && (
        <div className="fk-karte" data-ai="true" style={{ borderColor: 'var(--ki)', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 14 }}>Neues Urteil betrifft dein Jahr 2025</b>
            <b className="num" style={{ color: 'var(--ki)', flex: 'none' }}>+85 €</b>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tinte-2)' }}>Ein Einspruch ist möglich. Frist: <b className="num">18.08.2026</b>. Ich habe alles vorbereitet — du entscheidest. <a href="#" onClick={(e) => e.preventDefault()}>Zur Quelle</a></p>
        </div>
      )}
      <div className="mono-label" style={{ margin: '6px 0 8px' }}>Archiv</div>
      {ARCHIV_JAHRE.map((j) => (
        j.extern ? (
          <div key={j.jahr} className="fk-karte" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 24, flex: 'none', color: 'var(--tinte-2)' }}>{j.jahr}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>Extern erledigt</b>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Selbst über ELSTER abgegeben · Erstattung: <b className="num">{j.erstattung}</b></span>
            </div>
            <Chip variante="src" style={{ minHeight: 28, fontSize: 12, flex: 'none' }}>Archiv</Chip>
          </div>
        ) : (
        <button key={j.jahr} onClick={() => (onJahr ? onJahr(j.jahr) : (window.location.href = 'jahr-2025.html'))} className="fk-karte" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
          <span className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 24, flex: 'none' }}>{j.jahr}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14, color: 'var(--ok)' }}>✓ {j.status}</b>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Erstattung: <b className="num">{j.erstattung}</b></span>
          </div>
          <span aria-hidden="true" style={{ fontWeight: 800, flex: 'none' }}>→</span>
        </button>
        )
      ))}
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Abgeschlossene Jahre sind versiegelt — lesen, kopieren, exportieren; ändern nur als Berichtigung.</p>

      {vastOffen && (
        <Sheet titel="Datenabruf beim Finanzamt" onClose={() => setVastOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--tinte-2)' }}>Das liefert die Finanzverwaltung automatisch:</p>
          {['Lohnsteuerbescheinigung(en)', 'Kranken-, Pflege- und Rentenbeiträge', 'Lohnersatzleistungen (z. B. Elterngeld)', 'Kirchensteuer'].map((w) => (
            <div key={w} style={{ borderBottom: '1.5px solid var(--linie-weich)', padding: '10px 0', fontSize: 14 }}>{w}</div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--tinte-2)' }}>Ehrlich: Die Freischaltung dauert einmalig bis zu 2 Wochen — das Finanzamt schickt dir einen Brief. Danach kommt jedes Jahr alles automatisch.</p>
          <Button onClick={() => { setVastStatus('Beantragt — Brief unterwegs (Demo)'); setVastOffen(false); }}>Abruf beantragen</Button>
        </Sheet>
      )}

      {uebernahmeOffen && (
        <Sheet titel="Aus 2025 übernehmen" onClose={() => setUebernahmeOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--tinte-2)' }}>Das übernehmen wir — jede Position bleibt einzeln änderbar:</p>
          {[
            ['Stammdaten & IBAN', 'unverändert übernommen'],
            ['Arbeitgeber + Arbeitsweg (28 km)', 'bestätigen, falls gleich'],
            ['Homeoffice-Muster (2 Tage/Woche)', 'bestätigen, falls gleich'],
            ['Wiederkehrende Belege (BahnCard, Spenden)', 'als Erinnerung angelegt'],
          ].map(([was, wie]) => (
            <div key={was} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1.5px solid var(--linie-weich)', padding: '10px 0', fontSize: 13 }}>
              <b style={{ minWidth: 0 }}>{was}</b>
              <span style={{ color: 'var(--tinte-2)', flex: 'none' }}>{wie}</span>
            </div>
          ))}
          <Button style={{ marginTop: 14 }} onClick={() => { setUebernommen(true); setUebernahmeOffen(false); }}>Übernehmen — 80 % vorausgefüllt</Button>
        </Sheet>
      )}
    </div>
  );
}
Object.assign(window, { FunkeJahre });
