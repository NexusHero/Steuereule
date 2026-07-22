# ADR-014 — KI schlägt vor, legt nie selbst an

**Status:** Akzeptiert (Grilling R2, delegiert) · 2026-07-22

**Kontext:** KI erkennt „Arbeitszimmer möglich" aus einem Beleg. Legt sie den Posten selbst an, entstehen Zahlen, die der Nutzer nie gesehen hat — bricht „jede Zahl trägt Herkunft" im Geist, auch wenn ein violetter Chip dranhängt. Sammel-Prüfung am Ende verschiebt die Verantwortung an den müdesten Moment der Journey.

**Entscheidung:** Die KI **erkennt und schlägt vor; jeder Vorschlag braucht einen expliziten Tap**. Ein KI-Vorschlag ist ein eigenes Objekt (violett, `data-ai="true"`), das erst durch Annahme zum Posten wird — dann mit Herkunft „Beleg + KI-Vorschlag, bestätigt". Abgelehnte Vorschläge verschwinden still (kein Nag).

**Konsequenzen:** Vorschlags-Kartenstil existiert bereits (KI-Karten); braucht klaren Annehmen/Ablehnen-Doppelknopf. Erstattungs-Ticker zählt Vorschläge nie mit — auch nicht als Spanne.

# ADR-015 — Erstattungs-Ticker zeigt Spannen, keine Punktwerte

**Status:** Akzeptiert (Grilling R2) · 2026-07-22

**Kontext:** Frühe Punktschätzung („Du bekommst 740 € zurück") ist eine Wette; fällt sie später, fühlt sich der Nutzer betrogen.

**Entscheidung:** Vor Vollständigkeit zeigt der Ticker eine **Spanne** („620–740 €"), die sich mit jedem geklärten Posten verengt. Punktwert erst, wenn alle Pflichtbereiche abgeschlossen und keine Konflikte offen sind. Offene Konflikte (ADR-008) zeigen „± offen" an der Spanne.

**Konsequenzen:** Ticker-Komponente braucht Spannen-Darstellung + Verengungs-Animation (--feder). Die Verengung IST das Fortschrittsgefühl — ersetzt Prozentbalken-Denken.
