/* Splash (REQ-033-Muster: Marke zeichnet sich, Antippen überspringt) +
   Onboarding: Name → Steuer-ID → Steuernummer → Maske vorgefüllt.
   Angaben bleiben lokal (localStorage 'funke.onboarding.profil'). */
const { Button, Input, Feld, Chip, Pill, Sticker } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeSplash({ onFertig }) {
  React.useEffect(() => {
    const t = setTimeout(onFertig, 2400);
    return () => clearTimeout(t);
  }, [onFertig]);
  return (
    <button className="fx-splash" onClick={onFertig} aria-label="Weiter zur App">
      <svg className="fx-marke" viewBox="0 0 96 96" width="104" height="104" aria-hidden="true">
        <g className="au-kopf">
          <path d="M20 36 L30 10 L41 24 Z" fill="var(--funke)"></path>
          <path d="M76 36 L66 10 L55 24 Z" fill="var(--funke)"></path>
          <rect x="14" y="20" width="68" height="64" rx="30" fill="var(--funke)"></rect>
          <path d="M48 58 L55 65 L48 74 L41 65 Z" fill="var(--nacht)"></path>
        </g>
        <g className="au-brille">
          <rect x="42" y="44" width="12" height="6" rx="3" fill="var(--nacht)"></rect>
          <circle cx="33" cy="47" r="14" fill="var(--nacht)"></circle>
          <circle cx="63" cy="47" r="14" fill="var(--nacht)"></circle>
          <circle cx="36" cy="45" r="5.5" fill="var(--funke)"></circle>
          <circle cx="66" cy="45" r="5.5" fill="var(--funke)"></circle>
          <rect className="au-lid" x="19" y="33" width="28" height="28" rx="14" fill="var(--funke)"></rect>
          <rect className="au-lid" x="49" y="33" width="28" height="28" rx="14" fill="var(--funke)"></rect>
        </g>
      </svg>
      <span className="fx-wort">Steuer<b>Eule</b></span>
      <span className="fx-claim">Steuern? <i>Zack,</i> erledigt.</span>
      <span className="fx-tipp">Tippen zum Überspringen</span>
    </button>
  );
}

/* Steuer-ID: 11 Ziffern → "12 345 678 901" */
function formatSteuerId(roh) {
  const z = roh.replace(/\D/g, '').slice(0, 11);
  return z.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,3}).*$/, (m, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' ')
  );
}
/* Steuernummer (verkürzt, länderabhängig): bis 13 Ziffern → "12/345/67890" */
function formatSteuerNr(roh) {
  const z = roh.replace(/\D/g, '').slice(0, 13);
  return z.replace(/^(\d{2,3})(\d{0,3})(\d{0,5}).*$/, (m, a, b, c) =>
    [a, b, c].filter(Boolean).join('/')
  );
}

const LEER = { vorname: '', nachname: '', steuerId: '', steuerNr: '' };

