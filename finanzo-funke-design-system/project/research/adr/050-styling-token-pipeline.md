# ADR-050 — Styling-Engine & Token-Pipeline: RN StyleSheet + Style Dictionary

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22

**Kontext:** Mit Expo + React-Native-Web (ADR-044) wird das Design-System einmal in
RN-Primitives neu gebaut; RN kennt kein CSS. Es gibt bereits eine maschinenlesbare Token-Quelle
(`_ds_manifest.json`: ~90 Tokens mit `kind` und Dunkel-Theme-Scope) und eine Adherence-Config
(`_adherence.oxlintrc.json`: kein roher Hex/px, Import nur über den Index).

**Entscheidung:**
- **Pures React-Native `StyleSheet`** für die 18 Komponenten — keine Styling-Framework-Schicht.
  Begründung: die Tech-Direktion lebt von minimalen Abhängigkeiten, die Funke-Effekte sind
  bewusst handgemacht (harter Versatz-Schatten, gestrichelt-violette KI-Linie, conic-Ring,
  gleitende Tab-Pille), und 18 Komponenten sind von Hand beherrschbar. Kein Tamagui/NativeWind.
- **Token-Pipeline via Style Dictionary.** Quelle = normalisierte Tokens (aus `_ds_manifest.json`
  gespeist). Ausgaben: **CSS-Variablen** für die Marketing-DOM-Seite (ADR-044) **und** ein
  **typisiertes RN-Theme-Objekt** für die App. Custom-Transforms für Schatten und Easing, die RN
  anders behandelt als CSS.
- **Adherence-Checks in die CI** (aus `_adherence.oxlintrc.json` portiert): kein Hex/px außerhalb
  der Tokens · `data-ai` ⇔ `--ki`-Nutzung · Touch-Ziele ≥ 44px · `prefers-reduced-motion`-Pfad.

**Konsequenzen:** Eine Token-Wahrheit für beide Renderer. Web (RNW-App) und Marketing (DOM)
ziehen aus derselben Quelle. Das bestehende CSS-DS bleibt als visuelle Referenz erhalten; der
laufende Code entsteht neu in RN. Storybook-Ersatz ist die Zustands-Galerie (hover/press/focus/
disabled/leer/Fehler/Laden je Komponente, Pflicht vor Merge — Tech-Direktion).
