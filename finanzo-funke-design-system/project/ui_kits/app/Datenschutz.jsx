/* Datenschutz (DSGVO) — plakativ UND präzise: „Deine Daten. Deine Regeln."
   Kein Marketing-Nebel: jede Behauptung konkret, jedes Recht mit Aktion. */
const { Button, Chip, Pill, Sheet, Toast } = window.FinanzoFunkeDesignSystem_7e417e;

const SCHUTZ = [
  { titel: 'Verschlüsselt — immer', text: 'TLS beim Übertragen, AES-256 auf dem Server. Belege liegen nie unverschlüsselt.' },
  { titel: 'Server in Deutschland', text: 'Frankfurt am Main. Keine Drittland-Übermittlung, kein US-Cloud-Zugriff auf Steuerdaten.' },
  { titel: 'Nie verkauft, nie beworben', text: 'Keine Werbung, kein Tracking-Netzwerk, kein Datenverkauf. Wir verdienen am Abgabe-Paket — sonst nichts.' },
  { titel: 'KI ohne Gedächtnis', text: 'Der Berater rechnet auf unseren Servern in Deutschland. Deine Unterlagen trainieren keine Modelle.' },
];

const RECHTE = [
  { art: 'Art. 15', recht: 'Auskunft', aktion: 'Alles exportieren (ZIP)' },
  { art: 'Art. 17', recht: 'Löschen', aktion: 'Konto & Daten löschen — ein Tap' },
  { art: 'Art. 16', recht: 'Berichtigung', aktion: 'Jede Zahl direkt änderbar' },
  { art: 'Art. 20', recht: 'Übertragbarkeit', aktion: 'Export in offenen Formaten' },
];

function FunkeDatenschutz({ onZurueck, geheZu }) {
  const [toast, setToast] = React.useState('');
  function zeigeToast(t) { setToast(t); setTimeout(() => setToast(''), 1400); }
  return (
    <div className="fx-bau">
      <div className="appbar" style={{ gap: 12 }}>
        <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: 'var(--kontur) solid var(--tinte)', borderRadius: 999, background: 'var(--karte)', boxShadow: 'var(--schatten-hart-s)', fontWeight: 800, flex: 'none' }}>←</button>
        <h1 style={{ marginRight: 'auto' }}>Datenschutz</h1>
        <Pill>DSGVO</Pill>
      </div>

      <div className="fk-karte nacht">
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Ernst gemeint, nicht kleingedruckt</span>
        <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 36, lineHeight: 1.05, margin: '8px 0 6px' }}>Deine Daten.<br />Deine Regeln.</div>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Steuerdaten sind das Privateste, was eine App anfassen kann. Deshalb steht hier alles — kurz, konkret, nachprüfbar.</p>
      </div>

      {SCHUTZ.map((s) => (
        <div key={s.titel} className="fk-karte">
          <b style={{ fontSize: 15 }}>{s.titel}</b>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tinte-2)' }}>{s.text}</p>
        </div>
      ))}

      <div className="fk-karte" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mono-label" style={{ padding: '12px 16px 4px' }}>Deine Rechte — mit einem Tap</div>
        {RECHTE.map((r) => (
          <button key={r.art} onClick={() => zeigeToast('Demo — im Profil unter „Deine Daten"')} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, fontSize: 14 }}>
            <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 11, color: 'var(--tinte-2)', width: 52, flex: 'none' }}>{r.art}</span>
            <b style={{ width: 110, flex: 'none' }}>{r.recht}</b>
            <span style={{ flex: 1, color: 'var(--tinte-2)', fontSize: 13 }}>{r.aktion}</span>
            <span aria-hidden="true" style={{ fontWeight: 800 }}>→</span>
          </button>
        ))}
      </div>

      <div className="fk-karte">
        <b style={{ fontSize: 15 }}>Ehrlich: was wir sehen — und was nie</b>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tinte-2)' }}>Wir sehen, was du hochlädst und beantwortest — dafür ist die App da. Wir sehen <b>nie</b>: dein ELSTER-Passwort, deine Kontobewegungen, dein Adressbuch. Im Gast-Modus verlässt nichts dein Gerät.</p>
      </div>

      <Button variante="ghost" onClick={() => (geheZu ? geheZu('profil') : onZurueck())}>Zu „Deine Daten" im Profil</Button>
      {toast && <Toast text={toast} />}
    </div>
  );
}
Object.assign(window, { FunkeDatenschutz });
