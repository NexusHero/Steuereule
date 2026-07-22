/* Statistik — alles Wichtige über die Jahre, skalierbar:
   feste Slots statt endloser Listen (letzte 5 Jahre als Balken, Rest aggregiert;
   Top-4-Kategorien + Sheet für alle; genau 3 Rekord-Karten). */
const { Chip, Pill, Sticker, Sheet, HerkunftsChip } = window.FinanzoFunkeDesignSystem_7e417e;

/* Bundle-sicher: im _ds_bundle wird diese Datei vor demo-daten.js evaluiert — Fallback statt Crash */
const FD = window.FunkeDemo || { statistik: { jahre: [{ jahr: 2025, erstattung: 0, gezahlt: 0 }], aelter: { von: 2019, bis: 2021, summe: 0, gezahlt: 0 } }, formatEuro: (n) => n.toLocaleString('de-DE') + ' €', formatZahl: (n) => n.toLocaleString('de-DE') };
const STAT_JAHRE = FD.statistik.jahre;
const STAT_AELTER = FD.statistik.aelter; // aggregiert — skaliert für beliebig viele Jahre
const ANZ_JAHRE = STAT_JAHRE.length + (STAT_AELTER.bis - STAT_AELTER.von + 1);
const LETZTES = STAT_JAHRE[STAT_JAHRE.length - 1].jahr;

const STAT_KATEGORIEN = [
  { name: 'Pendeln & Arbeitsweg', summe: 6420 },
  { name: 'Homeoffice', summe: 2890 },
  { name: 'Fortbildung', summe: 2140 },
  { name: 'Arbeitsmittel', summe: 1370 },
  { name: 'Spenden', summe: 780 },
  { name: 'Versicherungen', summe: 640 },
  { name: 'Umzug', summe: 410 },
];

/* Bilanz: Jahr vs. Vorjahr je Kategorie — UI zeigt IMMER genau 3 größte Bewegungen
   + „Stabil"-Zeile; vollständige Bilanz im Sheet. Skaliert mit beliebig vielen Kategorien. */
const STAT_BILANZ = [
  { name: 'Fortbildung', jetzt: 890, vorjahr: 340 },
  { name: 'Homeoffice', jetzt: 480, vorjahr: 620 },
  { name: 'Arbeitsmittel', jetzt: 399, vorjahr: 180 },
  { name: 'Pendeln & Arbeitsweg', jetzt: 1831, vorjahr: 1790 },
  { name: 'Spenden', jetzt: 150, vorjahr: 150 },
  { name: 'Versicherungen', jetzt: 84, vorjahr: 92 },
];

const eur = FD.formatEuro;

