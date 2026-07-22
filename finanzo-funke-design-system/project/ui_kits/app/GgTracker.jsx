/* Grenzgänger-Tracker — Nichtrückkehrtage markieren, 60er-Grenze immer sichtbar. */
const { Button, Chip, Pill, Banner, Balken, HerkunftsChip, Toast, Begriff, Sheet, Sticker } = window.FinanzoFunkeDesignSystem_7e417e;

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul'];

function FunkeGgTracker({ startTage = 52, onZurueck }) {
  /* Juli 2026: 31 Tage, beginnt Mi (Index 2 bei Mo-Start) */
  const [markiert, setMarkiert] = React.useState(() => new Set([2, 3, 9, 16, 22]));
  const [monat, setMonat] = React.useState('Jul');
  const [toast, setToast] = React.useState('');
  const [kursModus, setKursModus] = React.useState('jahr');
  const [kursBeleg, setKursBeleg] = React.useState(false); /* ADR-012: tatsächlicher Kurs nur mit Kontoauszug */
  /* ADR-029/036: Lohnausweis-Maske — CHF führt, EUR daneben; unsichere Felder markiert */
  const [lohnOffen, setLohnOffen] = React.useState(false);
  const [lohnDa, setLohnDa] = React.useState(false);
  const KURS = 1.07;
  const ZIFFERN = [
    { z: '1', label: 'Bruttolohn', chf: 88400, sicher: true },
    { z: '9', label: 'Beiträge AHV/IV/ALV', chf: 5590, sicher: true },
    { z: '10.1', label: 'Pensionskasse (2. Säule)', chf: 6120, sicher: false },
    { z: '12', label: 'Quellensteuer', chf: 3978, sicher: true },
  ];
  const vorher = startTage;
  const gesamt = vorher + markiert.size;
  const kritisch = gesamt >= 55;
  const gekippt = gesamt >= 60;

  function toggle(tag) {
    const n = new Set(markiert);
    n.has(tag) ? n.delete(tag) : n.add(tag);
    setMarkiert(n);
  }

  return (
    <div>
      <div className="appbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onZurueck ? <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800 }}>←</button> : <a href="index.html" aria-label="Zurück zur App" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>←</a>}
          <h1>Grenzgänger</h1>
        </div>
        <Pill>DBA Schweiz</Pill>
      </div>

      <div className="fk-karte nacht">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Schweizer Lohnausweis</span>
          {lohnDa && <Sticker style={{ fontSize: 13 }}>Übernommen</Sticker>}
        </div>
        <p style={{ margin: '8px 0 12px', fontSize: 13, opacity: 0.8 }}>{lohnDa ? 'Ziffern 1–12 sind gemappt — jede Zahl trägt Ziffer und Kurs als Herkunft.' : 'Fotografieren, wir lesen die Ziffern und rechnen um — kein Abtippen. Unsichere Felder zeigen wir dir zum Bestätigen.'}</p>
        <Button variante="nacht" style={{ borderColor: 'var(--funke)', width: 'auto' }} onClick={() => setLohnOffen(true)}>{lohnDa ? 'Ziffern ansehen' : 'Lohnausweis scannen'}</Button>
      </div>

      <div className="fk-karte">
        <span className="mono-label">Deine CH-Bausteine — automatisch angesetzt</span>
        {[
          ['Quellensteuer 4,5 % wird angerechnet', lohnDa ? '3.978 CHF · ≈ 4.256 €' : 'aus Ziffer 12', { regel: 'DBA CH Art. 15a Abs. 3', rechenweg: 'Anrechnung auf die deutsche Einkommensteuer' }],
          ['Pensionskasse als Vorsorgeaufwand', lohnDa ? '6.120 CHF · ≈ 6.548 €' : 'aus Ziffer 10.1', { regel: 'BMF v. 27.07.2016', rechenweg: 'Obligatorium wie gesetzliche RV behandelt' }],
          ['Säule 3a — erfasst, Grenzen ehrlich', 'auf Nachweis', { regel: 'begrenzt abziehbar', rechenweg: 'privates Vorsorgeprodukt — kein voller Abzug wie in der Schweiz' }],
          ['CH-Krankenkasse als Basisvorsorge', 'aus deinen Prämien', { regel: '§ 10 Abs. 1 Nr. 3 EStG', rechenweg: 'Grundversicherung wie deutsche Basis-KV' }],
          ['Kinderzulage mit Kindergeld verrechnet', 'aus Ziffer 7', { regel: '§ 65 EStG', rechenweg: 'CH-Familienzulage mindert deutsches Kindergeld — die Günstigerprüfung rechnet damit' }],
        ].map(([t, w, q]) => (
          <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1.5px solid var(--linie-weich)', padding: '9px 0', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 160 }}>{t}</span>
            <span className="num" style={{ color: 'var(--tinte-2)', fontFamily: 'var(--schrift-mono)', fontSize: 12 }}>{w}</span>
            <HerkunftsChip quelle={q} />
          </div>
        ))}
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--tinte-2)' }}>Alles kombinierbar — Kapital, Vermietung, Kinder laufen parallel weiter, nichts beißt sich.</p>
      </div>

      <div className={kritisch ? 'fk-karte' : 'fk-karte nacht'} style={kritisch ? { borderColor: 'var(--fehler)', boxShadow: '4px 4px 0 var(--fehler)' } : {}}>
        <span className="mono-label" style={{ color: kritisch ? 'var(--fehler)' : 'var(--funke-hell)' }}>Nichtrückkehrtage 2026</span>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 48, lineHeight: 1.05, color: kritisch ? 'var(--fehler)' : 'var(--funke)' }}>
          {gesamt}<span style={{ fontSize: 22, opacity: 0.7 }}>/60</span>
        </div>
        <Balken pct={Math.min(100, (gesamt / 60) * 100)} style={{ margin: '10px 0 6px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>{Math.max(0, 60 - gesamt)} Tage Puffer</span>
          <HerkunftsChip quelle={{ regel: 'GG-NRT-60 · DBA Schweiz Art. 15a', rechenweg: `${vorher} übernommen + ${markiert.size} markiert` }} />
        </div>
      </div>

      {gekippt ? (
        <div className="fk-karte" style={{ borderColor: 'var(--fehler)', boxShadow: '4px 4px 0 var(--fehler)' }}>
          <span className="mono-label" style={{ color: 'var(--fehler)' }}>60 erreicht — Status gekippt</span>
          <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 24, lineHeight: 1.15, margin: '6px 0' }}>Ab jetzt besteuert die Schweiz deinen Lohn.</div>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--tinte-2)' }}>Ehrlich: Den gekippten Fall (Quellensteuer, Aufteilung, Ansässigkeit) kann SteuerEule noch nicht rechnen — der gehört dieses Jahr in Profi-Hände. Was jetzt zählt:</p>
          {['Markierte Tage prüfen — jeder falsch markierte Tag zählt gegen dich', 'Ansässigkeitsbescheinigung beim Finanzamt anfordern', 'Steuerprofi mit DBA-Schweiz-Erfahrung — nimm deinen Tracker-Export mit'].map((s, n) => (
            <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'baseline', borderBottom: n < 2 ? '1.5px solid var(--linie-weich)' : 'none', padding: '8px 0', fontSize: 14 }}>
              <b className="num" style={{ flex: 'none', color: 'var(--fehler)' }}>{n + 1}</b><span>{s}</span>
            </div>
          ))}
          <Button variante="ghost" style={{ marginTop: 8 }} onClick={() => { setToast('Demo — Tracker-Export (PDF) startet'); setTimeout(() => setToast(''), 1400); }}>Tracker-Export für den Profi</Button>
        </div>
      ) : kritisch ? (
        <Banner art="gefahr">Nur noch {60 - gesamt} Tage bis zur Grenze — ab 60 kippt die Besteuerung in die Schweiz.</Banner>
      ) : null}

      <div className="fk-karte">
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, scrollbarWidth: 'none' }} role="tablist" aria-label="Monat wählen">
          {MONATE.map((m) => <Chip key={m} aktiv={m === monat} onClick={() => setMonat(m)} style={{ flex: 'none', minHeight: 36 }}>{m}</Chip>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, maxWidth: 440 }}>
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
            <span key={w} className="mono-label" style={{ textAlign: 'center', fontSize: 10 }}>{w}</span>
          ))}
          {Array.from({ length: 2 }).map((x, n) => <i key={'l' + n}></i>)}
          {Array.from({ length: 31 }).map((x, n) => {
            const tag = n + 1;
            const an = markiert.has(tag);
            const we = (n + 2) % 7 >= 5;
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                aria-pressed={an}
                aria-label={`${tag}. Juli als Nichtrückkehrtag ${an ? 'entfernen' : 'markieren'}`}
                className="num fx-tag"
                style={{
                  aspectRatio: '1', minHeight: 40, borderRadius: 10, fontSize: 13, fontWeight: 700,
                  border: an ? 'var(--kontur) solid var(--tinte)' : '1.5px solid var(--linie-weich)',
                  background: an ? 'var(--funke)' : we ? 'var(--grund)' : 'var(--karte)',
                  boxShadow: an ? 'var(--schatten-hart-s)' : 'none',
                  color: we && !an ? 'var(--tinte-2)' : 'var(--tinte)',
                  transition: 'all var(--t-schnell) var(--zack)',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '12px 0 0' }}>Tippen markiert einen <Begriff titel="Nichtrückkehrtag" erklaerung="Ein Arbeitstag, nach dem du aus beruflichen Gründen nicht an deinen Wohnort zurückgekehrt bist — etwa wegen Montage, Bereitschaft oder später Schicht mit Hotel. Bleibst du an mehr als 60 solcher Tage weg, gilst du nicht mehr als Grenzgänger und die Schweiz besteuert deinen Lohn." beispiel="Projektwoche in Zürich, Mo–Do im Hotel = 4 Tage">Nichtrückkehrtag</Begriff> — eine Übernachtung wegen Arbeit nicht zuhause. Wochenenden zählen mit, wenn beruflich.</p>
        <Button variante="ghost" style={{ marginTop: 12 }} onClick={() => { setToast('Demo — PDF-Liste aller markierten Tage'); setTimeout(() => setToast(''), 1400); }}>Tage-Liste exportieren (PDF)</Button>
      </div>

      <div className="fk-karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="mono-label">Umrechnung CHF → EUR</span>
          <Pill>Vorläufig</Pill>
        </div>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 26, margin: '6px 0 2px' }}>1 CHF = 1,07 €</div>
        <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }} role="tablist" aria-label="Kurs-Modus">
          <Chip aktiv={kursModus === 'jahr'} onClick={() => setKursModus('jahr')} style={{ minHeight: 32, fontSize: 12 }}>Jahresmittel</Chip>
          <Chip aktiv={kursModus === 'monat'} onClick={() => setKursModus('monat')} style={{ minHeight: 32, fontSize: 12 }}>Monatskurse</Chip>
          <Chip aktiv={kursModus === 'echt'} onClick={() => setKursModus('echt')} style={{ minHeight: 32, fontSize: 12 }}>Tatsächlicher Kurs</Chip>
        </div>
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '0 0 8px' }}>{kursModus === 'jahr' ? 'Du trägst nie einen Kurs ein: aktuell EZB-Jahresmittel — der amtliche Kurs kommt im Januar 2027, wir tauschen ihn automatisch und rechnen neu.' : kursModus === 'monat' ? 'Monatskurse lohnen sich bei stark schwankendem Franken — wir rechnen beide Wege und zeigen dir die Differenz vor der Abgabe.' : 'Dein echter Kurs vom Kontoauszug — zulässig und oft günstiger, aber nur mit Nachweis. Ohne Kontoauszug bleibt der amtliche Kurs.'}</p>
        {kursModus === 'echt' && !kursBeleg && (
          <Button variante="leise" style={{ minHeight: 40, width: 'auto', marginBottom: 8 }} onClick={() => setKursBeleg(true)}>Kontoauszug hochladen (Demo)</Button>
        )}
        {kursModus === 'echt' && kursBeleg && (
          <p style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 700, margin: '0 0 8px' }}>✓ Kontoauszug liegt bei — dein Kurs gilt für Juli.</p>
        )}
        <HerkunftsChip quelle={kursModus === 'echt' && kursBeleg ? { beleg: 'Kontoauszug Juli 2026', regel: 'GG-KURS-ECHT · belegpflichtig' } : { regel: 'GG-KURS-2026 · vorläufig', rechenweg: 'EZB-Referenzkurse, Jahresmittel Jan–Jul 2026 = 1,07' }} />
      </div>

      <Button variante="ghost" onClick={() => { setToast('Kalender-Import kommt mit 2.0 — Demo'); setTimeout(() => setToast(''), 1400); }}>Tage aus Kalender importieren</Button>
      {lohnOffen && (
        <Sheet titel="Lohnausweis — Ziffer für Ziffer" onClose={() => setLohnOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--tinte-2)' }}>Wie auf dem Papier: CHF führt, daneben der Euro-Wert (Kurs 1,07 · Jahresmittel). Gelb markiert = bitte kurz prüfen.</p>
          {ZIFFERN.map((x) => (
            <div key={x.z} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1.5px solid var(--linie-weich)', padding: '10px 0', background: x.sicher ? 'transparent' : 'var(--warn-weich)', borderRadius: x.sicher ? 0 : 8, paddingLeft: x.sicher ? 0 : 8 }}>
              <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 12, color: 'var(--tinte-2)', width: 36, flex: 'none' }}>{x.z}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{x.label}{!x.sicher && <b style={{ display: 'block', fontSize: 11, color: 'var(--warn)' }}>unsicher gelesen — stimmt das?</b>}</span>
              <b className="num" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{x.chf.toLocaleString('de-CH')} CHF</b>
              <span className="num" style={{ fontSize: 12, color: 'var(--tinte-2)', whiteSpace: 'nowrap' }}>≈ {Math.round(x.chf * KURS).toLocaleString('de-DE')} €</span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--tinte-2)' }}>Das Foto bleibt als Beleg gespeichert — jede Zeile in Übertragen trägt „Lohnausweis Ziffer n × Kurs" als Herkunft.</p>
          <Button onClick={() => { setLohnDa(true); setLohnOffen(false); setToast('4 Ziffern übernommen — Anlage N-Gre befüllt'); setTimeout(() => setToast(''), 1800); }}>{lohnDa ? 'Passt weiterhin' : 'Alle Ziffern übernehmen'}</Button>
        </Sheet>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}
Object.assign(window, { FunkeGgTracker });
