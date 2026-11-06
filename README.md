<p align="center">
  <img src="images/steuereule-logo.svg" width="120" height="120" alt="SteuerEule Logo — Eule mit Brille" />
</p>

# Steuereule 🦉

<p align="center">
  <b>Steuerberater füllen heute oft nur noch Formulare aus. Wir bringen echte Beratung zurück — mit KI.</b><br>
  Die moderne, quelloffene Steuer-App, die Menschen hilft, ihr Recht zu nutzen, statt sie mit grauen Formularen und hohen Gebühren allein zu lassen.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Mission-AI_Steuer--Sparbegleiter-C9F229?style=for-the-badge&labelColor=191B12" alt="AI Steuerberatung" />
  <img src="https://img.shields.io/badge/Design-Neobrutalismus_„Funke“-C9F229?style=for-the-badge&labelColor=191B12" alt="Funke Design System" />
  <img src="https://img.shields.io/badge/Security-AES--256--GCM_Feldverschlüsselung-1F9D55?style=for-the-badge" alt="Security" />
  <img src="https://img.shields.io/badge/Grenzgänger-Schweiz_%2B_DE_Splitting-blue?style=for-the-badge" alt="Grenzgänger" />
  <img src="https://img.shields.io/badge/DSGVO-Art._15_/_17_/_20_Export-green?style=for-the-badge" alt="DSGVO" />
</p>

---

## ⚡ Warum Steuereule? Das Steuerberater-Dilemma & unsere Mission

Seien wir ehrlich: **Die meisten Steuerberater beraten heute gar nicht mehr.**

Wer heute in Deutschland oder im Grenzgebiet steuerliche Unterstützung sucht, stößt fast überall auf dieselben Mauern:
1. 🛑 **Kanzleien im Aufnahmestopp & horrende Kosten:** Kanzleien sind chronisch überlastet. Normale Angestellte, junge Familien oder Grenzgänger werden oft gar nicht erst angenommen — oder zahlen unverhältnismäßig hohe Rechnungen.
2. 📋 **Formular-Ausfüller statt echte Berater:** Hat man einen Platz ergattert, verkommt der Service allzu oft zum bloßen „Beleg-Abtippen“. Man sortiert monatelang Rechnungen vor, und die Kanzlei überträgt sie lediglich in die Maske. Proaktive Ideen? Aufdecken ungenutzter Pauschalen? Sparpotenziale querdenken? Fehlanzeige. Man zahlt Hunderte Euro für stumpfes Ausfüllen.
3. 🌫️ **Grauer Amtsschimmel & falsche Versprechungen:** Auf der Gegenseite stehen klassische Steuerprogramme — unübersichtliche Tabellenwüsten, die Angst vor Fehlern schüren, oder Lockvogel-Apps mit erfundenen Punktwert-Erstattungsversprechen („Hol dir 1.095 € zurück!“), die vor dem Finanzamt in sich zusammenbrechen.

**Wir finden: Das Steuer-System muss für Menschen da sein, nicht gegen sie.**
Steuereule wurde gegründet, um Menschen mit intelligenter Technologie etwas Gutes zu tun und steuerliches Expertenwissen für alle zugänglich zu machen — unabhängig von Geldbeutel oder Kanzleikontakten.

---

## 🤖 Wie KI die Steuerwelt verändert: Echte Beratung statt Formular-Frust

Künstliche Intelligenz ist bei uns kein Werbegag, sondern das Herzstück eines neuen Steuer-Erlebnisses:

* 🦉 **Der Eulen-Modus (Dein KI-Spar-Begleiter):** Wo ein herkömmliches Formular stumm auf Eingaben wartet, denkt unsere KI aktiv mit. Sie analysiert deine Lebenssituation ganzheitlich, entdeckt ungenutzte Pauschalen (Arbeitszimmer, Pendlerwege, Fortbildungen, Sonderausgaben) und schlägt dir verständlich formulierte Optimierungen vor — genau die Fragen, die dir ein engagierter Berater stellen sollte.
* 🛡️ **Zero-Hallucination & 100% deterministischer Kern:** KI darf kreativ beraten, aber **niemals Zahlen erfinden**. Deshalb trennt Steuereule Beratung und Berechnung strikt: Die KI unterstützt, strukturiert und erklärt Sachverhalte in einfacher Sprache. Die eigentliche Steuerberechnung läuft in einem quelloffenen, strikt deterministischen TypeScript-Kern ([`@steuereule/core`](packages/core/)) auf Basis der gesetzlichen BMF-Vorgaben.
* ⏱️ **In wenigen Minuten auf den Cent verifizierbar:** Keine undurchsichtige Blackbox! Jeder erfasste Posten wird transparent vorgerechnet und mündet direkt in amtlich vermessene, offizielle PDF-Vordrucke. Du, dein Partner oder ein Fachmann könnt das Ergebnis **in 5 Minuten Zeile für Zeile gegen die Original-Formulare prüfen**.
* 🎯 **Ehrliche Spannen statt falscher Garantien:** Steuereule schätzt deine Erstattung stets als realistische Bandbreite (Mindest- und Höchstwert gemäß [ADR-032](docs/adr/0032-honest-refund-ranges.md)). Keine geratenen Fantasiezahlen.
* ⚖️ **Ehrlicher rechtlicher Rahmen:** Steuereule erbringt keine geschäftsmäßige Rechts- oder Steuerberatung im Sinne des Steuerberatungsgesetzes (StBerG). Wir bieten dir das intelligenteste Werkzeug, um deine Steuererklärung eigenverantwortlich, optimal und mit minimalem Zeitaufwand vorzubereiten.

---

## ✨ Was Steuereule heute kann

| Feature | Das steckt dahinter |
|:---|:---|
| 🦉 **Eulen-Modus (KI-Spar-Assistent)** | Analysiert deine Angaben quer, findet versteckte Abzugsmöglichkeiten und erklärt kompliziertes Steuerdeutsch ohne Amtsfloskeln. |
| 🇨🇭 **Grenzgänger-Spezialist (CH ⇄ DE)** | Vollständige Erfassung des Schweizer Lohnausweises, automatische Umrechnung mit Monatswechselkursen, Nichtrückkehrtage, Anlage N-Gre, Schweizer Säule 2/3 sowie Differenzkindergeld. |
| 👫 **Ehepaare & Partnerschaften** | Zusammen- oder Einzelveranlagung mit automatischem Günstigervergleich (Splitting). Person B kann ohne eigenes Konto direkt von Person A mit erfasst werden — oder per 16-stelligem Einladungscode beitreten. |
| 🏡 **Vermietung & Verpachtung (Anlage V)** | Mehrere Mietobjekte, Mehrfamilienhäuser mit Wohneinheiten, Schuldzinsen, laufende Kosten und historische lineare AfA. |
| 📈 **Kapitalerträge (Anlage KAP)** | Deutsche und ausländische Broker, Sparer-Pauschbetrag, Verteilung bei Gemeinschaftsdepots und automatischer Günstigerprüfungs-Antrag. |
| 🔥 **Neobrutalismus „Funke“** | Schluss mit grauen Tabellen: Knalliges Design ([„Funke“-Designsystem](finanzo-funke-design-system/project/readme.md)), fette Konturen, haptische Buttons und strikt **1 Gedanke pro Screen**. |
| 🔒 **Banken-Sicherheit (Feldverschlüsselung)** | Deine Steuer-ID und Profildaten werden serverseitig mit **AES-256-GCM** verschlüsselt und landen niemals im Browser-Speicher. Jeder Zugriff wird auditiert. |
| ⚡ **Gast-Modus ohne Registrierungszwang** | Starte komplett anonym. Erst wenn du deine Daten dauerhaft sichern willst, nimmst du sie mit einem Klick in dein echtes Konto mit. |
| 📄 **Amtlicher PDF-Ausdruck** | Generiert auf den Millimeter vermessene, offiziell abgabefähige PDF-Vordrucke für alle unterstützten Anlagen (ESt 1 A, N, N-Gre, Kind, KAP, V, Vorsorgeaufwand). |

---

## 📸 Ein Blick in die App

| Cockpit mit ehrlicher Spanne | Quiz-Interview (1 Frage / Screen) | Onboarding & Stammdaten |
|:---:|:---:|:---:|
| <img src="images/screenshots/cockpit.png" width="280" alt="Cockpit Screen" /> | <img src="images/screenshots/interview.png" width="280" alt="Interview Screen" /> | <img src="images/screenshots/onboarding.png" width="280" alt="Onboarding Screen" /> |
| *Erstattung transparent als Spanne, keine falschen Garantien.* | *Schnell, fokussiert und ohne Fachchinesisch.* | *Datensparsam, feldverschlüsselt und DSGVO-konform.* |

