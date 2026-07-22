/* Lebenslagen-Katalog (ADR-031/035/036) — 10 kuratierte Einträge, jeder mit echtem Flow.
   Highlights: Abfindungs-Rechner (Fünftelregelung, Vorher/Nachher) + agB-Live-Schwelle. */
const { Button, Chip, Pill, Input, Sheet, Toast, Balken, HerkunftsChip, Sticker, Begriff } = window.FinanzoFunkeDesignSystem_7e417e;

const LAGEN = [
  { id: 'dhf', titel: 'Zwei Wohnungen wegen des Jobs', amt: 'Doppelte Haushaltsführung', text: 'Miete der Zweitwohnung (bis 1.000 €/Monat), eine Heimfahrt pro Woche, drei Monate Verpflegungspauschale.' },
  { id: 'umzug', titel: 'Beruflich umgezogen', amt: 'Umzugskostenpauschale', text: 'Pauschale ohne Einzelbelege — plus Speditions- und Fahrtkosten mit Beleg.' },
  { id: 'abfindung', titel: 'Abfindung bekommen', amt: 'Fünftelregelung · § 34 EStG', rechner: 'abfindung', text: 'Seit 2025 gibt es die Ermäßigung NUR noch über die Steuererklärung — wer sie verpasst, verschenkt oft vierstellig.' },
  { id: 'lohnersatz', titel: 'Elterngeld, Kurzarbeit oder Krankengeld', amt: 'Progressionsvorbehalt', text: 'Steuerfrei — hebt aber deinen Steuersatz. Wir rechnen den Effekt in deine Spanne ein, damit der Bescheid dich nicht überrascht.' },
  { id: 'nebenjob', titel: 'Nebenjob oder Minijob', amt: 'Zweites Arbeitsverhältnis', text: 'Minijob (556 €): steuerfrei, taucht nirgends auf — nichts zu tun. Zweitjob auf Klasse 6: Lohnsteuerbescheinigung einfach mit reinwerfen.' },
  { id: 'krankheit', titel: 'Hohe Krankheitskosten', amt: 'Außergewöhnliche Belastung', rechner: 'agb', text: 'Zahnarzt, Brille, Zuzahlungen — zählt erst über deiner zumutbaren Grenze. Wir zeigen sie dir live.' },
  { id: 'pausch', titel: 'Behinderung oder Pflege', amt: 'Pauschbeträge § 33b EStG', text: 'Grad der Behinderung eintragen — der Pauschbetrag (620–7.400 €) kommt ohne Einzelbelege.' },
  { id: 'unterhalt', titel: 'Unterhalt an Angehörige', amt: 'Anlage Unterhalt', text: 'Bis 12.096 € je unterstützter Person — eigenes Einkommen der Person wird gegengerechnet.' },
  { id: 'riester', titel: 'Riester oder Rürup', amt: 'Anlage AV / Vorsorgeaufwand', text: 'Beiträge aus der Jahresbescheinigung — Zulagen und Sonderausgabenabzug rechnen wir gegeneinander.' },
  { id: 'kirche', titel: 'Kirchensteuer & große Spenden', amt: 'Sonderausgaben + Vortrag', text: 'Gezahlte Kirchensteuer voll absetzbar; Spenden über 20 % vom Einkommen wandern automatisch ins nächste Jahr.' },
];

