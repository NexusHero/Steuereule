/* Interview (F1) — eine Frage pro Screen, große Optionen, sofortiges Geld-Feedback.
   Antworten landen in localStorage 'funke.interview' — Cockpit/Übertragen lesen sie. */
const { Button, Input, Option, Pill, Sticker, Chip, Begriff } = window.FinanzoFunkeDesignSystem_7e417e;

const FRAGEN = [
  { id: 'job', frage: <span>Woher kam dein <em className="fx-mark">Geld</em> 2026?</span>, hilfe: 'Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.', optionen: ['Angestellt', 'Selbstständig', 'Beides', 'Rente'], },
  { id: 'partner', frage: <span>Verheiratet oder <em className="fx-mark">verpartnert</em>?</span>, hilfe: 'Dann rechnen wir Zusammen- und Einzelveranlagung — und empfehlen, was mehr bringt.', optionen: ['Ja', 'Nein'], },
  { id: 'kinder', frage: <span>Hast du <em className="fx-mark">Kinder</em>?</span>, hilfe: 'Kindergeld, Freibeträge, Betreuungskosten — die Günstigerprüfung Kindergeld vs. Freibetrag läuft automatisch.', optionen: ['Nein', '1 Kind', '2 oder mehr'], },
  { id: 'homeoffice', frage: <span>Wie oft <em className="fx-mark">Homeoffice</em>?</span>, hilfe: '6 € pro Tag, bis 1.260 € im Jahr.', optionen: ['Nie', '1–2 Tage pro Woche', 'Fast immer'], impact: [0, 80, 210], },
  { id: 'weg', frage: <span>Wie weit ist dein <em className="fx-mark">Arbeitsweg</em>?</span>, hilfe: 'Einfache Strecke, in Kilometern — 0,30 €/km ab Tag eins.', eingabe: 'km', },
  { id: 'tage', frage: <span>Wie viele <em className="fx-mark">Arbeitstage</em> 2026?</span>, hilfe: 'Musst du nicht wissen — sag uns Urlaub und Krankheit, den Rest rechnen wir aus dem Kalender 2026.', eingabe: 'tage', },
  { id: 'fortbildung', frage: <span>Selbst für <em className="fx-mark">Fortbildung</em> bezahlt?</span>, hilfe: 'Kurse, Fachbücher, Prüfungsgebühren — voll absetzbar.', optionen: ['Ja', 'Nein'], impact: [120, 0], },
  { id: 'einkuenfte', frage: <span>Noch andere <em className="fx-mark">Einkünfte</em>?</span>, hilfe: <span>Kapitalerträge bis zum{' '}<Begriff titel="Sparerpauschbetrag" erklaerung="1.000 € Zinsen und Kursgewinne im Jahr sind steuerfrei — einfach so, für alle. Erst ab dem 1.001sten Euro will das Amt etwas sehen. Mit einem Freistellungsauftrag bei deiner Bank wird gar nicht erst etwas abgezogen." beispiel="812 € Erträge → 0 € Steuer" frage="Was ist der Sparerpauschbetrag?">Sparerpauschbetrag</Begriff>{' '}decken wir ab — Vermietung in einfachen Fällen.</span>, optionen: ['Nein', 'Kapitalerträge', 'Vermietung', 'Beides'], },
  { id: 'schweiz', frage: <span>Pendelst du zum Arbeiten ins <em className="fx-mark">Ausland</em>?</span>, hilfe: 'Grenzgänger haben Sonderregeln — in die Schweiz können wir sie komplett, inklusive 60-Tage-Tracking.', optionen: ['Ja, in die Schweiz', 'In ein anderes Land', 'Nein'], },
];

