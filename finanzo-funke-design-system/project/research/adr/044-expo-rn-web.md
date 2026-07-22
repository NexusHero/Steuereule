# ADR-044 — Expo + React-Native-Web: eine App-Codebasis, Marketing separat

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22 · **präzisiert ADR-003**

**Kontext:** ADR-003 legte React Native + React Web fest (kein Flutter). Offen blieb, *wie*
Mobile und Web sich eine Codebasis teilen. Das Design-System liegt als React-DOM/CSS vor.
Zwei Wege: (a) zwei Renderer (Web erbt das CSS-DS 1:1, Mobile bekommt eigene Primitives),
(b) eine React-Native-Codebasis, die via react-native-web auch Web rendert.

**Entscheidung:** **Expo + React-Native-Web** — eine RN-Codebasis für iOS, Android und die
**Web-App**. Das bestehende CSS-DS wird damit zur *visuellen Spezifikation* und einmalig in
RN-Primitives neu gebaut (siehe ADR-050); auch das Web rendert über RNW, nicht über die
`fk-*`-CSS-Klassen.

Die **Marketing-Landingpage** (`ui_kits/website`) wird **ausgeklammert** und als eigene,
schlanke **React-DOM-Seite** gebaut — sie lebt von SEO und First Paint, wo RNW schwach ist.

**Konsequenzen:** Ein App-Deploy für iOS/Android/Web-Export; ein separater Deploy für die
DOM-Marketing-Seite. Die Funke-Effekte (harter Versatz-Schatten, gestrichelte KI-Linie,
conic-Ring, gleitende Tab-Pille) werden in RN-Styling + Reanimated reimplementiert. Web
(RNW) ist tragbar, aber nicht-idiomatisch — bewusst in Kauf genommen für „eine Codebasis".
Das Modell folgt „Handy = reinwerfen, Web = prüfen & abgeben" (Tech-Direktion).
