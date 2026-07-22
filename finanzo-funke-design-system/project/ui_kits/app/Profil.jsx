/* Profil — Konto, Einstellungen (Schalter), Daten (Export/Löschen), Rechtliches. */
const { Button, Chip, Pill, SchalterZeile, Sheet, Toast } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeProfil({ geheZu }) {
  const profil = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem('funke.onboarding.profil')) || {}; }
    catch (e) { return {}; }
  }, []);
  const [erinnerung, setErinnerung] = React.useState(true);
  const [saison, setSaison] = React.useState(true);
  const [eulen, setEulen] = React.useState(() => (window.funkeEulenAn ? window.funkeEulenAn() : false));
  const [faceId, setFaceId] = React.useState(false);
  const [dunkel, setDunkel] = React.useState(() => {
    try { return localStorage.getItem('funke.theme') === 'dunkel'; } catch (e) { return false; }
  });
  function themeWechsel(an) {
    setDunkel(an);
    try { localStorage.setItem('funke.theme', an ? 'dunkel' : 'hell'); } catch (e) {}
    if (an) document.documentElement.dataset.theme = 'dunkel';
    else delete document.documentElement.dataset.theme;
  }
  const [loeschenOffen, setLoeschenOffen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  function zeigeToast(t) { setToast(t); setTimeout(() => setToast(''), 1400); }
  const name = [profil.vorname, profil.nachname].filter(Boolean).join(' ') || 'Gast';

  return (
    <div>
      <div className="appbar">
        <h1>Profil</h1>
        <Pill>Beta</Pill>
      </div>

      <div className="fk-karte" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span aria-hidden="true" style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--funke)', color: '#191b12', border: 'var(--kontur) solid var(--tinte)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 22, flex: 'none' }}>
          {name[0].toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 17 }}>{name}</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>
            {profil.steuerId ? <span className="num" style={{ fontFamily: 'var(--schrift-mono)' }}>ID {profil.steuerId}</span> : 'Gast-Modus — Angaben nur auf diesem Gerät'}
          </span>
        </div>
        <Chip onClick={() => geheZu && geheZu('cockpit')} style={{ marginLeft: 'auto', flex: 'none' }}>Bearbeiten</Chip>
      </div>

      <div className="fk-karte" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <SchalterZeile titel="Dunkles Design" detail="Limette bleibt — Flächen tauschen" an={dunkel} onChange={themeWechsel} />
        <SchalterZeile titel="Ereignis-Nachrichten" detail="Bescheid da, Rückfrage vom Amt, Frist unter 30 Tagen — sonst nichts" an={erinnerung} onChange={setErinnerung} />
        <SchalterZeile titel="Saison-Erinnerung" detail="Einmal pro Steuersaison: deine Belege warten" an={saison} onChange={setSaison} />
        <SchalterZeile titel="Eulen-Modus" detail="Liest Rechtsänderungen, fragt aktiv nach — du entscheidest immer" an={eulen} onChange={(v) => { setEulen(v); if (window.funkeSetEulenAn) window.funkeSetEulenAn(v); }} />
        <SchalterZeile titel="Mit Face ID entsperren" detail="Zusätzlich zur Geräte-Sperre" an={faceId} onChange={setFaceId} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1.5px solid var(--linie-weich)' }}>
          <div><b style={{ fontSize: 15 }}>Schriftgröße</b><span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Folgt deiner System-Einstellung — bis 200 % getestet</span></div>
          <Pill>System</Pill>
        </div>
      </div>

      <div className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <b>Beta — alles kostenlos</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Kein Preis, keine Schlösser. Ein Preis kommt erst, wenn wir echt ans Finanzamt übermitteln können.</span>
        </div>
      </div>

      <div className="fk-karte" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mono-label" style={{ padding: '12px 16px 4px' }}>Deine Daten</div>
        <button onClick={() => (geheZu ? geheZu('datenschutz') : (window.location.href = 'datenschutz.html'))} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, fontSize: 15 }}>
          <span>So schützen wir deine Daten (DSGVO)</span><span aria-hidden="true">→</span>
        </button>
        <button onClick={() => zeigeToast('Demo — PDF-Bericht + Belege (ZIP) werden vorbereitet')} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, fontSize: 15 }}>
          <span>Alles exportieren — PDF-Bericht + Belege (ZIP)</span><span aria-hidden="true">→</span>
        </button>
        <button onClick={() => setLoeschenOffen(true)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, fontSize: 15, color: 'var(--fehler)', fontWeight: 700 }}>
          <span>Konto & Daten löschen</span><span aria-hidden="true">→</span>
        </button>
        <p style={{ margin: 0, padding: '10px 16px', borderTop: '1.5px solid var(--linie-weich)', fontSize: 12, color: 'var(--tinte-2)' }}>EU-Server · verschlüsselt · kein Verkauf von Daten</p>
      </div>

      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>
        <a href="#" onClick={(e) => e.preventDefault()}>AGB</a> · <a href="#" onClick={(e) => { e.preventDefault(); geheZu ? geheZu('datenschutz') : (window.location.href = 'datenschutz.html'); }}>Datenschutz</a> · <a href="#" onClick={(e) => e.preventDefault()}>Impressum</a> · Version 0.9 (Beta)
      </p>

      {toast && <Toast text={toast} />}
      {loeschenOffen && (
        <Sheet titel="Wirklich alles löschen?" onClose={() => setLoeschenOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 14 }}>Alle Belege, Antworten und dein Konto werden endgültig gelöscht — auch auf unseren Servern. Das lässt sich <b>nicht</b> rückgängig machen.</p>
          <p style={{ fontSize: 13, color: 'var(--tinte-2)' }}>Wichtig: Damit verlierst du deine Nachweise gegenüber dem Finanzamt. Sichere sie dir vorher.</p>
          <Button variante="leise" onClick={() => { setLoeschenOffen(false); zeigeToast('Demo — PDF-Bericht + Belege (ZIP) werden vorbereitet'); }}>Erst exportieren (empfohlen)</Button>
          <Button variante="ghost" style={{ marginTop: 10, borderColor: 'var(--fehler)', color: 'var(--fehler)' }} onClick={() => setLoeschenOffen(false)}>Ohne Export endgültig löschen</Button>
          <Button style={{ marginTop: 10 }} onClick={() => setLoeschenOffen(false)}>Abbrechen</Button>
        </Sheet>
      )}
    </div>
  );
}
Object.assign(window, { FunkeProfil });
