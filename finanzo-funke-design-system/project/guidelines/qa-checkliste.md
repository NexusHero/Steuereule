# QA-Checkliste — vor jedem „fertig"

Ergänzt die Regeln in `CLAUDE.md` und `tech-direktion.md`. Jeder Durchgang hakt ab:

## Zahlen & Ehrlichkeit
- [ ] Jede Zahl, die auf 2+ Screens auftaucht, kommt aus `ui_kits/app/demo-daten.js` (`window.FunkeDemo`) — nie zweimal als Literal.
- [ ] Ableitbare Zahlen (Deltas, Summen, Durchschnitte) werden GERECHNET, nie parallel gepflegt.
- [ ] Formatierung nur über `formatZahl`/`formatEuro`/`formatEuroCent` — kein „1,2k" neben „987".
- [ ] Jahresangaben widersprechen sich nicht (Bescheid = letztes abgeschlossenes Jahr; laufendes Jahr trägt nur Schätzungen mit „≈" und Herkunft).
- [ ] Kein Screen verspricht, was das Produkt nicht kann — Grenzen stehen als Gate/Banner im UI.

## UI-Konsistenz
- [ ] Persona-gebundene Elemente (GG-Chip u. Ä.) erscheinen nur bei gesetztem Profil-Flag UND nur auf Screens, wo sie Arbeit unterstützen — nie auf Profil/Statistik/Rechtliches.
- [ ] Pills/Sticker: geschütztes Leerzeichen (`\u00A0`) zwischen Zahl und Wort; bei 375px kein Umbruch, kein Overflow.
- [ ] Violett ausschließlich `data-ai="true"`; gepunktet = Wissen; Pill „Vorläufig" = vorläufiger Fakt.
- [ ] Genau eine Primäraktion pro Screen; jeder Button führt irgendwohin.
- [ ] 375 / 768 / 1280 px geprüft; Toasts nach destruktiven Aktionen mit „Rückgängig".

## Bewusste Nicht-Ziele (1.0) — fehlen ist entschieden, nicht vergessen
- Partner-Zugang (Sam trägt man mit ein — steht ehrlich in der Veranlagung) → 2.0
- EÜR / Anlage G/S / Umsatzsteuer → Gewerbe-Gate mit Benachrichtigungs-Hook
- Komplexe Vermietung (AfA-Staffeln, Veräußerung) → Gate
- Gekippter Grenzgänger-Fall (CH-Quellensteuer) → Profi-Verweis + Tracker-Export
- Eigener Schriftgrößen-Regler → App folgt System-Dynamic-Type (Profil sagt das)
- ELSTER-Direktversand → wartet auf ERiC-Zertifikat (Paywall/Profil sagen „bald ERiC")
