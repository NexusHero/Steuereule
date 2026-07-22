/* Eulen-Modus (ADR 037–042) — Fund-Karten + Abruf-Gespräch („Was würdest du mich fragen?").
   Karten neutral, Kern-Aussage violett (--ki), „Stimmt nicht"-Knopf, Rechtsstand-Zeile. */
const { Button, Chip, AiChip } = window.FinanzoFunkeDesignSystem_7e417e;

/* Die 4 Demo-Funde (R3) — je Persona einer; Reihenfolge nach geschätztem Betrag */
const EULEN_FUNDE = [
  { id: 'zins', wer: 'Vermieter', kern: 'Deine Zinsbescheinigung fehlt — letztes Jahr waren es 1.900 €.', frage: 'Zahlst du den Kredit für die Wohnung noch ab?', betrag: '≈ 570 €', quelle: 'Vergleich mit deinem Steuerjahr 2025' },
  { id: 'ziffer10', wer: 'Grenzgänger', kern: 'Dein Lohnausweis zeigt Ziffer 10 (Spesen) — die sind bei dir noch nirgends.', frage: 'Hast du die Spesen privat verauslagt oder erstattet bekommen?', betrag: '≈ 180 €', quelle: 'Lohnausweis 2026, Ziffer 10' },
  { id: 'homeoffice', wer: 'Angestellter', kern: 'Homeoffice angegeben, aber keine Arbeitsmittel.', frage: 'Stuhl? Monitor? Irgendwas gekauft fürs Arbeiten zu Hause?', betrag: '≈ 120 €', quelle: 'Lücke im Muster: Homeoffice ohne Arbeitsmittel' },
  { id: 'kita', wer: 'Eltern', kern: 'Kita-Rechnung gefunden — Kinderbetreuung ist noch nicht angelegt.', frage: 'Soll ich die Lebenslage Kinderbetreuung für dich anlegen?', betrag: '≈ 800 €', quelle: 'Beleg „Kita-Rechnung März" im Posteingang' },
];

function eulenAn() {
  try { return localStorage.getItem('funke.eulenmodus') === '1'; } catch (e) { return false; }
}
function setEulenAn(an) {
  try { localStorage.setItem('funke.eulenmodus', an ? '1' : '0'); } catch (e) {}
}

/* Proaktive Gesetzes-Fund-Karte (nur ≥ 50 €, ADR-038) — fürs Cockpit */
function FunkeGesetzesFund({ onWeg }) {
  const [zu, setZu] = React.useState(false);
  if (zu) return null;
  return (
    <div className="fk-karte" data-ai="true" style={{ borderColor: 'var(--ki)', boxShadow: '4px 4px 0 var(--ki)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <AiChip>Eulen-Fund</AiChip>
        <b className="num" style={{ color: 'var(--ki)', fontSize: 18 }}>+140 €</b>
      </div>
      <p style={{ margin: '10px 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--ki)' }}>Gerichte haben entschieden: Dein Arbeitszimmer zählt auch bei zwei Arbeitgebern voll.</p>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tinte-2)' }}>Betrifft deinen Posten „Arbeitszimmer" — ich habe nachgerechnet. <a href="#" onClick={(e) => e.preventDefault()}>Zur Quelle</a></p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variante="leise" style={{ minHeight: 40, width: 'auto', fontSize: 13 }} onClick={() => setZu(true)}>Übernehmen</Button>
        <Button variante="ghost" style={{ minHeight: 40, width: 'auto', fontSize: 13 }} onClick={() => { setZu(true); }}>Stimmt nicht</Button>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--tinte-2)' }}>Rechtsstand: 22.07.2026</p>
    </div>
  );
}

/* Cockpit-Einstieg: EINE violette Sammelkarte — Fragen + Fund gebündelt (max. 1 violette Karte im Cockpit) */
function FunkeEulenEinstieg({ onAbruf }) {
  if (!eulenAn()) return null;
  return (
    <button onClick={onAbruf} className="fk-karte" data-ai="true" style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: 'var(--ki)', flex: 'none' }}></span>
      <span style={{ flex: 1, fontSize: 14 }}><b style={{ color: 'var(--ki)' }}>Ich hätte {EULEN_FUNDE.length} Fragen — und einen Fund: +140 €.</b> <span style={{ color: 'var(--tinte-2)' }}>Zusammen ≈ 1.810 € — zwei Minuten?</span></span>
      <span aria-hidden="true" style={{ fontWeight: 800 }}>→</span>
    </button>
  );
}

/* Abruf-Gespräch: eine Frage nach der anderen (ADR-038), Leerlauf ehrlich (ADR-039) */
function FunkeEulenAbruf({ onSchliessen }) {
  const [i, setI] = React.useState(0);
  const [erledigt, setErledigt] = React.useState({});
  const offene = EULEN_FUNDE.filter((f) => !erledigt[f.id]);
  const jetzt = new Date();
  const stand = jetzt.toLocaleDateString('de-DE') + ', ' + jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (offene.length === 0) {
    return (
      <div>
        <FunkeGesetzesFund></FunkeGesetzesFund>
        <div className="fk-karte" style={{ textAlign: 'center', padding: 24 }}>
        <b style={{ fontSize: 16 }}>Nichts offen.</b>
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: 'var(--tinte-2)' }}>Dein Jahr ist gut gepflegt — ich melde mich, wenn sich was ändert.</p>
        <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--tinte-2)' }}>Zuletzt geprüft: {stand}</p>
        {onSchliessen && <Button variante="ghost" style={{ width: 'auto', minHeight: 40 }} onClick={onSchliessen}>Zurück</Button>}
        </div>
      </div>
    );
  }
  const f = offene[Math.min(i, offene.length - 1)];
  const antworte = (was) => { setErledigt({ ...erledigt, [f.id]: was }); setI(0); };
  return (
    <div>
      <FunkeGesetzesFund></FunkeGesetzesFund>
      <div className="fk-karte" data-ai="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <AiChip>Frage {EULEN_FUNDE.length - offene.length + 1} von {EULEN_FUNDE.length}</AiChip>
          <b className="num" style={{ color: 'var(--ki)', fontSize: 16 }}>{f.betrag}</b>
        </div>
        <p style={{ margin: '10px 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--ki)' }}>{f.kern}</p>
        <p style={{ margin: '0 0 10px', fontSize: 14 }}>{f.frage}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variante="leise" style={{ minHeight: 42, width: 'auto', fontSize: 13 }} onClick={() => antworte('ja')}>Ja, kümmern wir uns drum</Button>
          <Button variante="ghost" style={{ minHeight: 42, width: 'auto', fontSize: 13 }} onClick={() => antworte('nein')}>Trifft nicht zu</Button>
          <Button variante="ghost" style={{ minHeight: 42, width: 'auto', fontSize: 13 }} onClick={() => antworte('falsch')}>Stimmt nicht</Button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--tinte-2)' }}>Woher: {f.quelle}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--tinte-2)' }}>Rechtsstand: 22.07.2026 · Verworfenes kommt nur bei neuen Fakten wieder</p>
        {offene.length > 1 && <Chip style={{ minHeight: 32, fontSize: 12 }} onClick={() => setI((i + 1) % offene.length)}>Nächste</Chip>}
      </div>
    </div>
  );
}

Object.assign(window, { FunkeEulenAbruf, FunkeEulenEinstieg, FunkeGesetzesFund, FunkeEulenFunde: EULEN_FUNDE, funkeEulenAn: eulenAn, funkeSetEulenAn: setEulenAn });
