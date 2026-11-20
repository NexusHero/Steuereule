# Zeilen der Anlage S und G (ADR-0101 §22)

Für die Anlagen S und G gibt es keine öffentliche amtliche Vorlage mit Zeilen und Kennzahlen
(`docs/research/selbststaendige-formulare.md`). Die Ausfüllhilfe zeigt die Beträge deshalb ohne Zeile,
bis hier eine Datei je Formular und Jahr liegt, abgelesen in Mein ELSTER.

Dateiname `anlage-g-2025.json` (bzw. `anlage-s-<jahr>.json`):

```json
{
  "form": "anlage-g",
  "year": 2025,
  "source": "Mein ELSTER, Anlage G 2025, abgelesen am TT.MM.JJJJ von …",
  "lines": [
    { "id": "anlage-g.gewinn", "zeile": "…", "kennzahlen": ["…"], "label": "Beschriftung wie in Mein ELSTER" }
  ]
}
```

Erlaubte `id`: Anlage S `anlage-s.gewinn`, `anlage-s.veraeusserungsgewinn`; Anlage G `anlage-g.gewinn`,
`anlage-g.veraeusserungsgewinn`, `anlage-g.messbetrag`, `anlage-g.gewerbesteuer`. Die API prüft jede Datei
beim Start (`parseSuppliedLines` im Kern); eine fehlerhafte Datei wird übersprungen und im Log genannt.
Bitte nur eintragen, was in Mein ELSTER steht, nichts aus Kopien Dritter.
