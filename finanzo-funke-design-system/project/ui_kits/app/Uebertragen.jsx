/* Übertragen (F6) — Zeile für Zeile mit Copy + Abhaken, Export-Kanäle. Bewusst KI-minimal. */
const { Button, Chip, Pill, HerkunftsChip, KiWert, Sheet, Toast, Banner } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeUebertragen({ zeilen, onToggle, onAbgabe }) {
  const [detailZeile, setDetailZeile] = React.useState(null);
  /* Grenzgänger-Zeilen nur, wenn das Interview „Schweiz: Ja" ergab (Default: zeigen) */
  const gg = React.useMemo(() => {
    try { const a = JSON.parse(localStorage.getItem('funke.interview')) || {}; return a.schweiz !== 'Nein'; }
    catch (e) { return true; }
  }, []);
  const sichtbareZeilenGg = gg ? zeilen : zeilen.filter((z) => z.anlage !== 'Anlage N-Gre');
  /* M5: KAP/V-Zeilen nur bei entsprechenden Interview-Angaben */
  const flags = React.useMemo(() => {
    try { const a = JSON.parse(localStorage.getItem('funke.interview')) || {}; return { kap: a.einkuenfte === 'Kapitalerträge' || a.einkuenfte === 'Beides', verm: a.vermietung === 'einfach' || a.vermietung === 'mehrere', kinder: a.kinder && a.kinder !== 'Nein', rente: a.job === 'Rente' }; }
    catch (e) { return { kap: false, verm: false, kinder: false, rente: false }; }
  }, []);
  const sichtbareZeilen = sichtbareZeilenGg.filter((z) => (z.anlage === 'Anlage KAP' ? flags.kap : z.anlage === 'Anlage V' ? flags.verm : z.anlage === 'Anlage Kind' ? flags.kinder : z.anlage === 'Anlage R' ? flags.rente : true));
  /* Fix 2: Vorbereitungs-Modus — Abgabe blockiert, solange das Gewerbe fehlt */
  const gewVor = React.useMemo(() => { try { return localStorage.getItem('funke.gewerbeVorbereiten') === '1'; } catch (e) { return false; } }, []);
  const anlagen = [...new Set(sichtbareZeilen.map((z) => z.anlage))];
  const [anlage, setAnlage] = React.useState(anlagen[0]);
  const [toast, setToast] = React.useState('');
  const [ericOffen, setEricOffen] = React.useState(false);
  const [pruefOffen, setPruefOffen] = React.useState(false);
  const erledigt = sichtbareZeilen.filter((z) => z.erledigt).length;
  const sichtbar = sichtbareZeilen.filter((z) => z.anlage === anlage);
  /* Erledigtes kollabiert: ab 2 bestätigten Zeilen falten sie zu einer Zeile zusammen */
  const [fertigeOffen, setFertigeOffen] = React.useState(false);
  const fertige = sichtbar.filter((z) => z.erledigt);
  const kollabiert = fertige.length >= 2 && !fertigeOffen;
  const zeigeZeilen = kollabiert ? sichtbar.filter((z) => !z.erledigt) : sichtbar;

  function kopieren(wert) {
    try { navigator.clipboard.writeText(wert); } catch (e) {}
    setToast('Kopiert');
    setTimeout(() => setToast(''), 1200);
  }

  return (
    <div>
      <div className="appbar">
        <h1>Übertragen</h1>
        <Pill>{erledigt}/{sichtbareZeilen.length}{'\u00A0'}übertragen</Pill>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }} role="tablist" aria-label="Anlage wählen">
        {anlagen.map((a) => <Chip key={a} aktiv={a === anlage} onClick={() => { setAnlage(a); setFertigeOffen(false); }} style={{ flex: 'none' }}>{a}</Chip>)}
      </div>

      {erledigt === sichtbareZeilen.length && sichtbareZeilen.length > 0 && (gewVor ? (
        <Banner art="warnung"><b>Alles vorbereitet — Abgabe wartet.</b> Dein Angestellten-Teil ist komplett. Abgegeben wird erst mit deinem Gewerbe — eine Erklärung ist unteilbar.</Banner>
      ) : (
        <div className="fk-karte nacht">
          <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Alles bestätigt</span>
          <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 28, lineHeight: 1.1, margin: '6px 0 6px' }}>Alle Zeilen übertragen.</div>
          <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>In Mein ELSTER abgeschickt? Dann mach den Sack zu.</p>
          <Button variante="nacht" style={{ borderColor: 'var(--funke)' }} onClick={() => (onAbgabe ? onAbgabe() : (window.location.href = 'abgabe.html'))}>Ja, abgeschickt →</Button>
        </div>
      ))}

      <div className="fk-karte">
        {kollabiert && (
          <button onClick={() => setFertigeOffen(true)} aria-expanded="false" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 0', borderBottom: '1.5px solid var(--linie-weich)', minHeight: 48, fontSize: 14 }}>
            <span style={{ color: 'var(--ok)', fontWeight: 800 }} aria-hidden="true">✓</span>
            <span><b className="num">{fertige.length}</b> bestätigte Zeilen</span>
            <span aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--tinte-2)', fontSize: 12 }}>anzeigen ▸</span>
          </button>
        )}
        {zeigeZeilen.map((z) => (
          <div key={z.zeile} style={{ borderBottom: '1.5px solid var(--linie-weich)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 12, color: 'var(--tinte-2)', width: 46, flex: 'none' }}>{z.zeile}</span>
              <button onClick={() => setDetailZeile(detailZeile === z.zeile ? null : z.zeile)} aria-expanded={detailZeile === z.zeile} style={{ flex: 1, minWidth: 0, fontSize: 14, textAlign: 'left', overflowWrap: 'break-word' }}>
                {z.label} <span aria-hidden="true" style={{ color: 'var(--tinte-2)', fontSize: 12 }}>{detailZeile === z.zeile ? '▾' : '▸'}</span>
              </button>
              <b className="num" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{z.erledigt ? z.wert : <KiWert>{z.wert}</KiWert>}</b>
              <button onClick={() => kopieren(z.wert)} aria-label={`${z.label} kopieren`} style={{ width: 42, height: 42, border: '1.5px solid var(--linie-weich)', borderRadius: 12, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--karte)' }}>⧉</button>
              <button
                onClick={() => onToggle(z.zeile)}
                aria-pressed={z.erledigt}
                aria-label={`${z.label} als übertragen markieren`}
                className="fx-check"
                style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', border: 'var(--kontur) solid var(--tinte)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, background: z.erledigt ? 'var(--funke)' : 'var(--karte)' }}
              >
                {z.erledigt ? '✓' : ''}
              </button>
            </div>
            {detailZeile === z.zeile && (
              <div style={{ padding: '0 0 12px 56px' }}>
                <HerkunftsChip quelle={z.quelle} />
              </div>
            )}
          </div>
        ))}
        {!kollabiert && fertige.length >= 2 && (
          <button onClick={() => setFertigeOffen(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 0', minHeight: 44, fontSize: 13, color: 'var(--tinte-2)' }}>
            Bestätigte einklappen <span aria-hidden="true">▾</span>
          </button>
        )}
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '10px 0 0' }}>Gestrichelte Werte hat der Berater befüllt — Abhaken bestätigt sie. Zeile antippen zeigt die Herkunft.</p>
      </div>

      {/* M2: Prüf-Moment vor Abgabe */}
      <button onClick={() => setPruefOffen(true)} className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left' }}>
        <div>
          <b>Prüfen vor Abgabe</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>1 Konflikt · {sichtbareZeilen.length - erledigt} unbestätigte Werte · 1 Beleg im Posteingang</span>
        </div>
        <span style={{ fontWeight: 800 }} aria-hidden="true">→</span>
      </button>

      <div className="fk-karte" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mono-label" style={{ padding: '12px 16px 4px' }}>Export</div>
        {[
          { l: 'Übertragungshilfe (diese Ansicht)', c: 'kostenlos' },
          { l: 'Listen-PDF', c: 'kostenlos' },
          { l: 'Amtliche Formulare (PDF)', c: 'kostenlos' },
        ].map((e) => (
          <button key={e.l} onClick={() => { setToast(e.l === 'Übertragungshilfe (diese Ansicht)' ? 'Du bist bereits hier' : 'Demo — Export startet'); setTimeout(() => setToast(''), 1200); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, fontSize: 15 }}>
            <span>{e.l}</span><Chip style={{ minHeight: 28, fontSize: 12 }}>{e.c}</Chip>
          </button>
        ))}
        <button onClick={() => setEricOffen(true)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: '1.5px solid var(--linie-weich)', minHeight: 52, fontSize: 15 }}>
          <span>ERiC-geprüft übermitteln</span><Chip style={{ minHeight: 28, fontSize: 12 }}>Kommt · 2.0</Chip>
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)' }}>Alle Kanäle nutzen dieselben geprüften Werte — du wählst nur die Form.</p>

      {pruefOffen && (
        <Sheet titel="Prüf-Report" onClose={() => setPruefOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 13, color: 'var(--tinte-2)' }}>Was wir vor der Abgabe prüfen — Stand jetzt:</p>
          {[
            { ok: false, text: '1 Konflikt: Beleg (480 €) ≠ Eingabe (500 €) bei „Monitor" — auflösen unter Belege, vorher geht nichts raus' },
            { ok: false, text: '1 Beleg wartet unzugeordnet im Posteingang — zuordnen oder bewusst übergehen' },
            { ok: true, text: 'Aus 2025 Übernommenes ist bestätigt — nichts Graues mehr offen' },
            { ok: true, text: 'Keine Widersprüche zwischen den Anlagen' },
            { ok: true, text: 'Alle Pflichtfelder haben Werte mit Herkunft' },
            { ok: sichtbareZeilen.length - erledigt === 0, text: `${sichtbareZeilen.length - erledigt} gestrichelte Werte unbestätigt — Abhaken bestätigt sie` },
            { ok: false, text: 'IBAN für die Erstattung fehlt (Profil → Stammdaten)' },
            ...(gewVor ? [{ ok: false, text: 'Gewerbe fehlt — eine Erklärung ist unteilbar; Abgabe erst, wenn Anlage G/EÜR drin ist' }] : []),
          ].map((c, n) => (
            <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'baseline', borderBottom: '1.5px solid var(--linie-weich)', padding: '10px 0', fontSize: 14 }}>
              <span style={{ fontWeight: 800, color: c.ok ? 'var(--ok)' : 'var(--warn)', flex: 'none' }}>{c.ok ? '✓' : '!'}</span>
              <span>{c.text}</span>
            </div>
          ))}
          <p style={{ fontSize: 13, color: 'var(--tinte-2)' }}>Einreichbar, sobald die offenen Punkte erledigt sind — wir halten nichts zurück, was du nicht siehst.</p>
          <Button onClick={() => setPruefOffen(false)}>Verstanden</Button>
        </Sheet>
      )}

      {ericOffen && (
        <Sheet titel="ERiC-geprüft übermitteln" onClose={() => setEricOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 14 }}>
            Deine Werte werden gegen die <b>offiziellen Prüfregeln der Finanzverwaltung</b> validiert — und später direkt übermittelt, ohne Abtippen. Mit <b>Hersteller-Zertifikat</b>: einmal identifizieren, nie wieder eine Zertifikatsdatei pflegen. Ehrlich: Unser ELSTER-Zertifikat steht noch aus — der Kanal kommt mit Version 1.x.
          </p>
          <ul style={{ paddingLeft: 18, color: 'var(--tinte-2)', fontSize: 14 }}>
            <li>Geprüft = nachweislich einreichbar, nicht nur „sieht richtig aus"</li>
            <li>Übermittlung immer nur nach deiner ausdrücklichen Bestätigung</li>
            <li>Kein Abtippen mehr — die letzte Meile entfällt</li>
          </ul>
          <Button onClick={() => setEricOffen(false)}>Vormerken — wir sagen Bescheid</Button>
        </Sheet>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}
Object.assign(window, { FunkeUebertragen });
