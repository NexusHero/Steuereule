/* Passwort-Reset — zwei Schritte, beide ehrlich.
   Schritt 1 (anfordern): E-Mail rein, danach IMMER dieselbe neutrale Bestätigung —
   ob zu einer Adresse ein Konto gehört, ist an diesem Screen bewusst nicht ablesbar
   (Ausspäh-Schutz; Stakeholder-Entscheid: „Wir sagen einfach, wir haben's gesendet.").
   Es gibt deshalb absichtlich KEINEN Zustand „Konto nicht gefunden".
   Schritt 2 (neues-passwort, erreicht über den Link aus der Mail): neues Passwort setzen.
   Nach dem Erfolg gilt: ALLE Sitzungen sind beendet — auch die auf diesem Gerät. Der
   Erfolgs-Screen führt darum zur Anmeldung, nie in die App, und sagt beides klar.

   Ein einziger Ungültig-Zustand, bewusst (Stakeholder-Entscheid, Option B): der Server
   unterscheidet „abgelaufen" und „schon benutzt" NICHT — better-auth wirft für beide (und
   für „gibt's nicht") denselben einen Fehler, und verbraucht einen abgelaufenen Token beim
   Versuch. Zwei getrennte Zustände wären ein Versprechen, das das Backend nicht hält (und
   „schon benutzt" vs. „nie existiert" wäre selbst ein kleines Ausspäh-Leck). Darum EIN
   ehrlicher „gilt nicht mehr", für beide Fälle wahr. Und weil der Token erst beim ABSENDEN
   des neuen Passworts geprüft werden kann (kein Prüf-ohne-Verbrauch im Standard), erscheint
   dieser Zustand nach dem Absenden, nicht beim Öffnen des Links.
   Kein Code-Eingabefeld (der Reset läuft über einen Link, nicht über einen Code),
   keine Stärkeanzeige (gibt es in diesem Kit nirgends). */
const { Button, Input, Feld, Sticker } = window.FinanzoFunkeDesignSystem_7e417e;

/* start: 'anfordern' | 'gesendet' | 'neues-passwort' | 'ungueltig' | 'erfolg'
   — 'neues-passwort'/'ungueltig' sind die Einstiege/Ausgänge des Mail-Link-Wegs; 'ungueltig'
   erscheint im Produkt erst nach dem Absenden, wenn der Server den Token verwirft.
   mailStart/fehlerStart: nur für die Zustands-Referenzseite (wie AuthGeraete's `start`). */
