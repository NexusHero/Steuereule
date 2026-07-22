/* Registrierung — Konto anlegen + Code-Verifizierung (Demo-Code 123456, wie im Quell-Repo). */
const { Button, Input, Feld, Sticker } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeRegistrierung({ onFertig }) {
  const [schritt, setSchritt] = React.useState(0);
  const [mail, setMail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [code, setCode] = React.useState('');
  const [fehler, setFehler] = React.useState('');
  const ok = mail.includes('@') && pass.length >= 6;

  function anlegen() {
    if (!ok) { setFehler(mail.includes('@') ? 'Mindestens 6 Zeichen fürs Passwort.' : 'Das sieht noch nicht nach einer E-Mail aus.'); return; }
    setFehler(''); setSchritt(1);
  }
  function pruefen(v) {
    const z = v.replace(/\D/g, '').slice(0, 6);
    setCode(z);
    if (z.length === 6) {
      if (z === '123456') { setFehler(''); setSchritt(2); }
      else setFehler('Der Code stimmt nicht — schau nochmal in deine Mail.');
    } else setFehler('');
  }

  if (schritt === 2) {
    return (
      <div className="fx-schritt" key="fertig" style={{ textAlign: 'center', paddingTop: 60 }}>
        <Sticker style={{ fontSize: 16 }}>Konto steht ✓</Sticker>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '18px 0 8px' }}>Willkommen bei SteuerEule.</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--tinte-2)' }}>Jetzt noch drei Angaben, dann ist deine Maske vorgefüllt.</p>
        <Button onClick={onFertig}>Weiter zum Onboarding →</Button>
      </div>
    );
  }

  if (schritt === 1) {
    return (
      <div className="fx-schritt" key="code">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Check deine <em className="fx-mark">Mail</em>.</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Wir haben einen 6-stelligen Code an <b>{mail}</b> geschickt.</p>
        <Feld label="Bestätigungscode" fehler={fehler}>
          <Input value={code} onChange={pruefen} placeholder="123456" inputMode="numeric" autoFocus style={{ fontFamily: 'var(--schrift-mono)', fontSize: 30, letterSpacing: '0.35em', textAlign: 'center' }} />
        </Feld>
        <p className="mono-label" style={{ textAlign: 'center' }}>Demo-Code: 123456</p>
        <button onClick={() => setSchritt(0)} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Andere E-Mail verwenden</button>
      </div>
    );
  }

  return (
    <div className="fx-schritt" key="konto">
      <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Leg dein <em className="fx-mark">Konto</em> an.</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>E-Mail und Passwort — mehr braucht es nicht.</p>
      <Feld label="E-Mail">
        <Input type="email" value={mail} onChange={setMail} placeholder="du@beispiel.de" autoFocus />
      </Feld>
      <Feld label="Passwort" fehler={fehler}>
        <Input type="password" value={pass} onChange={setPass} placeholder="Mindestens 6 Zeichen" onKeyDown={(e) => e.key === 'Enter' && anlegen()} />
      </Feld>
      <Button onClick={anlegen} style={{ marginTop: 6 }}>Konto anlegen</Button>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center', marginTop: 14 }}>Mit dem Anlegen akzeptierst du AGB & Datenschutz.</p>
    </div>
  );
}
Object.assign(window, { FunkeRegistrierung });
