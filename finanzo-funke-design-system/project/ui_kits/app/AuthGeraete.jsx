/* Geräte-Kopplung (Device Grant, RFC 8628) — der Desktop zeigt einen Code, das Telefon bestätigt.
   ALLE Zustände entworfen: laedt, bereit, knapp (läuft ab), abgelaufen, fehler, wartet, bestaetigt, abgelehnt.
   Dazu FunkeGeraetBestaetigen — der Gegenpart auf dem Telefon (entscheiden / zugestimmt / abgelehnt). */
const { Button, Chip } = window.FinanzoFunkeDesignSystem_7e417e;

const CODE_DAUER = 120; /* Sekunden — ein Code lebt 2 Minuten */
const KOPPEL_CODE = 'A7K‑M2Q';

/* QR-Platzhalter: deterministisches Zellenraster mit drei Finder-Ecken — kein echter Code (Demo) */
function QrPlatzhalter({ n = 21, gedimmt = false }) {
  const zellen = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const ecke = (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
      const rahmen = ecke && (x === 0 || y === 0 || x === n - 1 || y === n - 1 || (x < 7 && y < 7 && (x === 6 || y === 6)) || (x > n - 8 && (x === n - 7 || y === 6)) || (y > n - 8 && (y === n - 7 || x === 6)));
      const kern = ecke && ((x > 1 && x < 5 && y > 1 && y < 5) || (x > n - 6 && x < n - 2 && y > 1 && y < 5) || (x > 1 && x < 5 && y > n - 6 && y < n - 2));
      const an = ecke ? (rahmen || kern) : ((x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0);
      zellen.push(<i key={x + '-' + y} style={{ background: an ? 'var(--tinte)' : 'transparent' }}></i>);
    }
  }
  return (
    <div aria-label="QR-Code (Demo)" role="img" style={{ width: 150, height: 150, borderRadius: 14, background: '#fff', padding: 10, boxShadow: 'var(--schatten-hart-s)', opacity: gedimmt ? 0.16 : 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)`, width: '100%', height: '100%', position: 'relative' }}>
        {zellen}
        <span style={{ position: 'absolute', inset: '39%', background: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="../../assets/marke-tinte.svg?v=2" width="18" height="18" alt="" />
        </span>
      </div>
    </div>
  );
}

/* Bekannte Hardware — Geräte, die schon mal eingeloggt waren (Demo) */
const BEKANNTE_GERAETE = [
  { id: 'iphone', name: 'Alex’ iPhone 15', art: 'Telefon · iOS 18', aktiv: 'aktiv · jetzt' },
  { id: 'ipad', name: 'iPad Air (Küche)', art: 'Tablet · iPadOS 18', aktiv: 'zuletzt: gestern' },
  { id: 'mac', name: 'MacBook Pro', art: 'Rechner · Safari', aktiv: 'zuletzt: 12. Juli' },
];

function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

/* Die Nacht-Fläche mit dem kompletten Kopplungs-Lebenszyklus.
   start/startSek/statisch nur für Referenz-Blätter — live läuft die Maschine selbst. */
function FunkeQrKopplung({ onFertig, start = 'laedt', startSek = CODE_DAUER, statisch = false }) {
  const [stand, setStand] = React.useState(start);
  const [sek, setSek] = React.useState(startSek);
  const [geraet, setGeraet] = React.useState(null);
  const [kopiert, setKopiert] = React.useState(false);

  React.useEffect(() => {
    if (statisch) return;
    if (stand === 'laedt') { const t = setTimeout(() => { setStand('bereit'); setSek(CODE_DAUER); }, 1100); return () => clearTimeout(t); }
    if (stand === 'bereit') { const t = setInterval(() => setSek((s) => { if (s <= 1) { setStand('abgelaufen'); return 0; } return s - 1; }), 1000); return () => clearInterval(t); }
    if (stand === 'wartet') { const t = setTimeout(() => setStand('bestaetigt'), 2600); return () => clearTimeout(t); }
    if (stand === 'bestaetigt') { const t = setTimeout(() => onFertig && onFertig(), 1500); return () => clearTimeout(t); }
  }, [stand, statisch]);

  const knapp = stand === 'bereit' && sek <= 20;
  const neuerCode = () => { setStand('laedt'); setGeraet(null); };
  const hell = { color: 'var(--nacht-text)' };
  const leise = { color: 'var(--nacht-text)', opacity: 0.7 };

  /* ---- Endzustände: eine Botschaft, eine Aktion ---- */
  if (stand === 'wartet' || stand === 'bestaetigt' || stand === 'abgelehnt' || stand === 'fehler') {
    return (
      <div className="fk-karte nacht" style={{ padding: 24, textAlign: 'center' }}>
        {stand === 'wartet' && (
          <div>
            <div className="fx-puls" style={{ width: 56, height: 56, margin: '4px auto 14px', borderRadius: 99, border: '3px solid var(--funke)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 99, background: 'var(--funke)' }}></span>
            </div>
            <b style={{ fontSize: 17, ...hell }}>Bestätige es auf {geraet ? geraet.name : 'deinem Telefon'}.</b>
            <p style={{ margin: '6px auto 16px', fontSize: 13, maxWidth: 300, ...leise }}>Wir haben eine Anfrage geschickt. Tippe dort auf „Ja, das bin ich" — danach bist du hier drin.</p>
            <Button variante="ghost" style={{ width: 'auto', minHeight: 42, background: 'transparent', borderColor: 'var(--nacht-linie)', ...hell }} onClick={() => { setStand('bereit'); setSek(CODE_DAUER); }}>Abbrechen</Button>
          </div>
        )}
        {stand === 'bestaetigt' && (
          <div>
            <div style={{ width: 56, height: 56, margin: '4px auto 14px', borderRadius: 99, background: 'var(--funke)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: 'var(--tinte)', boxShadow: 'var(--schatten-hart-s)' }} aria-hidden="true">✓</div>
            <b style={{ fontSize: 17, ...hell }}>Das war's — du bist drin.</b>
            <p style={{ margin: '6px auto 0', fontSize: 13, maxWidth: 300, ...leise }}>Freigegeben über {geraet ? geraet.name : 'dein Telefon'}. Dein Steuerjahr lädt.</p>
          </div>
        )}
        {stand === 'abgelehnt' && (
          <div>
            <div style={{ width: 56, height: 56, margin: '4px auto 14px', borderRadius: 99, border: '3px solid var(--fehler)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'var(--fehler)' }} aria-hidden="true">×</div>
            <b style={{ fontSize: 17, ...hell }}>Am Telefon abgelehnt.</b>
            <p style={{ margin: '6px auto 16px', fontSize: 13, maxWidth: 320, ...leise }}>Kein Zugriff gewährt — hier ist nichts passiert. Warst du das nicht, ändere zur Sicherheit dein Passwort.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variante="leise" style={{ width: 'auto', minHeight: 42 }} onClick={neuerCode}>Neuen Code holen</Button>
              <Button variante="ghost" style={{ width: 'auto', minHeight: 42, background: 'transparent', borderColor: 'var(--nacht-linie)', ...hell }} onClick={(e) => e.preventDefault()}>Passwort ändern</Button>
            </div>
          </div>
        )}
        {stand === 'fehler' && (
          <div>
            <b style={{ fontSize: 17, ...hell }}>Gerade kein Code — das liegt an uns.</b>
            <p style={{ margin: '6px auto 16px', fontSize: 13, maxWidth: 320, ...leise }}>Unsere Server antworten nicht. Deine Daten sind sicher, es ist nichts verloren. Versuch es gleich nochmal — oder nimm oben E-Mail.</p>
            <Button variante="leise" style={{ width: 'auto', minHeight: 42 }} onClick={neuerCode}>Nochmal versuchen</Button>
            <p className="num" style={{ margin: '12px 0 0', fontSize: 11, fontFamily: 'var(--schrift-mono)', ...leise, opacity: 0.45 }}>KOPPLUNG‑503 · 14:02:11</p>
          </div>
        )}
      </div>
    );
  }

  /* ---- laedt / bereit / knapp / abgelaufen: QR links, Erklärung rechts, Geräte darunter ---- */
  return (
    <div className="fk-karte nacht" style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 'none', width: 150, textAlign: 'center' }}>
          {stand === 'laedt' ? (
            <div aria-label="Code wird geholt" style={{ width: 150, height: 150, borderRadius: 14, border: '1.5px dashed var(--nacht-linie)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="fx-puls" aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 99, background: 'var(--funke)' }}></span>
            </div>
          ) : stand === 'abgelaufen' ? (
            <div style={{ position: 'relative', width: 150, height: 150 }}>
              <QrPlatzhalter gedimmt />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <b style={{ fontSize: 13, ...hell }}>Abgelaufen</b>
                <Button variante="leise" style={{ width: 'auto', minHeight: 40, fontSize: 13 }} onClick={neuerCode}>Neuer Code</Button>
              </div>
            </div>
          ) : (
            <QrPlatzhalter />
          )}
          {/* Der Code in Zeichen — gepinnt unter dem Muster, falls die Kamera nicht mitspielt */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <b className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 17, letterSpacing: '0.14em', color: stand === 'bereit' ? 'var(--funke)' : 'var(--nacht-linie)' }}>{stand === 'laedt' ? '···‑···' : KOPPEL_CODE}</b>
            {stand === 'bereit' && <Chip onClick={() => { setKopiert(true); setTimeout(() => setKopiert(false), 1400); }} style={{ flex: 'none', minHeight: 30, fontSize: 11, borderColor: 'var(--nacht-linie)', background: 'transparent', ...hell }}>{kopiert ? '✓ Kopiert' : 'Kopieren'}</Chip>}
          </div>
          {/* Lebensdauer — sichtbar, ehrlich, mit Vorwarnung */}
          <div style={{ marginTop: 8 }} aria-live="polite">
            <span style={{ display: 'block', height: 5, borderRadius: 99, background: 'var(--nacht-linie)', overflow: 'hidden' }} role="progressbar" aria-valuenow={sek} aria-valuemin={0} aria-valuemax={CODE_DAUER}>
              <i style={{ display: 'block', height: '100%', width: stand === 'laedt' ? '0%' : (sek / CODE_DAUER * 100) + '%', background: knapp ? 'var(--warn)' : 'var(--funke)', transition: 'width 1s linear' }}></i>
            </span>
            <span style={{ display: 'block', fontSize: 11, marginTop: 5, color: knapp ? 'var(--warn)' : 'var(--nacht-text)', opacity: knapp ? 1 : 0.6, fontWeight: knapp ? 700 : 400 }}>
              {stand === 'laedt' ? 'Code wird geholt …' : stand === 'abgelaufen' ? 'Ein Code gilt aus Sicherheit nur 2 Minuten.' : knapp ? `Läuft gleich ab — noch ${mmss(sek)}` : `Gilt noch ${mmss(sek)}`}
            </span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <b style={{ display: 'block', fontFamily: 'var(--schrift-display)', fontSize: 22, lineHeight: 1.15, ...hell }}>Mit deinem Telefon anmelden</b>
          <p style={{ margin: '8px 0 10px', fontSize: 13, ...leise }}>Kein Passwort tippen: SteuerEule auf dem Telefon öffnen, Profil → <b>Gerät koppeln</b>, Muster scannen. Dein Steuerjahr ist in zwei Sekunden hier.</p>
          <p style={{ margin: 0, fontSize: 12, ...leise, opacity: 0.55 }}>Keine Kamera? Öffne <b>steuereule.de/koppeln</b> auf dem Telefon und tipp den Code unterm Muster ein.</p>
        </div>
      </div>
      <div style={{ borderTop: '1.5px solid var(--nacht-linie)', margin: '16px 0 0', paddingTop: 12 }}>
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Deine bekannten Geräte</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {BEKANNTE_GERAETE.map((g) => (
            <button key={g.id} onClick={() => { setGeraet(g); setStand('wartet'); }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', minHeight: 52, padding: '8px 12px', borderRadius: 12, border: '1.5px solid var(--nacht-linie)', ...hell }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, flex: 'none', background: g.aktiv.includes('jetzt') ? 'var(--funke)' : 'var(--nacht-linie)' }}></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 14 }}>{g.name}</b>
                <span style={{ fontSize: 12, opacity: 0.65 }}>{g.art} · {g.aktiv}</span>
              </span>
              <span aria-hidden="true" style={{ fontWeight: 800, flex: 'none' }}>→</span>
            </button>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, ...leise, opacity: 0.6 }}>Geräte, die schon einmal drin waren. Nicht dein Gerät dabei? Dann scanne das Muster.</p>
      </div>
    </div>
  );
}

/* Der Gegenpart auf dem Telefon: „Ein Gerät möchte sich anmelden. Warst du das?" */
function FunkeGeraetBestaetigen({ start = 'entscheiden', onFertig }) {
  const [stand, setStand] = React.useState(start);
  if (stand === 'zugestimmt') {
    return (
      <div className="fk-karte" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ width: 56, height: 56, margin: '4px auto 14px', borderRadius: 99, background: 'var(--funke)', border: 'var(--kontur) solid var(--tinte)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, boxShadow: 'var(--schatten-hart-s)' }} aria-hidden="true">✓</div>
        <b style={{ fontSize: 17 }}>Freigegeben.</b>
        <p style={{ margin: '6px auto 0', fontSize: 13, color: 'var(--tinte-2)', maxWidth: 280 }}>Das andere Gerät ist jetzt drin. Du findest es ab sofort unter Profil → Geräte.</p>
      </div>
    );
  }
  if (stand === 'abgelehnt') {
    return (
      <div className="fk-karte" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ width: 56, height: 56, margin: '4px auto 14px', borderRadius: 99, border: '3px solid var(--fehler)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'var(--fehler)' }} aria-hidden="true">×</div>
        <b style={{ fontSize: 17 }}>Abgelehnt — nichts passiert.</b>
        <p style={{ margin: '6px auto 14px', fontSize: 13, color: 'var(--tinte-2)', maxWidth: 300 }}>Das Gerät kommt nicht rein. Warst du das nicht, ändere zur Sicherheit dein Passwort — dauert eine Minute.</p>
        <Chip onClick={(e) => e.preventDefault()}>Passwort ändern</Chip>
      </div>
    );
  }
  return (
    <div className="fk-karte held" style={{ padding: 20 }}>
      <span className="mono-label">Anmelde-Anfrage</span>
      <h2 style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.1, margin: '8px 0 12px' }}>Ein Gerät möchte in dein Konto. <em style={{ fontStyle: 'normal', background: 'var(--funke)', borderRadius: 8, padding: '0 6px' }}>Warst du das?</em></h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--tinte-2)', marginBottom: 14 }}>
        <span><b style={{ color: 'var(--tinte)' }}>Gerät:</b> Chrome auf Windows</span>
        <span><b style={{ color: 'var(--tinte)' }}>Wo ungefähr:</b> Freiburg, Deutschland</span>
        <span><b style={{ color: 'var(--tinte)' }}>Wann:</b> gerade eben</span>
      </div>
      <div style={{ border: '1.5px dashed var(--linie)', borderRadius: 12, padding: '10px 12px', marginBottom: 16, textAlign: 'center' }}>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--tinte-2)', marginBottom: 4 }}>Steht dieser Code auch auf dem anderen Bildschirm?</span>
        <b className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, letterSpacing: '0.18em' }}>{KOPPEL_CODE}</b>
      </div>
      <Button onClick={() => { setStand('zugestimmt'); onFertig && setTimeout(onFertig, 1200); }}>Ja, das bin ich</Button>
      <Button variante="ghost" style={{ marginTop: 10 }} onClick={() => setStand('abgelehnt')}>Ablehnen</Button>
      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--tinte-2)', textAlign: 'center' }}>Stimmt der Code nicht überein, lehn ab — dann probiert es jemand anderes.</p>
    </div>
  );
}

Object.assign(window, { FunkeQrKopplung, FunkeGeraetBestaetigen, FunkeQrPlatzhalter: QrPlatzhalter });