| Profil & Einstellungen | QR-Gerätefreigabe ohne Passwort | Willkommen & Gast-Modus |
|:---:|:---:|:---:|
| <img src="images/screenshots/profil.png" width="280" alt="Profil Screen" /> | <img src="images/screenshots/geraetefreigabe.png" width="280" alt="Gerätefreigabe Screen" /> | <img src="images/screenshots/login.png" width="280" alt="Login Screen" /> |
| *Volle DSGVO-Transparenz mit Datenexport und Löschung.* | *Nahtloser Login am Desktop via Handy-Kamera.* | *Sofort loslegen ohne Registrierungszwang.* |

---

## 🏗️ Architektur im Überblick

Gebaut als sauberes, hochgradig typisiertes Monorepo:

```text
├── apps/
│   ├── mobile-web       # Expo + React Native Web (TanStack Query, i18n, Funke UI)
│   └── api              # NestJS + Fastify REST-API (/v1/*), Prisma auf Postgres
├── packages/
│   ├── core             # UI-freier deterministischer Steuerkern (Mathematik & Tarife)
│   ├── ui               # Neobrutalistisches Design-System (Funke-Komponenten)
│   ├── tokens           # Style Dictionary Design Tokens (Farben, Radien, Schatten)
│   └── api-client       # Typisierter API-Client (OpenAPI-generiert via orval)
└── e2e/                 # Playwright Browser-Gates gegen den realen Stack
```

* Die Architektur ist ausführlich in [arc42](docs/arc42/README.md) dokumentiert.
* Jede wesentliche Entscheidung ist in Architektur-Entscheidungsprotokollen festgehalten: [Engineering ADRs](docs/adr/) und [Produkt ADRs](finanzo-funke-design-system/project/research/adr/).

---

## 🚀 In 60 Sekunden lokal starten

```bash
scripts/local.sh          # alles in Containern, wie in Produktion
scripts/local.sh dev      # zum Entwickeln, Web mit Hot Reload
scripts/local.sh mail     # lokales Postfach öffnen
scripts/local.sh help     # alle Befehle (logs, status, down, reset)
```

* **`up`:** Web [http://localhost:8080](http://localhost:8080), API [http://localhost:3000](http://localhost:3000). Legt beim ersten Mal `.env` aus `.env.example` an.
* **`dev`:** Web [http://localhost:8081](http://localhost:8081), API [http://localhost:3000](http://localhost:3000), Postgres auf Port 5434.
* **Postfach:** [http://localhost:8025](http://localhost:8025) (Mailpit) — Bestätigungs- und Passwort-Mails landen hier, nie im Internet.

> **Gut zu wissen vor dem ersten Klick:**
> 1. **Die Datenbank startet leer:** „Sauberes Blatt“ – du kannst direkt als Gast starten oder dich neu registrieren.
> 2. **Apple Silicon (arm64):** Vollständig validiert – Container, Postgres, Migrationen und Headless-Chromium PDF-Export laufen auf M-Chips out of the box.

---

## 🏆 Qualität & Engineering-Exzellenz

* **Vierstufige Definition of Done:** Ticket, REQ, Phase, 1.0 ([ADR-0036](docs/adr/0036-definition-of-done.md)) mit Security- & Performance-Posture.
* **Tiered Testing:** Unit-, Integration- (echtes Postgres) und Acceptance-Tests (echter Socket) sowie Playwright Browser-Gates in CI.
* **S10 UI-Abnahmetest:** Echte 4-Persona-End-to-End-Abnahme (inkl. Grenzgänger Schweiz, Kinder, Vermietung, Kapital) vor jedem Merge.
* **AI-Crew Process:** Dokumentierte KI-Kollaborations-Architektur (siehe [CONTRIBUTORS.md](CONTRIBUTORS.md) und [docs/process/](docs/process/)).

---

## 📄 Lizenz & Nutzung

Dieses Repository ist **für die private, persönliche Nutzung frei und quelloffen**.

* **Private Nutzung:** Du darfst den Code ansehen, lokal ausführen, für dich anpassen und deine eigene Steuererklärung damit verwalten.
* **Kommerzielle Nutzung:** Jegliche kommerzielle Verwertung, Bereitstellung als kostenpflichtiger SaaS-Dienst oder Nutzung durch gewerbliche Steuerberater/Unternehmen bedarf einer gesonderten Lizenzvereinbarung.

Lizenziert unter der [PolyForm Noncommercial License 1.0.0](LICENSE). Hinweis: Das ist eine
„Source-Available“-Lizenz, keine OSI-Open-Source-Lizenz.