function FunkeLebenslagen({ onZurueck, onBerater }) {
  const [suche, setSuche] = React.useState('');
  const [offen, setOffen] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const [aktiv, setAktiv] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('funke.lebenslagen')) || []; } catch (e) { return []; }
  });
  /* Abfindungs-Rechner */
  const [abf, setAbf] = React.useState('24000');
  const abfN = parseInt(abf, 10) || 0;
  const ohne = Math.round(abfN * 0.42);
  const mit = Math.round(abfN * 0.42 - abfN * 0.091);
  /* agB-Live-Schwelle */
  const grenze = 1842; /* 4 % von 46.050 € (1 Kind) — Demo */
  const [agb, setAgb] = React.useState('620');
  const agbN = parseInt(agb, 10) || 0;

  function aktivieren(id) {
    const neu = [...new Set([...aktiv, id])];
    setAktiv(neu);
    try { localStorage.setItem('funke.lebenslagen', JSON.stringify(neu)); if (id === 'lohnersatz') localStorage.setItem('funke.lohnersatz', '1'); } catch (e) {}
    setOffen(null);
    setToast('Angelegt — du findest es ab jetzt im Cockpit');
    setTimeout(() => setToast(''), 1800);
  }
  const treffer = LAGEN.filter((l) => !suche || (l.titel + ' ' + l.amt + ' ' + l.text).toLowerCase().includes(suche.toLowerCase()));
  const lage = LAGEN.find((l) => l.id === offen);

  return (
    <div>
      <div className="appbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onZurueck ? <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800 }}>←</button> : <a href="index.html" aria-label="Zurück zur App" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>←</a>}
          <h1>Lebenslagen</h1>
        </div>
        <Pill>{aktiv.length} aktiv</Pill>
      </div>
      <p style={{ margin: '-6px 0 14px', fontSize: 13, color: 'var(--tinte-2)' }}>Alles hier funktioniert wirklich — antippen zeigt, was es bringt.</p>
      <Input value={suche} onChange={(v) => setSuche(v)} placeholder="Suchen — z. B. Umzug, Elterngeld, Zahnarzt" style={{ marginBottom: 14 }} />
      {treffer.length === 0 && (
        <div className="fk-karte" style={{ textAlign: 'center', fontSize: 14, color: 'var(--tinte-2)' }}>Nichts gefunden zu „{suche}" — <button onClick={onBerater} style={{ textDecoration: 'underline', fontWeight: 700 }}>frag den Berater</button>, ob es steuerlich zählt.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
      {treffer.map((l) => (
        <button key={l.id} onClick={() => setOffen(l.id)} className="fk-karte" style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', margin: 0, padding: '12px 14px', minHeight: 60 }}>
          <b style={{ fontSize: 14, lineHeight: 1.25, flex: 1, minWidth: 0 }}>{l.titel}</b>
          {aktiv.includes(l.id) ? <span style={{ color: 'var(--ok)', fontWeight: 800, flex: 'none' }} aria-hidden="true">✓</span> : <span aria-hidden="true" style={{ fontWeight: 800, flex: 'none', color: 'var(--tinte-2)' }}>→</span>}
        </button>
      ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center', marginTop: 14 }}>Fehlt was? Kommt — steht erst hier, wenn es komplett funktioniert.</p>

      {lage && (
        <Sheet titel={lage.titel} onClose={() => setOffen(null)}>
          <p style={{ marginTop: 0, fontSize: 12, color: 'var(--tinte-2)', fontFamily: 'var(--schrift-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lage.amt}</p>
          <p style={{ fontSize: 14 }}>{lage.text}</p>
          {lage.rechner === 'abfindung' && (
            <div className="fk-karte" style={{ background: 'var(--funke-weich)' }}>
              <span className="mono-label">Dein Fünftel-Effekt</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0' }}>
                <Input value={abf} onChange={(v) => setAbf(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, width: 130, textAlign: 'center' }} />
                <span style={{ fontWeight: 700 }}>€ Abfindung</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px dashed var(--linie-weich)', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--tinte-2)' }}>Steuer ohne Ermäßigung</span><b className="num">≈ {ohne.toLocaleString('de-DE')} €</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: 'var(--tinte-2)' }}>Mit <Begriff titel="Fünftelregelung" erklaerung="Die Abfindung wird rechnerisch auf fünf Jahre verteilt — so bleibt dein Steuersatz niedriger, obwohl das Geld auf einmal kommt. Seit 2025 macht das nicht mehr der Arbeitgeber, sondern nur noch deine Steuererklärung." beispiel="24.000 € Abfindung → oft über 2.000 € weniger Steuer">Fünftelregelung</Begriff></span><b className="num">≈ {mit.toLocaleString('de-DE')} €</b>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <Sticker style={{ fontSize: 14 }}>−{(ohne - mit).toLocaleString('de-DE')} € Steuer</Sticker>
                <HerkunftsChip quelle={{ regel: '§ 34 EStG · Näherung', rechenweg: 'Fünftelung bei 42 % Grenzsteuersatz — exakt rechnen wir mit deinen echten Zahlen' }} />
              </div>
            </div>
          )}
          {lage.rechner === 'agb' && (
            <div className="fk-karte" style={{ background: 'var(--funke-weich)' }}>
              <span className="mono-label">Deine zumutbare Grenze: <b className="num">{grenze.toLocaleString('de-DE')} €</b></span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0' }}>
                <Input value={agb} onChange={(v) => setAgb(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 22, width: 130, textAlign: 'center' }} />
                <span style={{ fontWeight: 700 }}>€ bisher</span>
              </div>
              <Balken pct={Math.min(100, (agbN / grenze) * 100)} style={{ margin: '4px 0 8px' }} />
              <p style={{ margin: 0, fontSize: 13, color: agbN > grenze ? 'var(--ok)' : 'var(--tinte-2)', fontWeight: agbN > grenze ? 700 : 400 }}>
                {agbN > grenze ? `Über der Grenze — ${(agbN - grenze).toLocaleString('de-DE')} € zählen.` : `Ehrlich: erst ab ${grenze.toLocaleString('de-DE')} € wirkt sich das aus — noch ${(grenze - agbN).toLocaleString('de-DE')} € entfernt. Sammeln lohnt trotzdem, das Jahr ist noch nicht rum.`}
              </p>
              <div style={{ marginTop: 8 }}>
                <HerkunftsChip quelle={{ regel: '§ 33 EStG · zumutbare Belastung', rechenweg: '4 % von 46.050 € Einkommen (1 Kind) — stufenweise gerechnet' }} />
              </div>
            </div>
          )}
          <Button onClick={() => aktivieren(lage.id)}>{aktiv.includes(lage.id) ? 'Bleibt aktiv' : 'Zu meinem Steuerjahr hinzufügen'}</Button>
          <Button variante="ghost" style={{ marginTop: 10 }} onClick={onBerater}>Unsicher? Frag den Berater</Button>
        </Sheet>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}
Object.assign(window, { FunkeLebenslagen });