function FunkeStatistik({ onZurueck }) {
  const ruhig = React.useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [katOffen, setKatOffen] = React.useState(false);
  const [bilanzOffen, setBilanzOffen] = React.useState(false);
  const [metrik, setMetrik] = React.useState('erstattung'); // erstattung | gezahlt
  const [bereit, setBereit] = React.useState(ruhig); // Balken wachsen nach Mount
  const gesamt = STAT_JAHRE.reduce((s, j) => s + j.erstattung, 0) + STAT_AELTER.summe;
  const istGezahlt = metrik === 'gezahlt';
  const wert = (j) => (istGezahlt ? j.gezahlt : j.erstattung);
  const max = Math.max(...STAT_JAHRE.map(wert));
  const aelterWert = istGezahlt ? STAT_AELTER.gezahlt : STAT_AELTER.summe;
  const bester = STAT_JAHRE.reduce((a, b) => (b.erstattung > a.erstattung ? b : a));
  const topKat = STAT_KATEGORIEN.slice(0, 4);
  const restKat = STAT_KATEGORIEN.length - 4;
  const maxKat = STAT_KATEGORIEN[0].summe;

  const bilanz = STAT_BILANZ.map((b) => ({ ...b, delta: b.jetzt - b.vorjahr, pct: b.vorjahr ? Math.round(((b.jetzt - b.vorjahr) / b.vorjahr) * 100) : 100 }));
  const bewegt = bilanz.filter((b) => Math.abs(b.pct) >= 10).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topBewegt = bewegt.slice(0, 3);
  const stabil = bilanz.length - topBewegt.length;

  /* Held-Zahl zählt hoch, Balken wachsen aus 0 — bei reduced-motion sofort fertig */
  const [zahl, setZahl] = React.useState(ruhig ? gesamt : 0);
  React.useEffect(() => {
    if (ruhig) return;
    let raf = requestAnimationFrame(() => setBereit(true));
    const start = performance.now();
    const dauer = 1100;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dauer);
      setZahl(Math.round(gesamt * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fx-stat">
      <div className="appbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onZurueck ? <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800 }}>←</button> : <a href="index.html" aria-label="Zurück zur App" style={{ width: 44, height: 44, border: '1.5px solid var(--linie-weich)', borderRadius: 999, background: 'var(--karte)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>←</a>}
          <h1>Statistik</h1>
        </div>
        <Pill>{STAT_AELTER.von}–{LETZTES}</Pill>
      </div>

      <div className="fk-karte nacht">
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Zurückgeholt insgesamt</span>
        <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 52, color: 'var(--funke)', lineHeight: 1.05, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {eur(zahl)}
          <Sticker style={{ fontSize: 13 }}>{ANZ_JAHRE} Jahre</Sticker>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.75 }}>Ø {eur(Math.round(gesamt / ANZ_JAHRE))} pro Jahr — Tendenz steigend</span>
          <HerkunftsChip quelle={{ regel: 'STAT-SUM-01', rechenweg: `Summe aller Bescheide ${STAT_AELTER.von}–${LETZTES}` }} />
        </div>
      </div>

      <div className="fk-karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <span className="mono-label">{istGezahlt ? 'Steuer gezahlt pro Jahr' : 'Erstattung pro Jahr'}</span>
          <div style={{ display: 'flex', gap: 6 }} role="tablist" aria-label="Kennzahl wählen">
            <Chip aktiv={!istGezahlt} onClick={() => setMetrik('erstattung')} style={{ minHeight: 30, fontSize: 12 }}>Erstattung</Chip>
            <Chip aktiv={istGezahlt} onClick={() => setMetrik('gezahlt')} style={{ minHeight: 30, fontSize: 12 }}>Gezahlt</Chip>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 }}>
          <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 6, height: '100%' }}>
            <div style={{ width: '100%', height: bereit ? `${(aelterWert / 3 / max) * 100}%` : '0%', minHeight: 10, background: 'var(--linie-weich)', border: '1.5px dashed var(--tinte-2)', borderRadius: '8px 8px 4px 4px', transition: 'height var(--t-auftritt) var(--feder)' }} title={`${STAT_AELTER.von}–${STAT_AELTER.bis}: ${eur(aelterWert)}`}></div>
            <span className="mono-label num" style={{ fontSize: 9 }}>{String(STAT_AELTER.von).slice(2)}–{String(STAT_AELTER.bis).slice(2)}</span>
          </div>
          {STAT_JAHRE.map((j, idx) => (
            <div key={j.jahr} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 6, height: '100%' }}>
              <b className="num" style={{ fontSize: 10, color: !istGezahlt && j.jahr === bester.jahr ? 'var(--funke-tinte)' : 'var(--tinte-2)' }}>{FD.formatZahl(wert(j))}</b>
              <div style={{ width: '100%', height: bereit ? `${(wert(j) / max) * 100}%` : '0%', minHeight: 12, background: istGezahlt ? 'var(--karte)' : j.jahr === bester.jahr ? 'var(--funke)' : 'var(--funke-weich)', border: 'var(--kontur) solid var(--tinte)', borderRadius: '8px 8px 4px 4px', boxShadow: !istGezahlt && j.jahr === bester.jahr ? 'var(--schatten-hart-s)' : 'none', transition: `height var(--t-auftritt) var(--feder) ${idx * 70}ms` }} title={`${j.jahr}: ${eur(wert(j))}`}></div>
              <span className="mono-label num" style={{ fontSize: 9 }}>'{String(j.jahr).slice(2)}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '10px 0 0' }}>{istGezahlt ? `Lohnsteuer laut Bescheinigung — davon hast du dir ${eur(gesamt)} zurückgeholt.` : 'Ältere Jahre laufen links gebündelt zusammen — die Ansicht bleibt gleich groß, egal wie viele Jahre dazukommen.'}</p>
      </div>

      <div className="fk-karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span className="mono-label">Wo dein Geld herkommt</span>
          <Chip onClick={() => setKatOffen(true)} style={{ minHeight: 30, fontSize: 12 }}>Alle {STAT_KATEGORIEN.length} →</Chip>
        </div>
        {topKat.map((k, idx) => (
          <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
            <span style={{ width: 150, flex: 'none', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</span>
            <span className="fk-balken" style={{ flex: 1, display: 'block' }}><i style={{ width: bereit ? `${(k.summe / maxKat) * 100}%` : '0%', transition: `width 0.55s var(--zack) ${250 + idx * 90}ms` }}></i></span>
            <b className="num" style={{ width: 64, textAlign: 'right', fontSize: 13, flex: 'none' }}>{eur(k.summe)}</b>
          </div>
        ))}
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '8px 0 0' }}>Top 4 über alle Jahre — {restKat} weitere im Detail.</p>
      </div>

      <div className="fk-karte">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="mono-label">Bilanz — 2026 vs. {LETZTES}</span>
          <Chip onClick={() => setBilanzOffen(true)} style={{ minHeight: 30, fontSize: 12 }}>Alle {bilanz.length} →</Chip>
        </div>
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '0 0 10px' }}>Die drei größten Bewegungen bei deinen Kosten — der Rest ist stabil.</p>
        {topBewegt.map((b) => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1.5px solid var(--linie-weich)' }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, background: b.delta >= 0 ? 'var(--ok-weich)' : 'var(--warn-weich)', color: b.delta >= 0 ? 'var(--ok)' : 'var(--warn)', border: '1.5px solid currentColor' }}>{b.delta >= 0 ? '↗' : '↘'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</b>
              <span className="num" style={{ fontSize: 11, color: 'var(--tinte-2)' }}>{eur(b.vorjahr)} → {eur(b.jetzt)}</span>
            </div>
            <b className="num" style={{ fontSize: 13, flex: 'none', color: b.delta >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{b.delta >= 0 ? '+' : ''}{eur(b.delta)}</b>
            <span className="num mono-label" style={{ fontSize: 10, width: 42, textAlign: 'right', flex: 'none' }}>{b.pct >= 0 ? '+' : ''}{b.pct} %</span>
          </div>
        ))}
        <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '8px 0 0' }}>{stabil} Kategorien nahezu unverändert (±10 %). Mehr absetzbare Kosten heißt meist: mehr Erstattung.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'Bestes Jahr', w: String(bester.jahr), d: eur(bester.erstattung) },
          { l: 'Größter Fund', w: '+412 €', d: 'Umzug 2024' },
          { l: 'Berater-Funde', w: '23', d: 'übernommen' },
        ].map((r) => (
          <div key={r.l} style={{ background: 'var(--karte)', border: 'var(--kontur) solid var(--tinte)', borderRadius: 'var(--radius-s)', boxShadow: 'var(--schatten-hart-s)', padding: '12px 10px', textAlign: 'center' }}>
            <span className="mono-label" style={{ fontSize: 9 }}>{r.l}</span>
            <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 22, margin: '2px 0' }}>{r.w}</div>
            <span style={{ fontSize: 11, color: 'var(--tinte-2)' }}>{r.d}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Alle Werte aus deinen Bescheiden — Herkunft an jeder Zahl.</p>

      {bilanzOffen && (
        <Sheet titel={`Bilanz 2026 vs. 2025 (${bilanz.length})`} onClose={() => setBilanzOffen(false)}>
          {bilanz.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((b) => (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1.5px solid var(--linie-weich)' }}>
              <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{b.name}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--tinte-2)', flex: 'none' }}>{eur(b.vorjahr)} → {eur(b.jetzt)}</span>
              <b className="num" style={{ width: 64, textAlign: 'right', fontSize: 13, flex: 'none', color: b.delta > 0 ? 'var(--ok)' : b.delta < 0 ? 'var(--warn)' : 'var(--tinte-2)' }}>{b.delta > 0 ? '+' : ''}{b.delta === 0 ? '±0' : eur(b.delta)}</b>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '12px 0 0' }}>Grün = mehr absetzbar als im Vorjahr, Amber = weniger. Sortiert nach Bewegung.</p>
        </Sheet>
      )}

      {katOffen && (
        <Sheet titel={`Alle Kategorien (${STAT_KATEGORIEN.length})`} onClose={() => setKatOffen(false)}>
          {STAT_KATEGORIEN.map((k) => (
            <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1.5px solid var(--linie-weich)' }}>
              <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{k.name}</span>
              <span className="fk-balken" style={{ width: 110, display: 'block', flex: 'none' }}><i style={{ width: `${(k.summe / maxKat) * 100}%` }}></i></span>
              <b className="num" style={{ width: 64, textAlign: 'right', fontSize: 13, flex: 'none' }}>{eur(k.summe)}</b>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--tinte-2)', margin: '12px 0 0' }}>Sortiert nach Summe über alle Jahre.</p>
        </Sheet>
      )}
    </div>
  );
}
Object.assign(window, { FunkeStatistik });