function FunkePasswortReset({ start = 'anfordern', mailStart = '', fehlerStart = '', onZurAnmeldung }) {
  const [schritt, setSchritt] = React.useState(start);
  const [mail, setMail] = React.useState(mailStart);
  const [pass1, setPass1] = React.useState('');
  const [pass2, setPass2] = React.useState('');
  const [fehler, setFehler] = React.useState(fehlerStart);
  const [erneut, setErneut] = React.useState('bereit');

  function anfordern() {
    if (!mail.includes('@')) { setFehler('Das sieht noch nicht nach einer E-Mail aus.'); return; }
    setFehler('');
    setSchritt('gesendet');
  }

  function speichern() {
    if (pass1.length < 6) { setFehler('Mindestens 6 Zeichen fürs Passwort.'); return; }
    if (pass1 !== pass2) { setFehler('Die beiden Passwörter stimmen nicht überein.'); return; }
    setFehler('');
    setSchritt('erfolg');
  }

  function nochmalAnfordern() {
    setFehler('');
    setSchritt('anfordern');
  }

  /* — Schritt 1b: neutrale Bestätigung. Identisch für jede Adresse. — */
  if (schritt === 'gesendet') {
    return (
      <div className="fx-schritt" key="gesendet" style={{ textAlign: 'center', paddingTop: 60 }}>
        <Sticker style={{ fontSize: 16 }}>Ist raus ✓</Sticker>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '18px 0 8px' }}>Schau in dein Postfach.</h1>
        <p style={{ margin: '0 0 6px', color: 'var(--tinte-2)' }}>
          Wir haben eine E-Mail an <b>{mail || 'deine Adresse'}</b> geschickt.
        </p>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--tinte-2)' }}>
          Der Link darin ist eine Stunde gültig und funktioniert genau einmal.
        </p>
        <Button onClick={onZurAnmeldung}>Zurück zur Anmeldung</Button>
        <button
          onClick={() => setErneut('gesendet')}
          disabled={erneut === 'gesendet'}
          style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}
        >
          {erneut === 'gesendet' ? 'Ist raus — schau in dein Postfach.' : 'Mail erneut senden'}
        </button>
      </div>
    );
  }

  /* — Ein Link, der nicht mehr gilt: abgelaufen ODER schon benutzt, ohne zu behaupten
       welches von beiden (der Server unterscheidet es nicht, und „schon benutzt" vs.
       „nie existiert" wäre ein Ausspäh-Leck). Sagen, was los ist und was jetzt geht. — */
  if (schritt === 'ungueltig') {
    return (
      <div className="fx-schritt" key="ungueltig" style={{ textAlign: 'center', paddingTop: 60 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 8px' }}>Der Link gilt nicht mehr.</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--tinte-2)' }}>
          Ein Reset-Link gilt eine Stunde und funktioniert genau einmal — dieser ist
          abgelaufen oder wurde schon benutzt. Dein Passwort ist unverändert. Fordere
          einfach einen neuen an.
        </p>
        <Button onClick={nochmalAnfordern}>Neuen Link anfordern</Button>
        <button onClick={onZurAnmeldung} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>
          Zurück zur Anmeldung
        </button>
      </div>
    );
  }

  /* — Erfolg: zwei Tatsachen, beide ausgesprochen — Passwort neu, überall abgemeldet. — */
  if (schritt === 'erfolg') {
    return (
      <div className="fx-schritt" key="erfolg" style={{ textAlign: 'center', paddingTop: 60 }}>
        <Sticker style={{ fontSize: 16 }}>Passwort geändert ✓</Sticker>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '18px 0 8px' }}>Frisch gesetzt.</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--tinte-2)' }}>
          Dein neues Passwort gilt ab jetzt. Zur Sicherheit haben wir dich überall
          abgemeldet — auch auf diesem Gerät. Melde dich einmal neu an, dann bist du wieder drin.
        </p>
        <Button onClick={onZurAnmeldung}>Zur Anmeldung →</Button>
      </div>
    );
  }

  /* — Schritt 2: neues Passwort setzen (Einstieg über den Mail-Link). — */
  if (schritt === 'neues-passwort') {
    return (
      <div className="fx-schritt" key="neu">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Setz dein neues <em className="fx-mark">Passwort</em>.</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Danach meldest du dich einmal neu an — auf allen Geräten.</p>
        <Feld label="Neues Passwort">
          <Input type="password" value={pass1} onChange={setPass1} placeholder="Mindestens 6 Zeichen" autoFocus />
        </Feld>
        <Feld label="Noch einmal" fehler={fehler}>
          <Input type="password" value={pass2} onChange={setPass2} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && speichern()} />
        </Feld>
        <Button onClick={speichern} style={{ marginTop: 6 }}>Passwort speichern</Button>
      </div>
    );
  }

  /* — Schritt 1: anfordern. — */
  return (
    <div className="fx-schritt" key="anfordern">
      <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Passwort <em className="fx-mark">vergessen</em>?</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>
        Passiert. Sag uns deine E-Mail — wir schicken dir einen Link zum Zurücksetzen.
      </p>
      <Feld label="E-Mail" fehler={fehler}>
        <Input type="email" value={mail} onChange={setMail} placeholder="du@beispiel.de" autoFocus onKeyDown={(e) => e.key === 'Enter' && anfordern()} />
      </Feld>
      <Button onClick={anfordern} style={{ marginTop: 6 }}>Link anfordern</Button>
      <button onClick={onZurAnmeldung} style={{ display: 'block', margin: '16px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>
        Zurück zur Anmeldung
      </button>
    </div>
  );
}
Object.assign(window, { FunkePasswortReset });
