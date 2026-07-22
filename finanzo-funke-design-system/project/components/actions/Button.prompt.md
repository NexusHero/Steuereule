Voll-breiter Aktionsknopf; pro Screen genau eine `primaer`-Instanz ("Ein nächster Schritt"-Regel).

```jsx
<Button onClick={weiter}>Übertragung starten</Button>
<div style={{ display: 'flex', gap: 8 }}>
  <Button variante="leise">Übernehmen (+80 €)</Button>
  <Button variante="ghost">Trifft nicht zu</Button>
</div>
```

Varianten: `primaer` (Limette), `ghost` (weiß), `leise` (Limette-weich, kleiner Schatten), `nacht` (Tinte-Grund, Limetten-Text — für dunkle Flächen). Nie in KI-Violett.