function FunkeInterview({ onFertig }) {
  const [i, setI] = React.useState(0);
  const [antworten, setAntworten] = React.useState({});
  const [km, setKm] = React.useState('');
  const [wochen, setWochen] = React.useState('5');
  const [urlaub, setUrlaub] = React.useState('');
  const [krank, setKrank] = React.useState('');
  const [delta, setDelta] = React.useState(0);

  /* Arbeitstage-Rechner: Werktage 2026 je Wochenmodell − Feiertage (auf Werktage) − Urlaub − Krankheit */
  const WERK = { '5': 260, '4': 208, '3': 156 };
  const FEI = { '5': 9, '4': 7, '3': 5 };
  const arbeitstage = Math.max(0, WERK[wochen] - FEI[wochen] - (parseInt(urlaub, 10) || 0) - (parseInt(krank, 10) || 0));

  const f = FRAGEN[i];
  const fertig = i >= FRAGEN.length;
  /* Fix 5: Schätzung fällt aus den Antworten — darf auch ehrlich klein sein */
  const hoImp = { 'Nie': 0, '1–2 Tage pro Woche': 80, 'Fast immer': 210 }[antworten.homeoffice] || 0;
  const kmEff = Math.round((parseInt(km, 10) || 0) * (antworten.arbeitstage || 210) * 0.3 * 0.3);
  const schaetzung = 150 + hoImp + kmEff + (antworten.fortbildung === 'Ja' ? 120 : 0);
  React.useEffect(() => { if (fertig) { try { localStorage.setItem('funke.schaetzung', String(schaetzung)); } catch (e) {} } }, [fertig, schaetzung]);

  function antworte(idx, wert) {
    const imp = f.impact ? f.impact[idx] : 0;
    const neu = { ...antworten, [f.id]: wert };
    setAntworten(neu);
    try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
    /* Gewerbe-Gate: Selbstständig/Beides → ehrliches „noch nicht" statt stillem Durchrutschen */
    if (f.id === 'job' && wert === 'Angestellt') { try { localStorage.removeItem('funke.gewerbeVorbereiten'); } catch (e) {} }
    if (f.id === 'job' && wert !== 'Angestellt' && wert !== 'Rente') { setTimeout(() => setI(-1), 250); return; }
    /* Vermietungs-Verzweigung (M5) */
    if (f.id === 'einkuenfte' && (wert === 'Vermietung' || wert === 'Beides')) { setTimeout(() => setI(-2), 250); return; }
    /* KAP-Verzweigung (ADR-032): deutsche Depots + ausländische Broker ok, Krypto ehrlich gaten */
    if (f.id === 'einkuenfte' && wert === 'Kapitalerträge') { setTimeout(() => setI(-5), 250); return; }
    /* CH-only-Gate (ADR-013): andere Länder ehrlich abweisen statt halbgar rechnen */
    if (f.id === 'schweiz' && wert === 'In ein anderes Land') { setTimeout(() => setI(-4), 250); return; }
    if (imp > 0) { setDelta(imp); setTimeout(() => setDelta(0), 1600); }
    setTimeout(() => setI(i + 1), imp > 0 ? 550 : 250);
  }
  function kmWeiter() {
    const n = parseInt(km, 10) || 0;
    const neu = { ...antworten, weg: n };
    setAntworten(neu);
    try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
    if (n > 5) { setDelta(Math.round(n * 210 * 0.3 * 0.3)); setTimeout(() => setDelta(0), 1600); }
    setTimeout(() => setI(i + 1), n > 5 ? 550 : 250);
  }
  function tageWeiter() {
    const neu = { ...antworten, arbeitstage, arbeitstageDetail: { wochen, urlaub: parseInt(urlaub, 10) || 0, krank: parseInt(krank, 10) || 0 } };
    setAntworten(neu);
    try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
    setTimeout(() => setI(i + 1), 250);
  }
  function vermWeiter(verm) {
    const neu = { ...antworten, vermietung: verm };
    setAntworten(neu);
    try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
    setI(FRAGEN.findIndex((x) => x.id === 'einkuenfte') + 1);
  }

  /* Gewerbe-Gate */
  if (i === -1) {
    return (
      <div className="fx-schritt" key="gewerbe">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Ehrlich: dafür sind wir <em className="fx-mark">noch</em> nicht gut genug.</h1>
        <p style={{ margin: '0 0 10px', color: 'var(--tinte-2)' }}>Selbstständige brauchen EÜR, Anlage G/S und Umsatzsteuer — das kann SteuerEule in Version 1 nicht. Halbe Steuererklärungen liefern wir nicht.</p>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Was heute schon geht: <b>vorbereiten</b>. Bei „Beides" sammeln wir deinen Angestellten-Teil komplett ein — abgegeben wird erst, wenn das Gewerbe drin ist. Eine Steuererklärung ist unteilbar.</p>
        {antworten.job === 'Beides' && <Option gewaehlt={false} onClick={() => { try { localStorage.removeItem('funke.gewerbeWarte'); localStorage.setItem('funke.gewerbeVorbereiten', '1'); } catch (e) {} setI(1); }}>Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe</Option>}
        <Option gewaehlt={false} onClick={() => { try { localStorage.setItem('funke.gewerbeWarte', '1'); } catch (e) {} window.location.href = 'index.html'; }}>Benachrichtigt mich, wenn Gewerbe kommt</Option>
        <button onClick={() => setI(0)} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Zurück zur Frage</button>
      </div>
    );
  }

  /* Vermietungs-Verzweigung (M5): einfacher Fall geführt, komplexer ehrlich abgegeben */
  if (i === -2) {
    return (
      <div className="fx-schritt" key="vermietung">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Wie sieht deine <em className="fx-mark">Vermietung</em> aus?</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Einfache und mittlere Fälle führen wir komplett — nur Sonderfälle geben wir ehrlich ab.</p>
        <Option gewaehlt={false} onClick={() => vermWeiter('einfach')}>Eine vermietete Wohnung, kein Verkauf</Option>
        <Option gewaehlt={false} onClick={() => vermWeiter('mehrere')}>Mehrere Wohnungen, ganzjährig vermietet</Option>
        <Option gewaehlt={false} onClick={() => setI(-3)}>Verkauf oder möbliert auf Zeit</Option>
        <button onClick={() => setI(FRAGEN.findIndex((x) => x.id === 'einkuenfte'))} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Zurück zur Frage</button>
      </div>
    );
  }
  /* KAP-Verzweigung (ADR-032) */
  if (i === -5) {
    const kapWeiter = (art) => {
      const neu = { ...antworten, kap: art };
      setAntworten(neu);
      try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
      setI(FRAGEN.findIndex((x) => x.id === 'einkuenfte') + 1);
    };
    return (
      <div className="fx-schritt" key="kap">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Wo liegt dein <em className="fx-mark">Depot</em>?</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Deutsche Broker führen die Steuer selbst ab — ausländische nicht, da rechnen wir die Anlage KAP komplett für dich. Beides geht.</p>
        <Option gewaehlt={false} onClick={() => kapWeiter('de')}>Deutscher Broker (z. B. Trade Republic, ING)</Option>
        <Option gewaehlt={false} onClick={() => kapWeiter('ausland')}>Ausländischer Broker (z. B. IBKR, Revolut)</Option>
        <Option gewaehlt={false} onClick={() => setI(-6)}>Auch Krypto verkauft</Option>
        <button onClick={() => setI(FRAGEN.findIndex((x) => x.id === 'einkuenfte'))} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Zurück zur Frage</button>
      </div>
    );
  }
  if (i === -6) {
    const weiterOhne = () => {
      const neu = { ...antworten, kap: 'de', kryptoWunsch: '1' };
      setAntworten(neu);
      try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
      setI(FRAGEN.findIndex((x) => x.id === 'einkuenfte') + 1);
    };
    return (
      <div className="fx-schritt" key="krypto">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Ehrlich: Krypto können wir <em className="fx-mark">noch</em> nicht.</h1>
        <p style={{ margin: '0 0 10px', color: 'var(--tinte-2)' }}>Haltefristen, Anschaffungsreihenfolge, private Veräußerungsgeschäfte — das braucht eine eigene Rechenlogik, und halb gerechnet wäre falsch gerechnet.</p>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Deine Aktien- und ETF-Erträge nehmen wir trotzdem komplett mit — nur die Krypto-Verkäufe gehören dieses Jahr in andere Hände.</p>
        <Option gewaehlt={false} onClick={weiterOhne}>Vormerken — Depot ohne Krypto weitermachen</Option>
        <button onClick={() => setI(-5)} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Zurück</button>
      </div>
    );
  }

  /* CH-only-Gate (ADR-013) */
  if (i === -4) {
    const schliesse = (vormerken) => {
      const neu = { ...antworten, schweiz: 'Nein', auslandWunsch: vormerken ? '1' : '' };
      setAntworten(neu);
      try { localStorage.setItem('funke.interview', JSON.stringify(neu)); } catch (e) {}
      setI(FRAGEN.length);
    };
    return (
      <div className="fx-schritt" key="ausland">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Ehrlich: andere Länder können wir <em className="fx-mark">noch</em> nicht.</h1>
        <p style={{ margin: '0 0 10px', color: 'var(--tinte-2)' }}>Jedes Land hat sein eigenes Abkommen mit eigenen Regeln — Österreich und Frankreich mit Grenzzonen, Luxemburg mit Bagatellgrenze. Halb gerechnet wäre falsch gerechnet.</p>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Was heute geht: die <b>Schweiz komplett</b> — und dein restliches Steuerjahr sowieso. Österreich, Frankreich und Luxemburg stehen auf der Liste.</p>
        <Option gewaehlt={false} onClick={() => schliesse(true)}>Vormerken — sag mir, wenn mein Land kommt</Option>
        <Option gewaehlt={false} onClick={() => schliesse(false)}>Ohne Auslands-Teil weitermachen</Option>
        <button onClick={() => setI(FRAGEN.findIndex((x) => x.id === 'schweiz'))} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Zurück zur Frage</button>
      </div>
    );
  }

  if (i === -3) {
    return (
      <div className="fx-schritt" key="vermgate">
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '28px 0 8px' }}>Ehrlich: Verkauf und Möbliert-auf-Zeit können wir <em className="fx-mark">noch</em> nicht.</h1>
        <p style={{ margin: '0 0 10px', color: 'var(--tinte-2)' }}>Veräußerungsgewinne und Sonderfälle brauchen mehr, als Version 1 kann. Eine halbe Anlage V liefern wir nicht.</p>
        <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>Was heute geht: <b>alles andere</b> aus deinem Steuerjahr — die Vermietung lässt du dieses Jahr beim Profi.</p>
        <Option gewaehlt={false} onClick={() => vermWeiter('gate')}>Ohne Vermietung weitermachen</Option>
        <button onClick={() => setI(-2)} style={{ display: 'block', margin: '14px auto 0', fontSize: 14, textDecoration: 'underline', minHeight: 44 }}>Zurück</button>
      </div>
    );
  }

  if (fertig) {
    const summe = schaetzung;
    return (
      <div className="fx-schritt" key="fertig">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 6px' }}>
          <h1 style={{ fontSize: 40, fontWeight: 800 }}>Das war's schon.</h1>
          <Sticker style={{ fontSize: 14 }}>Profil steht</Sticker>
        </div>
        <p style={{ margin: '0 0 18px', color: 'var(--tinte-2)' }}>Ein paar Antworten, und dein Steuerjahr hat eine Richtung.</p>
        <div className="fk-karte nacht">
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Erste Schätzung</span>
          <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 48, color: 'var(--funke)', lineHeight: 1.05 }}>≈ {summe.toLocaleString('de-DE')} €</div>
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.75 }}>{summe < 300 ? 'Ehrlich: viel ist bei dir nicht zu holen — dafür bist du in Minuten fertig.' : 'Noch grob — jeder Beleg macht sie genauer.'}</p>
        </div>
        {antworten.eulenOptIn !== '0' && (
          <div className="fk-karte" data-ai="true" style={{ borderColor: 'var(--ki)', margin: '0 0 14px', textAlign: 'left' }}>
            {antworten.eulenOptIn === '1' ? (
              <p style={{ margin: 0, fontSize: 14 }}><b style={{ color: 'var(--ki)' }}>Eulen-Modus ist an.</b> Ich lese Rechtsänderungen, finde Lücken und frage nach — du entscheidest immer. Abschalten geht im Profil.</p>
            ) : (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 14 }}><b style={{ color: 'var(--ki)' }}>Soll ich ab jetzt mitdenken?</b> Ich lese Rechtsänderungen, finde Lücken und melde mich, wenn Geld liegen bleibt — du entscheidest immer.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variante="leise" style={{ minHeight: 42, width: 'auto', fontSize: 13 }} onClick={() => { if (window.funkeSetEulenAn) window.funkeSetEulenAn(true); setAntworten({ ...antworten, eulenOptIn: '1' }); }}>Ja, denk mit</Button>
                  <Button variante="ghost" style={{ minHeight: 42, width: 'auto', fontSize: 13 }} onClick={() => setAntworten({ ...antworten, eulenOptIn: '0' })}>Später</Button>
                </div>
              </div>
            )}
          </div>
        )}
        <Button onClick={onFertig}>Ins Cockpit →</Button>
        <Button variante="ghost" style={{ marginTop: 10 }} onClick={() => { setI(0); setAntworten({}); setKm(''); }}>Nochmal durchgehen</Button>
      </div>
    );
  }

  return (
    <div className="fx-schritt" key={i}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 22px' }}>
        {i > 0 ? (
          <button onClick={() => setI(i - 1)} aria-label="Zurück" style={{ width: 44, height: 44, border: 'var(--kontur) solid var(--tinte)', borderRadius: 999, background: 'var(--karte)', boxShadow: 'var(--schatten-hart-s)', fontWeight: 800, flex: 'none' }}>←</button>
        ) : (
          <img src="../../assets/marke-tinte.svg" width="34" height="34" alt="SteuerEule" />
        )}
        <div style={{ display: 'flex', gap: 6, flex: 1 }} role="progressbar" aria-valuenow={i + 1} aria-valuemin={1} aria-valuemax={FRAGEN.length}>
          {FRAGEN.map((x, n) => (
            <i key={n} style={{ flex: 1, height: 8, borderRadius: 4, border: '1.5px solid var(--tinte)', background: n <= i ? 'var(--funke)' : 'var(--karte)', transition: 'background var(--t-flott)' }}></i>
          ))}
        </div>
        <Pill>{i + 1}/{FRAGEN.length}</Pill>
      </div>

      <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 8 }}>{f.frage}</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--tinte-2)' }}>{f.hilfe}</p>

      {f.optionen && f.optionen.map((o, idx) => (
        <Option key={o} gewaehlt={antworten[f.id] === o} onClick={() => antworte(idx, o)}>{o}</Option>
      ))}
      {f.eingabe === 'km' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Input value={km} onChange={(v) => setKm(v.replace(/\D/g, '').slice(0, 3))} placeholder="28" inputMode="numeric" autoFocus style={{ fontFamily: 'var(--schrift-mono)', fontSize: 26, width: 120, textAlign: 'center' }} />
            <span style={{ fontWeight: 700, fontSize: 18 }}>km</span>
          </div>
          <Button onClick={kmWeiter} disabled={!km} style={{ marginTop: 18 }}>Weiter</Button>
        </div>
      )}
      {f.eingabe === 'tage' && (
        <div>
          <div className="mono-label" style={{ marginBottom: 8 }}>Deine Woche</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[['5-Tage-Woche', '5'], ['4-Tage-Woche', '4'], ['3-Tage-Woche', '3']].map(([l, v]) => (
              <Chip key={v} aktiv={wochen === v} onClick={() => setWochen(v)}>{l}</Chip>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <label style={{ flex: 1 }}>
              <span className="mono-label" style={{ display: 'block', marginBottom: 6 }}>Urlaubstage</span>
              <Input value={urlaub} onChange={(v) => setUrlaub(v.replace(/\D/g, '').slice(0, 2))} placeholder="30" inputMode="numeric" autoFocus style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, textAlign: 'center', width: '100%' }} />
            </label>
            <label style={{ flex: 1 }}>
              <span className="mono-label" style={{ display: 'block', marginBottom: 6 }}>Krankheitstage</span>
              <Input value={krank} onChange={(v) => setKrank(v.replace(/\D/g, '').slice(0, 2))} placeholder="0" inputMode="numeric" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, textAlign: 'center', width: '100%' }} />
            </label>
          </div>
          <div className="fk-karte" aria-live="polite">
            {[
              ['Werktage 2026 (' + wochen + '-Tage-Woche)', WERK[wochen]],
              ['− Feiertage auf Werktagen', '−' + FEI[wochen]],
              ['− Urlaub', '−' + (parseInt(urlaub, 10) || 0)],
              ['− Krankheit', '−' + (parseInt(krank, 10) || 0)],
            ].map(([l, w]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px dashed var(--linie-weich)', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--tinte-2)' }}>{l}</span><b className="num">{w}</b>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px' }}>
              <b style={{ fontSize: 14 }}>Deine Arbeitstage</b>
              <span className="fk-sticker num" style={{ fontSize: 15 }}>{arbeitstage}</span>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--tinte-2)' }}>Feiertage: bundesweiter Schnitt — dein Bundesland präzisiert das später im Profil. Jede Zahl bleibt änderbar.</p>
          </div>
          <Button onClick={tageWeiter} disabled={urlaub === ''} style={{ marginTop: 4 }}>{arbeitstage} Arbeitstage übernehmen</Button>
        </div>
      )}

      {delta > 0 && (
        <div style={{ position: 'fixed', bottom: 90, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <Sticker key={delta}>≈ +{delta} € drin</Sticker>
        </div>
      )}
    </div>
  );
}
Object.assign(window, { FunkeInterview });
