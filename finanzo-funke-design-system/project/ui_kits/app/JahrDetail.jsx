/* Versiegeltes Steuerjahr — eingereicht = Rechtsdokument, nur lesen.
   Muster: bekanntes Übertragen-Layout im Fakten-Modus (Papier-Ton, keine Affordanzen),
   Toast erklärt genau dann, wenn jemand ändern will. Korrektur = neue Fassung, nie Edit. */
const { Button, Chip, Pill, HerkunftsChip, Sheet, Toast, Sticker, Begriff } = window.FinanzoFunkeDesignSystem_7e417e;

const JAHR_2025 = {
  jahr: 2025,
  eingereicht: '12.03.2026',
  bescheid: '28.04.2026',
  erstattung: '1.212,00 €',
  zeilen: [
    { anlage: 'Anlage N', zeile: '31', label: 'Bruttoarbeitslohn', wert: '52.100,00 €', quelle: { beleg: 'Lohnsteuerbescheinigung 2025', regel: 'MAP-N-31 · Stand 2025' } },
    { anlage: 'Anlage N', zeile: '44', label: 'Fortbildungskosten', wert: '640,00 €', quelle: { beleg: 'Rechnung Konferenz-Ticket', regel: 'WK-FORT-02' } },
    { anlage: 'Anlage N', zeile: '45', label: 'Entfernungspauschale', wert: '1.764,00 €', quelle: { beleg: 'Interview: 210 Arbeitstage', regel: 'WK-PENDLER-01', rechenweg: '210 × 28 km × 0,30 €' } },
    { anlage: 'Anlage N', zeile: '46', label: 'Homeoffice-Pauschale', wert: '624,00 €', quelle: { regel: 'HO-PAUSCH-25', rechenweg: '104 Tage × 6 €' } },
    { anlage: 'Vorsorgeaufwand', zeile: '4', label: 'Kranken-/Pflegeversicherung', wert: '5.740,00 €', quelle: { beleg: 'Lohnsteuerbescheinigung 2025, Zeile 25/26', regel: 'VORS-KV-01' } },
    { anlage: 'Vorsorgeaufwand', zeile: '8', label: 'Rentenversicherung', wert: '4.846,00 €', quelle: { beleg: 'Lohnsteuerbescheinigung 2025, Zeile 23', regel: 'VORS-RV-01' } },
    { anlage: 'Sonderausgaben', zeile: '5', label: 'Spenden (DRK)', wert: '120,00 €', quelle: { beleg: 'Spendenquittung DRK', regel: 'SA-SPENDE-01' } },
    { anlage: 'Anlage N-Gre', zeile: 'GG-1', label: 'Nichtrückkehrtage', wert: '9', quelle: { regel: 'GG-NRT-60 · DBA Schweiz', rechenweg: 'Tracker: 9 markierte Tage' } },
    { anlage: 'Anlage N-Gre', zeile: 'GG-2', label: 'Bruttolohn Schweiz', wert: '94.146,00 €', quelle: { beleg: 'Lohnausweis 2025', regel: 'GG-KURS-2025 · amtl. Kurs', rechenweg: '88.400 CHF × 1,065 (100 CHF = 106,50 €)' } },
  ],
  belege: [
    { name: 'Lohnsteuerbescheinigung 2025', ziel: 'Anlage N · Zeilen 31–46' },
    { name: 'Rechnung Konferenz-Ticket', ziel: 'Anlage N · Zeile 44' },
    { name: 'BahnCard 50', ziel: 'Anlage N · Zeile 45' },
    { name: 'Spendenquittung DRK', ziel: 'Sonderausgaben · Zeile 5' },
    { name: 'GG-Tracker-Export 2025', ziel: 'Anlage N-Gre · GG-1' },
  ],
};