function FunkeOnboarding({ onFertig }) {
  const [profil, setProfil] = React.useState(() => {
    try { return { ...LEER, ...(JSON.parse(localStorage.getItem('funke.onboarding.profil')) || {}) }; }
    catch (e) { return LEER; }
  });
  const [schritt, setSchritt] = React.useState(0);
  const set = (k) => (v) => setProfil((p) => ({ ...p, [k]: v }));
  const idZiffern = profil.steuerId.replace(/\D/g, '').length;

  const SCHRITTE = [
    {
      titel: <span>Wer bist <em className="fx-mark">du</em>?</span>,
      hilfe: 'Genau wie im Ausweis — damit die Maske exakt stimmt.',
      ok: profil.vorname.trim() && profil.nachname.trim(),
      inhalt: (
        <div>
          <Feld label="Vorname"><Input value={profil.vorname} onChange={set('vorname')} placeholder="Kim" autoFocus /></Feld>
          <Feld label="Nachname"><Input value={profil.nachname} onChange={set('nachname')} placeholder="Yilmaz" /></Feld>
        </div>
      ),
    },
    {
      titel: <span>Deine <em className="fx-mark">Steuer-ID</em></span>,
      hilfe: '11 Ziffern, lebenslang gleich — steht oben auf jedem Brief vom Finanzamt.',
      ok: idZiffern === 11,
      inhalt: (
        <div>
          <Feld label="Steuer-Identifikationsnummer">
            <Input value={profil.steuerId} onChange={(v) => set('steuerId')(formatSteuerId(v))} placeholder="12 345 678 901" inputMode="numeric" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, letterSpacing: '0.04em' }} autoFocus />
          </Feld>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono-label num">{idZiffern}/11 Ziffern</span>
            {idZiffern === 11 && <Sticker key="ok" style={{ fontSize: 13 }}>sitzt ✓</Sticker>}
          </div>
        </div>
      ),
    },
    {
      titel: <span>Noch die <em className="fx-mark">Steuernummer</em></span>,
      hilfe: 'Steht auf deinem letzten Bescheid. Keinen zur Hand? Später geht auch.',
      ok: true,
      inhalt: (
        <div>
          <Feld label="Steuernummer (optional)">
            <Input value={profil.steuerNr} onChange={(v) => set('steuerNr')(formatSteuerNr(v))} placeholder="12/345/67890" inputMode="numeric" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, letterSpacing: '0.04em' }} autoFocus />
          </Feld>
          <Chip onClick={() => { set('steuerNr')(''); weiter(); }}>Hab ich nicht zur Hand — später</Chip>
        </div>
      ),
    },
  ];

  function weiter() {
    if (schritt === SCHRITTE.length - 1) {
      try { localStorage.setItem('funke.onboarding.profil', JSON.stringify(profil)); } catch (e) {}
      setSchritt(3);
    } else {
      setSchritt(schritt + 1);
    }
  }

  if (schritt === 3) {
    const zeilen = [
      ['Vorname', profil.vorname],
      ['Nachname', profil.nachname],
      ['Steuer-ID', profil.steuerId],
      ['Steuernummer', profil.steuerNr || 'später'],
    ];
    return (
      <div className="fx-schritt" key="fertig">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 6px' }}>
          <h1 style={{ fontSize: 40, fontWeight: 800 }}>Zack.</h1>
          <Sticker style={{ fontSize: 14 }}>vorgefüllt</Sticker>
        </div>
        <p style={{ margin: '0 0 18px', color: 'var(--tinte-2)' }}>Deine Maske ist vorbereitet — jede Angabe kannst du jederzeit ändern.</p>
        <div className="fk-karte nacht">
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Deine Maske</span>
          {zeilen.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1.5px solid var(--nacht-karte)', padding: '10px 0', fontSize: 15 }}>
              <span style={{ opacity: 0.7 }}>{k}</span>
              <b className="num" style={{ fontFamily: k.startsWith('Steuer') ? 'var(--schrift-mono)' : 'inherit', color: 'var(--funke)' }}>{v}</b>
            </div>
          ))}
        </div>
        <Button onClick={onFertig}>Weiter zum Interview →</Button>
        <Button variante="ghost" style={{ marginTop: 10 }} onClick={() => setSchritt(0)}>Angaben ändern</Button>
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Bleibt auf diesem Gerät, bis du überträgst.</p>
      </div>
    );
  }

  const s = SCHRITTE[schritt];
  return (
    <div className="fx-schritt" key={schritt}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 22px' }}>
        {schritt > 0 ? (
          <button onClick={() => setSchritt(schritt - 1)} aria-label="Zurück" style={{ width: 44, height: 44, border: 'var(--kontur) solid var(--tinte)', borderRadius: 999, background: 'var(--karte)', boxShadow: 'var(--schatten-hart-s)', fontWeight: 800 }}>←</button>
        ) : (
          <img src="../../assets/marke-tinte.svg" width="34" height="34" alt="SteuerEule" />
        )}
        <div style={{ display: 'flex', gap: 6, flex: 1 }} role="progressbar" aria-valuenow={schritt + 1} aria-valuemin={1} aria-valuemax={3}>
          {SCHRITTE.map((x, i) => (
            <i key={i} style={{ flex: 1, height: 8, borderRadius: 4, border: '1.5px solid var(--tinte)', background: i <= schritt ? 'var(--funke)' : 'var(--karte)', transition: 'background var(--t-flott)' }}></i>
          ))}
        </div>
        <Pill>{schritt + 1}/3</Pill>
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>{s.titel}</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>{s.hilfe}</p>
      {s.inhalt}
      <Button onClick={weiter} disabled={!s.ok} style={{ marginTop: 18 }}>Weiter</Button>
    </div>
  );
}
Object.assign(window, { FunkeSplash, FunkeOnboarding });
