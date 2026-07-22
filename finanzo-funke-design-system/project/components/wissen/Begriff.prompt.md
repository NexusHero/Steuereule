„Die Eule erklärt's": nachschlagbarer Fachbegriff — gepunktet unterstrichen, Tipp öffnet ein Erklär-Sheet mit 3 warmen Sätzen, einem Zahlen-Beispiel und optional „Frag die Eule" in den Berater.

```jsx
<p>
  Dein Geld fällt unter den{' '}
  <Begriff
    titel="Sparerpauschbetrag"
    erklaerung="1.000 € Zinsen und Kursgewinne im Jahr sind steuerfrei — einfach so, für alle. Erst ab dem 1.001sten Euro will das Amt etwas sehen."
    beispiel="812 € Erträge → 0 € Steuer"
    frage="Was ist der Sparerpauschbetrag?"
    onFrage={(f) => geheZuBerater(f)}
  >Sparerpauschbetrag</Begriff>.
</p>
```

Regeln: max. 1–2 Begriffe pro Screen · nie automatisch öffnen, keine Touren · Erklärungen sind redaktionelle Fakten → normale Farben, NIE Violett (`--ki` bleibt exklusiv KI-Output) · gepunktete Linie ≠ gestrichelte KI-Linie (`KiWert`) · Ton: cooler Tutor, du-Form, Bilder statt Paragrafen („wie ein abgeschicktes Paket"), Paragraf nur als Beiwerk in Klammern.