function FunkeJahrDetail({ onZurueck, onFrage }) {
  const d = JAHR_2025;
  const [ansicht, setAnsicht] = React.useState('zeilen');
  const anlagen = [...new Set(d.zeilen.map((z) => z.anlage))];
  const [anlage, setAnlage] = React.useState(anlagen[0]);
  const [detailZeile, setDetailZeile] = React.useState(null);
  const [korrekturOffen, setKorrekturOffen] = React.useState(false);
  const [toast, setToast] = React.useState('');
  function zeigeToast(t) { setToast(t); setTimeout(() => setToast(''), 1800); }
  function kopieren(wert) {
    try { navigator.clipboard.writeText(wert); } catch (e) {}
    zeigeToast('Kopiert');
  }
  const sichtbar = d.zeilen.filter((z) => z.anlage === anlage);

  return (
    <div>
      <div className="appbar" style={{ gap: 12 }}>
        <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: 'var(--kontur) solid var(--tinte)', borderRadius: 999, background: 'var(--karte)', boxShadow: 'var(--schatten-hart-s)', fontWeight: 800, flex: 'none' }}>←</button>
        <h1 className="num" style={{ marginRight: 'auto' }}>{d.jahr}</h1>
        <Pill>Eingereicht · {d.eingereicht}</Pill>
      </div>

      <div className="fk-karte" style={{ background: 'var(--papier, var(--grund))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono-label">
            <Begriff
              titel="Fassung 1"
              erklaerung="Fassung 1 ist dein Original beim Amt. Stell sie dir wie ein abgeschicktes Paket vor: Du kannst reinschauen, aber nicht mehr umpacken. Willst du etwas ändern, schicken wir ein zweites Paket hinterher — Fassung 2. So weißt du immer, was das Amt wirklich hat."
              beispiel="Beleg im November gefunden → Fassung 2, 5 Minuten"
              frage="Warum kann ich Fassung 1 nicht ändern?"
              onFrage={onFrage}
            >Fassung 1</Begriff>
            {' '}— beim Finanzamt
          </span>
          <Sticker style={{ fontSize: 13 }}>✓ ausgezahlt</Sticker>
        </div>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 40, lineHeight: 1.1, margin: '6px 0 2px' }}>{d.erstattung}</div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--tinte-2)' }}>Eingereicht am {d.eingereicht} · Bescheid vom {d.bescheid} — wie berechnet, keine Abweichung.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '4px 0 16px' }} role="tablist" aria-label="Ansicht wählen">
        <Chip aktiv={ansicht === 'zeilen'} onClick={() => setAnsicht('zeilen')}>Zeilen ({d.zeilen.length})</Chip>
        <Chip aktiv={ansicht === 'belege'} onClick={() => setAnsicht('belege')}>Belege ({d.belege.length})</Chip>
      </div>

      {ansicht === 'zeilen' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }} role="tablist" aria-label="Anlage wählen">
            {anlagen.map((a) => <Chip key={a} aktiv={a === anlage} onClick={() => setAnlage(a)} style={{ flex: 'none' }}>{a}</Chip>)}
          </div>
          <div className="fk-karte" style={{ background: 'var(--papier, var(--grund))' }}>
            {sichtbar.map((z) => (
              <div key={z.zeile} style={{ borderBottom: '1.5px solid var(--linie-weich)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <span className="num" style={{ fontFamily: 'var(--schrift-mono)', fontSize: 12, color: 'var(--tinte-2)', width: 46, flex: 'none' }}>{z.zeile}</span>
                  <button onClick={() => setDetailZeile(detailZeile === z.zeile ? null : z.zeile)} aria-expanded={detailZeile === z.zeile} style={{ flex: 1, minWidth: 0, fontSize: 14, textAlign: 'left', overflowWrap: 'break-word' }}>
                    {z.label} <span aria-hidden="true" style={{ color: 'var(--tinte-2)', fontSize: 12 }}>{detailZeile === z.zeile ? '▾' : '▸'}</span>
                  </button>
                  <b className="num" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{z.wert}</b>
                  <button onClick={() => kopieren(z.wert)} aria-label={`${z.label} kopieren`} style={{ width: 42, height: 42, border: '1.5px solid var(--linie-weich)', borderRadius: 12, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--karte)' }}>⧉</button>
                </div>
                {detailZeile === z.zeile && (
                  <div style={{ padding: '0 0 12px 56px' }}>
                    <HerkunftsChip quelle={z.quelle} />
                  </div>
                )}
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '10px 0 0' }}>Alle Werte sind Fakten — so liegen sie beim Amt. Zeile antippen zeigt die Herkunft, Kopieren geht immer.</p>
          </div>
        </div>
      )}

      {ansicht === 'belege' && (
        <div className="fk-karte" style={{ padding: 0, overflow: 'hidden', background: 'var(--papier, var(--grund))' }}>
          {d.belege.map((b, n) => (
            <button key={b.name} onClick={() => zeigeToast(`${d.jahr} ist eingereicht — Belege nur lesen`)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 16px', borderTop: n > 0 ? '1.5px solid var(--linie-weich)' : 'none', minHeight: 52 }}>
            <span style={{ color: 'var(--ok)', fontWeight: 800, flex: 'none' }} aria-hidden="true">✓</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflowWrap: 'break-word' }}>{b.name}</span>
              <Chip variante="src" style={{ minHeight: 28, fontSize: 12, flex: 'none' }}>{b.ziel}</Chip>
            </button>
          ))}
        </div>
      )}

      <Button variante="ghost" onClick={() => setKorrekturOffen(true)}>Nachträglich korrigieren</Button>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Eingereicht ist eingereicht — Änderungen gehen als neue Fassung ans Amt, nie still in die App.</p>

      {korrekturOffen && (
        <Sheet titel="Nachträglich korrigieren" onClose={() => setKorrekturOffen(false)}>
          <p style={{ marginTop: 0, fontSize: 14 }}>Fassung 1 bleibt unverändert — genau so, wie sie beim Finanzamt liegt. Eine Korrektur erzeugt <b>Fassung 2</b> mit sichtbarem Unterschied zu Fassung 1.</p>
          {[
            ['Beleg vergessen?', 'Berichtigung nach § 153 AO — geht formlos ans Finanzamt, wir bereiten sie vor.'],
            ['Bescheid falsch?', 'Einspruch binnen eines Monats nach Bescheid — den Entwurf schreibt der Bescheid-Vergleich.'],
          ].map(([was, wie]) => (
            <div key={was} style={{ borderBottom: '1.5px solid var(--linie-weich)', padding: '10px 0' }}>
              <b style={{ fontSize: 14 }}>{was}</b>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>{wie}</span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--tinte-2)' }}>Ehrlich: Für 2025 ist die Einspruchsfrist vorbei — es bleibt die Berichtigung, und nur wenn sich wirklich etwas geändert hat.</p>
          <Button onClick={() => { setKorrekturOffen(false); zeigeToast('Demo — Berichtigung würde Fassung 2 anlegen'); }}>Berichtigung vorbereiten</Button>
          <Button variante="ghost" style={{ marginTop: 10 }} onClick={() => setKorrekturOffen(false)}>Abbrechen</Button>
        </Sheet>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}
Object.assign(window, { FunkeJahrDetail });
