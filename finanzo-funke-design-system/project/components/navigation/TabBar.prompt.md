Schwebende Pillen-Tab-Bar; die Limetten-Pille gleitet mit `--feder` hinter den aktiven Tab (Desktop-Rail: vertikal, gleicher Code), das Ziel-Icon poppt. `prefers-reduced-motion` → harter Wechsel.

```jsx
<TabBar
  tabs={[
    { id: 'cockpit', label: 'Übersicht' },
    { id: 'belege', label: 'Belege' },
    { id: 'berater', label: 'Berater' },
    { id: 'jahr', label: 'Jahr' },
    { id: 'profil', label: 'Profil' },
  ]}
  aktiv={tab}
  onWechsel={setTab}
/>
```

Icons: eingebaute Schlüssel (`cockpit`, `belege`, `berater`, `jahr`, `uebertragen`, `profil`) oder eigener 24er-Grid-Stroke-Pfad via `icon` (round caps). Für den Richtungs-Slide des Inhalts siehe `ui_kits/app/index.html` (`fx-slide-rechts/links` + `TAB_ORDNUNG`).
