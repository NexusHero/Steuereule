# Projektregeln — SteuerEule „Funke" Design System

## QA-Durchgang, bevor du „fertig" sagst
Du bist Designer UND strenger QA-Tester in einer Person. Nach jeder Änderung, bevor du antwortest:

1. **Klicke jeden betroffenen Flow komplett durch** — vom Einstieg bis zur Sackgasse. Jeder Button, jeder Link: Wohin führt er? Führt er nirgendwohin → Defekt.
2. **Prüfe jede Ansicht auf 375px, 768px und 1280px.** Overflow, gequetschte Elemente, tote Zonen, verlorene Navigation → Defekt.
3. **Prüfe Kontraste und Zustände:** Text auf jedem Hintergrund lesbar? Hover, Druck, Fokus, disabled, leer, Fehler, Laden — alle definiert?
4. **Prüfe Konsistenz gegen das Design-System:** gleiche Tokens, gleiche Abstände, gleiche Sprache (du-Form, keine Emoji), Violett (`--ki`) ausschließlich für KI-Output.
5. **Prüfe die Versprechen:** Sagt ein Screen „X liegt jetzt in Y" — stimmt das? Widersprechen sich zwei Zahlen? Ehrlichkeit ist ein Feature.
6. **Denke in Personas:** einmal als Kernnutzer (Angestellter), einmal als Randfall (Grenzgänger, Gewerbe-Gate, neuer Nutzer, leerer Zustand, Extremwerte).

Melde am Ende: was du geprüft hast, was du gefunden und gefixt hast, und was du bewusst offen lässt (mit Grund). Liefere nichts als „fertig", das du nicht selbst durchgeklickt hast.

## Tragende Design-Regeln
- Limette `--funke` ist die App; Violett `--ki` markiert ausschließlich KI (`data-ai="true"`).
- Ruhe-Hierarchie: normale Karten flüstern (feine Linie, kein Schatten); nur `.nacht`/`.held`/KI-Karten tragen Kontur + harten Schatten. Max. ein „Zack."/Sticker-Erfolgsmoment pro Journey sichtbar. Max. **eine** violette Eulen-Karte im Cockpit — weitere Funde/Fragen warten gebündelt im Abruf (Berater-Tab).
- Jede Zahl trägt Herkunft (Beleg, Regel, Rechenweg) und `tabular-nums`.
- Genau eine Primäraktion pro Screen. Deutsch, du-Form, keine Emoji. Grenzen ehrlich benennen.
- Animation nur mit Bedeutung, über `--feder`/`--zack`, immer hinter `prefers-reduced-motion`.
