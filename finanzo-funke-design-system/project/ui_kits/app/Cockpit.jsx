/* Cockpit (F4) — Erstattungs-Held, Vollständigkeit, GG-Widget, Fund-Zähler. */
const { Button, Chip, Pill, AiChip, BeraterLeiste, HerkunftsChip, Ring, Balken, Sticker, Sheet, Banner } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeCockpit({ hinweise, onUmsetzen, onVerwerfen, geheZu, delta }) {
  const [lueckenOffen, setLueckenOffen] = React.useState(false);
  /* Gewerbe-Wartezustand: kein Angestellten-Mock für Selbstständige */
  const [gewerbeWarte, setGewerbeWarte] = React.useState(() => {
    try { return localStorage.getItem('funke.gewerbeWarte') === '1'; } catch (e) { return false; }
  });
  /* Aufbau: Erstattung zählt hoch, Ring sweept, Balken wachsen — reduced-motion überspringt */
  const ruhig = React.useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [anim, setAnim] = React.useState(ruhig ? 1 : 0);
  React.useEffect(() => {
    if (ruhig) return;
    const start = performance.now();
    const dauer = 950;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dauer);
      setAnim(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const offen = hinweise.filter((h) => h.status === 'offen');
  /* Interview-Antworten steuern den Grenzgänger-Branch */
  const gg = React.useMemo(() => {
    try { const a = JSON.parse(localStorage.getItem('funke.interview')) || {}; return a.schweiz !== 'Nein'; }
    catch (e) { return true; }
  }, []);
  const partner = React.useMemo(() => {
    try { const a = JSON.parse(localStorage.getItem('funke.interview')) || {}; return a.partner === 'Ja'; }
    catch (e) { return false; }
  }, []);
  const fund = hinweise.filter((h) => h.status === 'umgesetzt').reduce((s, h) => s + h.betrag, 122);
  /* M5: Zusatz-Einkünfte aus dem Interview */
  const extra = React.useMemo(() => {
    try { const a = JSON.parse(localStorage.getItem('funke.interview')) || {}; return { kap: a.einkuenfte === 'Kapitalerträge' || a.einkuenfte === 'Beides', kapAusland: a.kap === 'ausland', verm: a.vermietung === 'einfach' || a.vermietung === 'mehrere', vermMehrere: a.vermietung === 'mehrere', kinder: a.kinder && a.kinder !== 'Nein', rente: a.job === 'Rente' }; }
    catch (e) { return { kap: false, kapAusland: false, verm: false, vermMehrere: false, kinder: false, rente: false }; }
  }, []);
  /* M6: Frist-Warnmodus ab 60 Tagen */
  const tageFrist = Math.max(0, Math.ceil((new Date('2027-07-31') - Date.now()) / 86400000));
  /* Fix 2: Vorbereitungs-Modus (Gewerbe fehlt — Erklärung ist unteilbar) */
  const gewVor = React.useMemo(() => { try { return localStorage.getItem('funke.gewerbeVorbereiten') === '1'; } catch (e) { return false; } }, []);
  /* Fix 5: Schätzung + Anlage-N-Fortschritt fallen aus dem Interview — kein 1.200-€-Minimum */
  const basis = React.useMemo(() => {
    try { const s = parseInt(localStorage.getItem('funke.schaetzung'), 10); return Number.isFinite(s) ? s : window.FunkeDemo.schaetzung; } catch (e) { return window.FunkeDemo.schaetzung; }
  }, []);
  const nPct = React.useMemo(() => {
    try { const a = JSON.parse(localStorage.getItem('funke.interview')) || {}; const n = ['homeoffice', 'weg', 'arbeitstage', 'fortbildung'].filter((k) => a[k] !== undefined).length; return n ? 40 + n * 10 : 80; } catch (e) { return 80; }
  }, []);

  if (gewerbeWarte) {
    return (
      <div>
        <div className="appbar">
          <h1>Steuerjahr</h1>
          <Pill>2026</Pill>
        </div>
        <div className="fk-karte nacht">
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Du bist vorgemerkt</span>
          <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 32, lineHeight: 1.1, margin: '8px 0 6px' }}>Gewerbe kommt — wir melden uns.</div>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Sobald EÜR, Anlage G/S und Umsatzsteuer sitzen, bekommst du eine Nachricht. Bis dahin bleibt dein Cockpit leer — ehrlich ist ehrlich.</p>
        </div>
        <Button variante="ghost" onClick={() => { try { localStorage.removeItem('funke.gewerbeWarte'); } catch (e) {} setGewerbeWarte(false); }}>Doch als Angestellter starten</Button>
      </div>
    );
  }
  const erstattung = basis + fund - 122;
  /* ADR-015: Spanne statt Punktwert — verengt sich pro geklärter Angabe; Konflikt hält sie offen */
  const spanneBreite = window.FunkeDemo.offeneAngaben * 40;
  const konfliktOffen = 1; /* Demo: „Monitor" in Belege (Beleg 480 € ≠ Eingabe 500 €) */
  /* Progressionsvorbehalt (ADR-035): Lohnersatz verschiebt die Spanne sichtbar */
  const lohnersatz = React.useMemo(() => { try { return localStorage.getItem('funke.lohnersatz') === '1'; } catch (e) { return false; } }, []);
  const branches = [
    { name: 'Anlage N', pct: nPct },
    { name: 'Vorsorge', pct: 70 },
    { name: 'Sonderausg.', pct: 60 },
    ...(extra.rente ? [{ name: 'Anlage R', pct: 55 }] : []),
    ...(extra.kinder ? [{ name: 'Anlage Kind', pct: 50 }] : []),
    ...(extra.kap ? [{ name: extra.kapAusland ? 'Anlage KAP (Ausland)' : 'Anlage KAP', pct: 35 }] : []),
    ...(extra.verm ? [{ name: extra.vermMehrere ? 'Anlage V (2 Objekte)' : 'Anlage V', pct: 25 }] : []),
    ...(gg ? [{ name: 'Grenzgänger', pct: 45 }] : []),
  ];
  const luecken = [
    { br: 'Anlage N', was: 'Arbeitstage 2026 bestätigen', ziel: 'uebertragen' },
    { br: 'Belege', was: 'Beleg „Fortbildung" prüfen', ziel: 'belege' },
    { br: 'Stammdaten', was: 'IBAN für die Erstattung', ziel: 'profil' },
  ];

  return (
    <div>
      <div className="appbar">
        <h1>Steuerjahr</h1>
        <Pill>2026</Pill>
      </div>
      {tageFrist > 60 ? (
        <p className="mono-label num" style={{ margin: '-10px 0 14px' }}>Abgabe bis 31.07.2027 · noch {tageFrist} Tage</p>
      ) : (
        <button onClick={() => geheZu('uebertragen')} className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'var(--warn-weich)', borderColor: 'var(--warn)', boxShadow: '3px 3px 0 var(--warn)', marginTop: '-4px' }}>
          <div>
            <b style={{ color: 'var(--warn)' }}>Frist: noch {tageFrist} Tage</b>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Danach mindestens 25 € Verspätungszuschlag pro Monat (§ 152 AO) — jetzt übertragen →</span>
          </div>
        </button>
      )}

      {gewVor && (
        <Banner art="warnung"><b>Vorbereitungs-Modus:</b> Dein Angestellten-Teil wird komplett — abgegeben wird erst mit deinem Gewerbe. Eine Erklärung ist unteilbar.</Banner>
      )}

      <div className="ck-grid">
      <div>
      <div className="fk-karte nacht">
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Voraussichtliche Erstattung</span>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 44, color: 'var(--funke)', lineHeight: 1.05, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {Math.round((erstattung - spanneBreite / 2) * anim).toLocaleString('de-DE')}–{Math.round((erstattung + spanneBreite / 2) * anim).toLocaleString('de-DE')} €
          {delta > 0 && <Sticker key={delta + erstattung}>+{delta} €</Sticker>}
        </div>
        <p style={{ margin: '6px 0 10px', fontSize: 13, color: 'var(--nacht-text)', opacity: 0.75 }}>
          Die Spanne wird enger, je mehr du klärst: <b className="num">{window.FunkeDemo.offeneAngaben}</b> Angaben offen · noch ≈ {window.FunkeDemo.minutenOffen} Minuten.
          {konfliktOffen > 0 && <button onClick={() => geheZu('belege')} style={{ display: 'inline', color: 'var(--warn)', fontWeight: 700, textDecoration: 'underline', marginLeft: 6 }}>± {konfliktOffen} Konflikt offen →</button>}
        </p>
        {lohnersatz && (
          <p style={{ margin: '-4px 0 10px', fontSize: 13, color: 'var(--nacht-text)', opacity: 0.75 }}>Elterngeld eingerechnet: steuerfrei, hebt aber deinen Satz — die Spanne berücksichtigt das schon. Keine Überraschung im Bescheid.</p>
        )}
        <HerkunftsChip quelle={{ regel: 'SCHÄTZ-01 · Stand 2026', rechenweg: 'Spanne = ungeklärte Angaben × 40 €; Grenzsteuersatz 30 % (Näherung), WK-Pauschbetrag 1.230 €' }} />
      </div>

      {/* Eulen-Modus (ADR-037/038): EINE violette Sammelkarte — Fund + Fragen wohnen im Abruf */}
      <window.FunkeEulenEinstieg onAbruf={() => geheZu('berater')}></window.FunkeEulenEinstieg>

      <div className="fk-karte">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Ring pct={Math.round(68 * anim)} />
          <div style={{ flex: 1 }}>
            {branches.map((b) => (
              <button key={b.name} onClick={() => setLueckenOffen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 0', textAlign: 'left' }}>
                <span style={{ width: 92, fontSize: 13, flex: 'none', fontWeight: 600 }}>{b.name}</span>
                <Balken pct={Math.round(b.pct * anim)} style={{ flex: 1 }} />
                <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 12, width: 30, textAlign: 'right' }}>{b.pct}</span>
              </button>
            ))}
          </div>
        </div>
        <Chip onClick={() => setLueckenOffen(true)} style={{ marginTop: 10 }}>Was fehlt noch? ({luecken.length})</Chip>
      </div>

      {gg && (
        <button onClick={() => geheZu('ggtracker')} className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
          <div>
            <b>Nichtrückkehrtage</b>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Grenzgänger-Status: sicher — Tage pflegen →</span>
          </div>
          <span className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 28 }}>
            {window.FunkeDemo.gg.stand}<span style={{ fontSize: 14, color: 'var(--tinte-2)' }}>/{window.FunkeDemo.gg.max}</span>
          </span>
        </button>
      )}

      <button onClick={() => geheZu('lebenslagen')} className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
        <div>
          <b>+ Lebenslage</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Umzug, Abfindung, Elterngeld, Zahnarzt … — was sich ändert, zieht steuerlich mit</span>
        </div>
        <span aria-hidden="true" style={{ fontWeight: 800, flex: 'none' }}>→</span>
      </button>

      {extra.kap && (
        <div className="fk-karte" style={{ borderColor: 'var(--warn)', boxShadow: '3px 3px 0 var(--warn)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <b style={{ color: 'var(--warn)' }}>Kein Freistellungsauftrag hinterlegt</b>
            <b className="num" style={{ flex: 'none', color: 'var(--warn)' }}>+137 €</b>
          </div>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)', margin: '6px 0 10px' }}>Deine Bank hat auf 812 € Zinsen 137 € Steuer einbehalten, obwohl sie unter dem Sparerpauschbetrag (1.000 €) liegen. Wir holen sie über die Anlage KAP zurück — dieses Jahr automatisch, fürs nächste stell den Freistellungsauftrag bei der Bank.</span>
          <HerkunftsChip quelle={{ beleg: 'Jahressteuerbescheinigung Bank', regel: 'KAP-SPB-1000', rechenweg: '812 € < 1.000 € → Kapitalertragsteuer 137 € erstattungsfähig' }} />
        </div>
      )}

      {extra.verm && !extra.vermMehrere && (
        <div className="fk-karte" style={{ textAlign: 'center', padding: '22px 16px', borderStyle: 'dashed' }}>
          <b style={{ fontSize: 15 }}>Noch kein Mietobjekt angelegt</b>
          <p style={{ margin: '6px auto 12px', fontSize: 13, color: 'var(--tinte-2)', maxWidth: 320 }}>Für die Anlage V brauchen wir deine Wohnung: Adresse, Mieteinnahmen, Nebenkosten. Fünf Minuten — dann rechnen wir Abschreibung und Werbungskosten selbst.</p>
          <Button variante="leise" style={{ width: 'auto', minHeight: 42 }} onClick={() => geheZu('lebenslagen')}>Objekt anlegen</Button>
        </div>
      )}

      <button onClick={() => geheZu('bescheid')} className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
        <div>
          <b>Dein Bescheid {window.FunkeDemo.bescheid.jahr} ist da</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>1 Abweichung — Einspruch lohnt sich vielleicht →</span>
        </div>
        <span className="fk-sticker num" style={{ background: 'var(--warn-weich)', color: 'var(--warn)', borderColor: 'var(--warn)', boxShadow: '2px 2px 0 var(--warn)', fontSize: 13 }}>{window.FunkeDemo.bescheid.delta} €</span>
      </button>

      {extra.kinder && (
        <div className="fk-karte">
          <b>Kindergeld oder Freibetrag?</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)', marginTop: 4 }}>Musst du nicht entscheiden — das Finanzamt prüft automatisch, was mehr bringt. Wir zeigen dir das Ergebnis im Bescheid-Vergleich.</span>
        </div>
      )}

      {partner && (
        <button onClick={() => geheZu('veranlagung')} className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
          <div>
            <b>Zusammen oder einzeln veranlagen?</b>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>Beide Wege gerechnet — aktuell vorn: zusammen →</span>
          </div>
          <span className="fk-sticker num" style={{ fontSize: 13 }}>+{window.FunkeDemo.veranlagung.zusammen - window.FunkeDemo.veranlagung.einzeln} €</span>
        </button>
      )}
      </div>

      <div>
      <div className="fk-ai-karte" data-ai="true">
        <AiChip>Berater</AiChip>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 28, margin: '10px 0 2px', color: 'var(--ki-tinte)' }}>{fund} € gefunden</div>
        {offen.length > 0 ? (
          <div>
            <p style={{ margin: '2px 0 12px', fontSize: 13, color: 'var(--ki-tinte)' }}>{offen.length} Hinweis{offen.length > 1 ? 'e' : ''} offen</p>
            {offen.map((h) => (
              <div key={h.id} style={{ marginBottom: 12 }}>
                <b style={{ fontSize: 14 }}>{h.titel}</b>
                <span style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>{h.detail}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variante="leise" style={{ minHeight: 42 }} onClick={() => onUmsetzen(h.id)}>Übernehmen (+{h.betrag} €)</Button>
                  <Button variante="ghost" style={{ minHeight: 42 }} onClick={() => onVerwerfen(h.id)}>Trifft nicht zu</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: '2px 0 0', fontSize: 13 }}>Keine offenen Hinweise — verworfene tauchen nicht wieder auf.</p>
        )}
      </div>

      <Button onClick={() => geheZu('belege')}>Nächster Schritt: 2 Belege prüfen</Button>
      <BeraterLeiste text="Was fehlt noch zur Abgabe? Frag mich." onOeffnen={() => geheZu('berater')} />
      </div>
      </div>

      {lueckenOffen && (
        <Sheet titel={`Lücken-Liste (${luecken.length})`} onClose={() => setLueckenOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--tinte-2)' }}>Aus dem Vollständigkeits-Report — jede Zeile führt dich direkt zur Lösung.</p>
          {luecken.map((l, i) => (
            <button key={i} onClick={() => { setLueckenOffen(false); geheZu(l.ziel); }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', borderBottom: '1.5px solid var(--linie-weich)', padding: '12px 0', minHeight: 52 }}>
              <span style={{ fontFamily: 'var(--schrift-mono)', fontSize: 11, color: 'var(--tinte-2)', width: 92, flex: 'none' }}>{l.br}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{l.was}</span>
              <span style={{ fontWeight: 800 }}>→</span>
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
Object.assign(window, { FunkeCockpit });
