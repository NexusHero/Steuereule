# ADR-045 — Nativer Funktionsumfang & Expo Dev Builds

**Status:** Akzeptiert (Grilling Architektur-Session) · 2026-07-22

**Kontext:** Der Beleg-Scan ist das Atom des Produkts (ADR-007, ADR-019), Push trägt
Frist/Bescheid/GG-Tracker (ADR-024), und ein Finanz-Produkt profitiert von Biometrie und
sicherer Token-Ablage. Moderne Expo (Dev Builds + Config Plugins / Continuous Native
Generation) hebt den alten „Managed = eingeschränkt"-Kompromiss auf: voller nativer Zugriff,
inklusive eigenem Swift/Kotlin — gleichauf mit bare RN und praktisch mit Flutter.

**Entscheidung:** **Expo Dev Builds + Config Plugins** statt manuellem „Eject".

**1.0 — fest eingebaut:** Kamera-Scan (`react-native-vision-camera`) mit **On-Device-OCR**
(ML Kit / VisionKit — der Beleg wird auf dem Gerät gelesen, passt zur Datenschutz-Haltung) ·
Dokument-/PDF-Upload · Push (ereignisbasiert + eine Saison-Erinnerung, ADR-024) ·
Biometrie-App-Sperre (Face ID / Touch ID / Fingerprint) · Secure Storage (Keychain/Keystore).

**Bewusst später (2.0+):** Dynamic Island / Live Activities (iOS-only, eigene
Swift-Widget-Extension — ein Delight, kein 1.0-Kern) · Home-Screen-Widgets · Siri/App
Intents · In-App-Purchase (kommt mit der ELSTER-Abgabe, ADR-005/017).

**Web (RNW) — Fallbacks, keine Blocker:** Kamera → `getUserMedia`, keine Biometrie (ggf.
WebAuthn), Web-Push, kein Dynamic Island.

**Konsequenzen:** Native Features verzweigen `Platform.OS === 'web'` mit Fallback. Die
On-Device-OCR minimiert, welche Beleg-Daten das Gerät verlassen — relevant für die noch
offene KI-Datenschutz-Klärung (ADR-048). Native Reichweite ist kein Unterschied zu Flutter;
die Expo-Wahl (ADR-044) kostet keinen nativen Zugriff.
