/* Günstigerprüfung (M1) — Zusammen vs. Einzeln, zwei Zahlen, klare Empfehlung.
   Beide Tarife voll durchgerechnet — kein KI-Output, daher KEIN Violett. */
const { Button, Pill, Chip, HerkunftsChip, Sticker, Begriff } = window.FinanzoFunkeDesignSystem_7e417e;

function FunkeVeranlagung({ onZurueck, onFrage }) {
  const { zusammen, alex, sam, einzeln } = window.FunkeDemo.veranlagung;
  const [kopplung, setKopplung] = React.useState('offen'); /* ADR-006: offen → eingeladen */
  return (
    <div className="fx-bau">
      <div className="appbar" style={{ gap: 12 }}>
        <button onClick={onZurueck} aria-label="Zurück" style={{ width: 44, height: 44, border: 'var(--kontur) solid var(--tinte)', borderRadius: 999, background: 'var(--karte)', boxShadow: 'var(--schatten-hart-s)', fontWeight: 800, flex: 'none' }}>←</button>
        <h1 style={{ marginRight: 'auto' }}>Veranlagung</h1>
        <Pill>2026</Pill>
      </div>

      <div className="fk-karte nacht">
        <span className="mono-label" style={{ color: 'var(--funke-hell)' }}>Empfehlung — beide Wege gerechnet</span>
        <div style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 34, lineHeight: 1.1, margin: '8px 0 6px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          Zusammen veranlagen.
          <Sticker style={{ fontSize: 14 }}>+{(zusammen - einzeln).toLocaleString('de-DE')} €</Sticker>
        </div>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>Stand heute — 3 Angaben sind noch offen, die Empfehlung rechnet bei jeder Änderung neu.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="fk-karte" style={{ marginBottom: 0, background: 'var(--funke-weich)' }}>
          <span className="mono-label">Zusammen</span>
          <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 30, lineHeight: 1.1, margin: '6px 0 2px' }}>{zusammen.toLocaleString('de-DE')} €</div>
          <span style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 700 }}>✓ empfohlen</span>
        </div>
        <div className="fk-karte" style={{ marginBottom: 0 }}>
          <span className="mono-label">Einzeln</span>
          <div className="num" style={{ fontFamily: 'var(--schrift-display)', fontWeight: 800, fontSize: 30, lineHeight: 1.1, margin: '6px 0 2px', color: 'var(--tinte-2)' }}>{einzeln.toLocaleString('de-DE')} €</div>
          <span style={{ fontSize: 13, color: 'var(--tinte-2)' }}>Alex {window.FunkeDemo.formatEuro(alex)} · Sam {window.FunkeDemo.formatEuro(sam)}</span>
        </div>
      </div>

      <div style={{ margin: '14px 0' }}>
        <HerkunftsChip quelle={{ regel: 'GÜNST-01 · Splitting-/Grundtarif 2026', rechenweg: 'Beide Tarife vollständig durchgerechnet — kein Näherungswert' }} />
      </div>

      <div className="fk-karte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 14 }}>Gemeinsam mit Sam</b>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--tinte-2)' }}>{kopplung === 'eingeladen' ? 'Einladung raus — sobald Sam annimmt, sind eure Steuerjahre 2026 gekoppelt.' : 'Zwei Steuerjahre, eine Erklärung: Sam pflegt die eigenen Zahlen selbst — ihr seht nur das gemeinsame Ergebnis.'}</span>
        </div>
        {kopplung === 'eingeladen' ? <Chip variante="src" style={{ flex: 'none' }}>Wartet auf Sam</Chip> : <Chip onClick={() => setKopplung('eingeladen')} style={{ flex: 'none' }}>Sam einladen</Chip>}
      </div>

      <div className="fk-karte">
        <b style={{ fontSize: 14 }}>Warum zusammen?</b>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tinte-2)' }}>Euer Einkommensunterschied ist groß genug, dass der{' '}
          <Begriff
            titel="Splittingtarif"
            erklaerung="Der Splittingtarif tut so, als hättet ihr beide exakt gleich viel verdient — und besteuert genau das. Klingt unspektakulär, spart aber richtig Geld, wenn einer von euch mehr verdient. Je größer euer Unterschied, desto größer der Bonus."
            beispiel="60.000 € + 20.000 € → oft mehrere hundert Euro weniger"
            frage="Wie funktioniert der Splittingtarif?"
            onFrage={onFrage}
          >Splittingtarif</Begriff>
          {' '}mehr bringt als zwei Grundtarife. Kippt das (z. B. durch Lohnersatz mit Progressionsvorbehalt), sagen wir es dir hier zuerst.</p>
      </div>

      <Button onClick={onZurueck}>Übernehmen: zusammen veranlagen</Button>
      <p style={{ fontSize: 12, color: 'var(--tinte-2)', textAlign: 'center' }}>Ihr gebt trotzdem eine gemeinsame Erklärung ab — die Wahl steht im Hauptvordruck und bleibt bis zum Bescheid änderbar.</p>
    </div>
  );
}
Object.assign(window, { FunkeVeranlagung });
