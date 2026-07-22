/* Belege (F2/F3) — Scannen, Review-Queue, Vorschlag mit Konfidenz und „weil …".
   Skaliert: Suche + zuklappbare Kategorie-Gruppen, Serien-Bestätigung, Duplikat-Erkennung.
   Prinzip: Erledigtes kollabiert, Offenes bleibt sichtbar. */
const { Button, Chip, AiChip, HerkunftsChip, Input, Toast } = window.FinanzoFunkeDesignSystem_7e417e;

const FUNKE_BELEGE = [
  { id: 1, name: 'Lohnsteuerbescheinigung 2026', status: 'bestaetigt', ziel: 'Anlage N · Zeile 31', kat: 'Arbeit & Job' },
  { id: 2, name: 'Rechnung Fortbildung „TypeScript"', status: 'pruefen', ziel: 'Anlage N · Zeile 44', kat: 'Arbeit & Job', konf: 92, weil: 'weil die Rechnung eine berufliche Fortbildung ausweist', kv: [['Betrag', '890,00 €'], ['Datum', '14.03.2026'], ['Aussteller', 'Workshop GmbH']] },
  { id: 3, name: 'BahnCard 50', status: 'pruefen', ziel: 'Anlage N · Zeile 45', kat: 'Arbeit & Job', konf: 87, weil: 'weil sie überwiegend für den Arbeitsweg genutzt wird', kv: [['Betrag', '244,00 €'], ['Gültig', '2026']] },
  { id: 4, name: 'Spendenquittung DRK', status: 'bestaetigt', ziel: 'Sonderausgaben · Zeile 5', kat: 'Spenden & Versicherungen' },
  { id: 5, name: 'Handwerkerrechnung „Bad-Reparatur"', status: 'inbox', kat: 'Zuhause', hinweis: '§ 35a: bis 20 % der Lohnkosten direkt von der Steuer — wir ordnen sie zu, sobald das Jahr offen ist.' },
  { id: 6, name: 'Nebenkostenabrechnung 2026', status: 'inbox', kat: 'Zuhause', hinweis: 'Haushaltsnahe Dienstleistungen stecken oft drin — geparkt fürs Steuerjahr.' },
  { id: 7, name: 'Nebenkostenabrechnung 2026 (2).pdf', status: 'inbox', kat: 'Zuhause', duplikat: 'Bis aufs Dateidatum identisch mit deinem Upload vom 03.05. — vermutlich doppelt.' },
  { id: 8, name: 'Arbeitsmittel „Monitor"', status: 'konflikt', ziel: 'Anlage N · Zeile 42', kat: 'Arbeit & Job', belegWert: '480,00 €', eingabeWert: '500,00 €' },
];

