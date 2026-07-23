/* Registrierung — Konto anlegen → ehrlicher Erfolgsschritt mit Verifizierungs-Hinweis.
   ADR-0012 verbietet ausdrücklich das alte Demo-Code-Gate ("Demo-Code: 123456"): der echte
   Flow verschickt einen echten Bestätigungslink, das Konto ist aber sofort aktiv — kein
   Code-Eingabefeld, keine Sperre. Steht das Konto, zeigt der Erfolgsschritt ehrlich einen
   Hinweis-Banner ("Bitte bestätige noch deine E-Mail") mit Resend-Aktion, statt so zu tun,
   als sei die Adresse schon geprüft. */
const { Button, Input, Feld, Sticker, Banner } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeRegistrierung({ onFertig }) {
  const [schritt, setSchritt] = React.useState(0);
  const [mail, setMail] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [fehler, setFehler] = React.useState('');
  const [resend, setResend] = React.useState('bereit');
  const ok = mail.includes('@') && pass.length >= 6;

  function anlegen() {
    if (!ok) { setFehler(mail.includes('@') ? 'Mindestens 6 Zeichen fürs Passwort.' : 'Das sieht noch nicht nach einer E-Mail aus.'); return; }
    setFehler('');
    setSchritt(1);
  }

  function erneutSenden() {
    setResend('gesendet');
  }

  if (schritt === 1) {
    return (
      <div className="fx-schritt" key="fertig" style={{ textAlign: 'center', paddingTop: 60 }}>
        <Sticker style={{ fontSize: 16 }}>Konto steht ✓</Sticker>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '18px 0 8px' }}>Willkommen bei SteuerEule.</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--tinte-2)' }}>Jetzt noch drei Angaben, dann ist deine Maske vorgefüllt.</p>

        <div style={{ textAlign: 'left', marginBottom: 24 }}>
          <Banner art="warnung">
            <b>Bitte bestätige noch deine E-Mail.</b> Wir haben einen Bestätigungslink an <b>{mail}</b> geschickt.
            Du kannst schon loslegen — bestätige, wenn du Zeit hast.
          </Banner>
          <button
            onClick={erneutSenden}
            disabled={resend === 'gesendet'}
            style={{ display: 'block', margin: '10px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}
          >
            {resend === 'gesendet' ? 'Ist raus — schau in dein Postfach.' : 'Mail erneut senden'}
          </button>
        </div>

        <Button onClick={onFertig}>Weiter zum Onboarding →</Button>
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
