/* Login — drei Wege, klare Hierarchie: E-Mail+Passwort ist die Primäraktion,
   Google/Apple sind schnelle Nebenwege, die Geräte-Kopplung (QR) ist der eigene
   Desktop-Weg auf der Nacht-Fläche (ab 700px — am Telefon ist der Login selbst
   der kürzeste Weg; das Telefon ist der Gegenpart, siehe FunkeGeraetBestaetigen). */
const { Button, Input, Feld, Chip } = window.FinanzoFunkeDesignSystem_7e417e;

/* Offizielle Button-Marken der Anbieter (Standard-Pfade der Sign-in-Kits) */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26A5.42 5.42 0 0 1 9 14.42a5.4 5.4 0 0 1-5.06-3.7H.93v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.94 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.93a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.63 8.63 0 0 0 9 0 9 9 0 0 0 .93 4.95l3.01 2.33A5.4 5.4 0 0 1 9 3.58z"/>
    </svg>
  );
}
function AppleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
      <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 71-69 141-43 61-88 122-156 122s-86-40-165-40c-77 0-104 41-167 41s-107-57-157-127C42 787 0 664 0 547c0-187 122-286 242-286 64 0 117 42 157 42 38 0 97-45 170-45 27 0 127 3 219 83zM554 172c32-38 55-90 55-143 0-7-1-15-2-21-52 2-115 35-153 79-29 33-57 86-57 139 0 8 2 16 2 19 3 0 9 1 14 1 47 0 106-31 141-74z"/>
    </svg>
  );
}

function FunkeAuth({ onFertig, onGast, googleVerfuegbar = true }) {
  const [mail, setMail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [fehler, setFehler] = React.useState('');
  /* Geräte-Kopplung ist ein Großbild-Weg (Tablet/Desktop) — am Telefon ist der Login selbst der kürzeste Weg */
  const [gross, setGross] = React.useState(() => window.matchMedia('(min-width: 700px)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)');
    const auf = (e) => setGross(e.matches);
    mq.addEventListener('change', auf);
    return () => mq.removeEventListener('change', auf);
  }, []);
  const ok = mail.includes('@') && pass.length >= 6;

  function einloggen() {
    if (!ok) {
      setFehler(mail.includes('@') ? 'Mindestens 6 Zeichen fürs Passwort.' : 'Das sieht noch nicht nach einer E-Mail aus.');
      return;
    }
    setFehler('');
    onFertig();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '96vh', padding: '20px 0' }}>
      <div className="fx-rein" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <img src="../../assets/marke-tinte.svg?v=2" width="40" height="40" alt="SteuerEule" />
        <span style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em' }}>Steuer<b style={{ color: 'var(--funke-tinte)' }}>Eule</b></span>
      </div>

      <h1 className="fx-rein" style={{ fontSize: 40, fontWeight: 800, marginBottom: 8 }}>
        Schön, dass du <em className="fx-mark">da</em> bist.
      </h1>
      <p className="fx-rein" style={{ margin: '0 0 24px', color: 'var(--tinte-2)' }}>Dein Steuerjahr wartet — weiter, wo du aufgehört hast.</p>

      <div className="fx-rein" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {googleVerfuegbar ? (
          <Button variante="ghost" onClick={onFertig} aria-label="Weiter mit Google">
            <GoogleG /> Weiter mit Google
          </Button>
        ) : (
          /* Grenzen ehrlich benennen: der Weg verschwindet nicht spurlos */
          <div style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: '1.5px dashed var(--linie-weich)', borderRadius: 14, padding: '8px 16px', color: 'var(--tinte-2)', fontSize: 13 }}>
            <span style={{ opacity: 0.45, display: 'inline-flex', flex: 'none' }} aria-hidden="true"><GoogleG /></span>
            <span>Google ist auf diesem Gerät nicht eingerichtet — die anderen Wege stehen dir offen.</span>
          </div>
        )}
        <Button variante="nacht" onClick={onFertig} aria-label="Weiter mit Apple">
          <span style={{ color: '#fff', display: 'inline-flex' }}><AppleMark /></span>
          <span style={{ color: '#fff' }}>Weiter mit Apple</span>
        </Button>
      </div>

      <div className="fx-rein" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }} aria-hidden="true">
        <i style={{ flex: 1, height: 2, background: 'var(--linie-weich)', borderRadius: 1 }}></i>
        <span className="mono-label">oder mit E-Mail</span>
        <i style={{ flex: 1, height: 2, background: 'var(--linie-weich)', borderRadius: 1 }}></i>
      </div>

      <div className="fx-rein">
        <Feld label="E-Mail">
          <Input type="email" value={mail} onChange={setMail} placeholder="du@beispiel.de" />
        </Feld>
        <Feld label="Passwort" fehler={fehler}>
          <Input type="password" value={pass} onChange={setPass} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && einloggen()} />
        </Feld>
        <Button onClick={einloggen} style={{ marginTop: 6 }}>Einloggen</Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 2px 0', fontSize: 14 }}>
          <a href="#" onClick={(e) => e.preventDefault()}>Passwort vergessen?</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Neu hier? Konto anlegen</a>
        </div>
      </div>

      <div className="fx-rein" style={{ textAlign: 'center', marginTop: 22 }}>
        <Chip onClick={onGast}>Erstmal als Gast umschauen</Chip>
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '10px 0 0' }}>Gast-Modus: deine Angaben bleiben nur auf diesem Gerät.</p>
      </div>

      {/* Zweiter Weg — klar abgesetzte Nacht-Fläche, nur auf großen Schirmen (Tablet/Desktop) */}
      {gross && (
        <div>
          <div className="fx-rein" style={{ margin: '32px 0 14px', textAlign: 'center' }}>
            <span className="mono-label" style={{ display: 'inline-block', padding: '4px 12px', border: '1.5px solid var(--linie-weich)', borderRadius: 99, background: 'var(--papier)' }}>Anderer Weg</span>
          </div>
          <div className="fx-rein">
            <window.FunkeQrKopplung onFertig={onFertig}></window.FunkeQrKopplung>
          </div>
        </div>
      )}
    </div>
  );
}
Object.assign(window, { FunkeAuth });