function FunkeBelege({ onBerater }) {
  const [filter, setFilter] = React.useState('pruefen');
  const [suche, setSuche] = React.useState('');
  const [belege, setBelege] = React.useState(FUNKE_BELEGE);
  const [serie, setSerie] = React.useState('pruefen'); /* 12 gleichartige Tickets als EIN Vorschlag */
  const [manuell, setManuell] = React.useState({}); /* Gruppe → true = offen erzwungen, false = zu */
  const [toast, setToast] = React.useState('');
  const [gelöscht, setGeloescht] = React.useState(null); /* zuletzt gelöschtes Duplikat für Rückgängig */
  const gefiltert = belege
    .filter((b) => filter === 'alle' || b.status === filter)
    .filter((b) => !suche || b.name.toLowerCase().includes(suche.toLowerCase()));
  const gruppen = [...new Set(gefiltert.map((b) => b.kat))];
  /* Erledigtes kollabiert: Gruppe standardmäßig zu, wenn alles darin bestätigt ist */
  function istZu(g) {
    if (manuell[g] !== undefined) return !manuell[g];
    const items = gefiltert.filter((b) => b.kat === g);
    return filter === 'alle' && items.every((b) => b.status === 'bestaetigt');
  }
  function serieUebernehmen() {
    setSerie('bestaetigt');
    setBelege((bs) => [...bs, { id: 99, name: 'Deutschlandticket · Serie (12 Belege)', status: 'bestaetigt', ziel: 'Anlage N · Zeile 45', kat: 'Arbeit & Job' }]);
    setToast('12 Belege als Serie bestätigt');
    setTimeout(() => setToast(''), 1600);
  }

  function bestaetigen(id) {
    setBelege(belege.map((b) => (b.id === id ? { ...b, status: 'bestaetigt' } : b)));
  }
  /* ADR-008: Konflikt auflösen = eine Quelle wählen; die verworfene bleibt im Verlauf */
  function loeseKonflikt(id, wert, quelle) {
    setBelege((bs) => bs.map((b) => (b.id === id ? { ...b, status: 'bestaetigt', kv: [['Betrag', wert], ['Entschieden', quelle]] } : b)));
    setToast(`Konflikt gelöst — es zählt: ${quelle} (${wert})`);
    setTimeout(() => setToast(''), 1800);
    if (filter === 'konflikt') setFilter('bestaetigt');
  }
  /* ADR-007: Posteingang-Beleg dem vorgeschlagenen Jahr zuordnen */
  function zuordnen(id) {
    setBelege((bs) => bs.map((b) => (b.id === id ? { ...b, status: 'bestaetigt', ziel: b.ziel || '§ 35a · haushaltsnah', hinweis: null } : b)));
    setToast('Im Steuerjahr 2026 — Zuordnung: Zahlungsdatum');
    setTimeout(() => setToast(''), 1800);
  }
  const konflikte = belege.filter((b) => b.status === 'konflikt').length;

  return (
    <div>
      <div className="appbar">
        <h1>Belege</h1>
        <Chip variante="src">{belege.filter((b) => b.status === 'pruefen').length} zu prüfen</Chip>
      </div>

      <div className="fk-karte nacht" style={{ position: 'relative', overflow: 'hidden', minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 8 }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: 14, right: 20, bottom: 58, width: 120, background: '#f4efe2', borderRadius: 6, transform: 'rotate(3deg)', opacity: 0.9, padding: 10 }}>
          <i style={{ display: 'block', height: 5, background: '#c9c2ae', margin: '0 0 8px', borderRadius: 2 }}></i>
          <i style={{ display: 'block', height: 5, background: '#c9c2ae', margin: '0 0 8px', borderRadius: 2, width: '60%' }}></i>
          <i style={{ display: 'block', height: 5, background: '#c9c2ae', borderRadius: 2, width: '45%' }}></i>
        </div>
        <span className="mono-label" style={{ color: 'var(--funke-hell)', position: 'relative', maxWidth: 200 }}>Wirf alles rein — wir sortieren</span>
        <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'wrap' }}>
          <Button variante="nacht" style={{ width: 'auto', borderColor: 'var(--funke)' }} onClick={() => { window.location.href = 'scan.html'; }}>Beleg scannen</Button>
          <Button variante="nacht" style={{ width: 'auto' }} onClick={() => { window.location.href = 'scan.html'; }}>PDF hochladen</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' }}>
        <Chip aktiv={filter === 'pruefen'} onClick={() => setFilter('pruefen')}>Zu prüfen</Chip>
        {konflikte > 0 && <Chip aktiv={filter === 'konflikt'} onClick={() => setFilter('konflikt')} style={{ borderColor: 'var(--warn)', color: filter === 'konflikt' ? undefined : 'var(--warn)' }}>Konflikt ({konflikte})</Chip>}
        <Chip aktiv={filter === 'bestaetigt'} onClick={() => setFilter('bestaetigt')}>Bestätigt</Chip>
        <Chip aktiv={filter === 'inbox'} onClick={() => setFilter('inbox')}>Inbox</Chip>
        <Chip aktiv={filter === 'alle'} onClick={() => setFilter('alle')}>Alle</Chip>
      </div>
      <Input value={suche} onChange={(v) => setSuche(v)} placeholder="Beleg suchen — Name genügt" style={{ marginBottom: 14 }} />

      {filter === 'inbox' && (
        <p style={{ fontSize: 13, color: 'var(--tinte-2)', margin: '0 0 14px' }}>Wirf Belege übers ganze Jahr rein — sie warten hier und landen automatisch im richtigen Steuerjahr. Nichts geht verloren, nichts musst du dir merken.</p>
      )}

      {(filter === 'pruefen' || filter === 'alle') && !suche && serie === 'pruefen' && (
        <div className="fk-ai-karte" data-ai="true" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <AiChip>Serie erkannt · 12 Belege</AiChip>
            <b style={{ fontSize: 14, color: 'var(--ki-tinte)' }}>Anlage N · Zeile 45</b>
          </div>
          <p style={{ margin: '8px 0 10px', fontSize: 13, color: 'var(--ki-tinte)' }}>12× Deutschlandticket, Januar–Dezember — gleicher Aussteller, gleicher Betrag (49,00 €). Statt 12 Karten: einmal entscheiden.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variante="leise" style={{ minHeight: 42 }} onClick={serieUebernehmen}>Alle 12 übernehmen</Button>
            <Button variante="ghost" style={{ minHeight: 42 }} onClick={() => { setToast('Demo — Einzelansicht der Serie'); setTimeout(() => setToast(''), 1400); }}>Einzeln ansehen</Button>
          </div>
        </div>
      )}

      {gefiltert.length === 0 && (
        <div className="fk-karte" style={{ textAlign: 'center', color: 'var(--tinte-2)', fontSize: 14 }}>Kein Beleg passt{suche ? ` zu „${suche}"` : ''} — anders suchen oder Filter wechseln.</div>
      )}
      {gruppen.map((g) => (
        <div key={g}>
          <button onClick={() => setManuell((m) => ({ ...m, [g]: istZu(g) }))} aria-expanded={!istZu(g)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', margin: '2px 0 10px', minHeight: 36 }}>
            <span className="mono-label">{g} · {gefiltert.filter((b) => b.kat === g).length}</span>
            {istZu(g) && gefiltert.filter((b) => b.kat === g).every((b) => b.status === 'bestaetigt') && <span style={{ color: 'var(--ok)', fontWeight: 700, fontSize: 12 }}>alle bestätigt ✓</span>}
            <span aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--tinte-2)', fontSize: 12 }}>{istZu(g) ? '▸' : '▾'}</span>
          </button>
          {!istZu(g) && <div className="bel-grid">
          {gefiltert.filter((b) => b.kat === g).map((b) => (
        <div key={b.id} className="fk-karte">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
            <b style={{ fontSize: 15 }}>{b.name}</b>
            {b.status === 'bestaetigt' && <span style={{ color: 'var(--ok)', fontWeight: 700, fontSize: 13, flex: 'none' }}>✓ bestätigt</span>}
            {b.status === 'konflikt' && <Chip variante="src" style={{ minHeight: 28, fontSize: 12, flex: 'none', borderColor: 'var(--warn)', color: 'var(--warn)' }}>Konflikt</Chip>}
            {b.status === 'inbox' && <Chip variante="src" style={{ minHeight: 28, fontSize: 12, flex: 'none' }}>Geparkt</Chip>}
          </div>
          {b.kv && (
            <div style={{ margin: '8px 0' }}>
              {b.kv.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px dashed var(--linie-weich)', padding: '5px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--tinte-2)' }}>{k}</span>
                  <b className="num">{v}</b>
                </div>
              ))}
            </div>
          )}
          {b.status === 'konflikt' ? (
            <div style={{ marginTop: 10, border: '2px solid var(--warn)', borderRadius: 12, padding: 12, background: 'var(--warn-weich)' }}>
              <b style={{ fontSize: 13, color: 'var(--warn)' }}>Zwei Werte für einen Posten — du entscheidest</b>
              <p style={{ margin: '6px 0 10px', fontSize: 13, color: 'var(--tinte-2)' }}>Der Beleg sagt <b className="num">{b.belegWert}</b>, deine Eingabe <b className="num">{b.eingabeWert}</b>. Bis das geklärt ist, zählt der Posten nicht in die Schätzung — und die Abgabe wartet.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variante="leise" style={{ minHeight: 42, width: 'auto' }} onClick={() => loeseKonflikt(b.id, b.belegWert, 'Beleg')}>Belegwert {b.belegWert}</Button>
                <Button variante="ghost" style={{ minHeight: 42, width: 'auto' }} onClick={() => loeseKonflikt(b.id, b.eingabeWert, 'Eingabe')}>Eingabe {b.eingabeWert}</Button>
              </div>
            </div>
          ) : b.status === 'pruefen' ? (
            <div className="fk-ai-karte" data-ai="true" style={{ marginBottom: 0, marginTop: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <AiChip>Vorschlag · {b.konf} %</AiChip>
                <b style={{ fontSize: 14, color: 'var(--ki-tinte)' }}>{b.ziel}</b>
              </div>
              <p style={{ margin: '8px 0 10px', fontSize: 13, color: 'var(--ki-tinte)' }}>{b.weil}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variante="leise" style={{ minHeight: 42 }} onClick={() => bestaetigen(b.id)}>Übernehmen</Button>
                <Button variante="ghost" style={{ minHeight: 42 }} onClick={onBerater}>Ändern</Button>
              </div>
            </div>
          ) : b.status === 'inbox' && b.duplikat ? (
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--warn)', fontWeight: 700 }}>{b.duplikat}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variante="leise" style={{ minHeight: 42 }} onClick={() => { setBelege((bs) => bs.filter((x) => x.id !== b.id)); setGeloescht(b); setToast('Duplikat gelöscht — das Original bleibt'); setTimeout(() => { setToast(''); setGeloescht(null); }, 5000); }}>Duplikat löschen</Button>
                <Button variante="ghost" style={{ minHeight: 42 }} onClick={() => { setBelege((bs) => bs.map((x) => (x.id === b.id ? { ...x, duplikat: null, hinweis: 'Behalten — wir behandeln ihn als eigenen Beleg.' } : x))); }}>Behalten</Button>
              </div>
            </div>
          ) : b.status === 'inbox' ? (
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tinte-2)' }}>{b.hinweis}</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variante="leise" style={{ minHeight: 38, width: 'auto', fontSize: 13 }} onClick={() => zuordnen(b.id)}>Ins Steuerjahr 2026 →</Button>
                <HerkunftsChip quelle={{ regel: 'Vorschlag: Zahlungsdatum 2026' }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <Chip variante="src">{b.ziel}</Chip>
              <HerkunftsChip quelle={{ beleg: b.name, regel: 'KAT-' + b.id + '0 · Stand 2026' }} />
            </div>
          )}
        </div>
      ))}
          </div>}
        </div>
      ))}
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Vorschläge auf Basis deiner Unterlagen — du entscheidest. Erledigtes klappt zu, Offenes bleibt sichtbar.</p>
      {toast && (gelöscht
        ? <Toast text={toast} aktion="Rückgängig" onAktion={() => { setBelege((bs) => [...bs, gelöscht]); setGeloescht(null); setToast(''); }} />
        : <Toast text={toast} />)}
    </div>
  );
}
Object.assign(window, { FunkeBelege });
