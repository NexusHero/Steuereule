/* EINE Quelle für jede Zahl, die auf mehr als einem Screen auftaucht — Regel 10 (guidelines/tech-direktion.md).
   Screens lesen window.FunkeDemo; Formatierung ausschließlich über formatZahl/formatEuro/formatEuroCent. */
window.FunkeDemo = {
  jahr: 2026,
  schaetzung: 1407, // Cockpit-Held: Basis vor Berater-Funden
  offeneAngaben: 3, // Cockpit + Veranlagung: „3 Angaben offen"
  minutenOffen: 9, // ehrliche Restzeit: 3 Lücken × ~3 min
  gg: { uebernommen: 7, markiert: [2, 3, 9, 16, 22], max: 60 }, // → 12/60 überall
  veranlagung: { zusammen: 2134, alex: 1410, sam: 312 }, // einzeln = alex + sam
  bescheid: { jahr: 2025, betrag: 1444, berechnet: 1487, frist: '18. August 2026' }, // delta = betrag − berechnet
  statistik: {
    jahre: [
      { jahr: 2022, erstattung: 640, gezahlt: 9840 },
      { jahr: 2023, erstattung: 810, gezahlt: 10620 },
      { jahr: 2024, erstattung: 987, gezahlt: 11310 },
    ],
    aelter: { von: 2019, bis: 2021, summe: 1130, gezahlt: 26400 },
  },
  formatZahl(n) { return n.toLocaleString('de-DE'); },
  formatEuro(n) { return n.toLocaleString('de-DE') + ' €'; },
  formatEuroCent(n) { return n.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €'; },
};
/* Abgeleitet, nie doppelt gepflegt: */
window.FunkeDemo.veranlagung.einzeln = window.FunkeDemo.veranlagung.alex + window.FunkeDemo.veranlagung.sam;
window.FunkeDemo.bescheid.delta = window.FunkeDemo.bescheid.betrag - window.FunkeDemo.bescheid.berechnet;
window.FunkeDemo.gg.stand = window.FunkeDemo.gg.uebernommen + window.FunkeDemo.gg.markiert.length;
window.FunkeDemo.statistik.jahre.push({ jahr: window.FunkeDemo.bescheid.jahr, erstattung: window.FunkeDemo.bescheid.betrag, gezahlt: 11980 });
