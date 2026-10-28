# Steuereule 🦉

<p align="center">
  <b>Steuern? Zack, erledigt.</b><br>
  Die moderne, quelloffene Steuer-App, die dir nichts verspricht, was sie nicht liefert.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Design-Neobrutalismus_„Funke“-C9F229?style=for-the-badge&labelColor=191B12" alt="Funke Design System" />
  <img src="https://img.shields.io/badge/Frontend-Expo_%7C_React_Native_Web-191B12?style=for-the-badge&logo=react" alt="Frontend" />
  <img src="https://img.shields.io/badge/Backend-NestJS_%7C_Fastify-E0234E?style=for-the-badge&logo=nestjs" alt="Backend" />
  <img src="https://img.shields.io/badge/Security-AES--256--GCM_Field_Encryption-1F9D55?style=for-the-badge" alt="Security" />
  <img src="https://img.shields.io/badge/DSGVO-Art._15_/_17_/_20_Export-blue?style=for-the-badge" alt="DSGVO" />
</p>

---

## ⚡ Warum Steuereule?

Die meisten Steuer-Programme in Deutschland leiden unter zwei Krankheiten:
1. **Verstaubter Behörden-Charme:** Graue Formular-Wüsten, die abschrecken und Angst vor Fehlern machen.
2. **Unehrliche Versprechen:** Falsche Punktwert-Erstattungen ("Hol dir 1.095 €!"), die am Ende vor dem Finanzamt in sich zusammenbrechen.

**Steuereule macht Schluss damit:**
* 🔥 **Pop-Brutalismus statt Amtsschimmel:** Knalliges Neobrutalismus-Design ([„Funke“-Designsystem](finanzo-funke-design-system/project/readme.md)), fette Konturen, haptische Buttons und 1 Gedanke pro Screen.
* 🎯 **Ehrliche Spannen:** Wir schätzen deine Erstattung stets als realistische Spanne – niemals als erfundene Punktlandung.
* 🔒 **Datenschutz ernst genommen:** Deine Steuer-ID wird serverseitig feldverschlüsselt (AES-256-GCM) gespeichert, nie im Browser-Speicher — per echtem Browser-Gate in CI geprüft. Jeder Zugriff landet in einem Audit-Log.
* 🚀 **Gast-Modus ohne Zwang:** Sofort starten ohne Account. Gefällt dir die App, nimmst du deine Daten mit einem Klick in dein echtes Konto mit.

---

## 📸 Ein Blick in die App

| Cockpit mit ehrlicher Spanne | Quiz-Interview (1 Frage / Screen) |
|:---:|:---:|
| <img src="images/screenshots/cockpit.png" width="360" alt="Cockpit Screen" /> | <img src="images/screenshots/interview.png" width="360" alt="Interview Screen" /> |
| *Erstattung transparent als Spanne, keine falschen Garantien.* | *Schnell, fokussiert und ohne Fachchinesisch.* |

| Onboarding & Profil | QR-Gerätefreigabe ohne Passwort |
|:---:|:---:|
| <img src="images/screenshots/onboarding.png" width="360" alt="Onboarding Screen" /> | <img src="images/screenshots/geraetefreigabe.png" width="360" alt="Gerätefreigabe Screen" /> |
| *Datensparsam, feldverschlüsselt und DSGVO-konform.* | *Nahtloser Login am Desktop via Handy-Kamera.* |

---

## ✨ Was die App heute kann

- **Gast-Browsing ohne Registrierungszwang** — Starte anonym; erst wenn du deine Daten dauerhaft sichern oder übertragen willst, wird daraus ein vollwertiges Konto (atomare Gast→Konto-Übernahme).
- **Cockpit** — Deine voraussichtliche Erstattung als ehrliche *Spanne* plus Zähler offener Punkte mit sauberen Lade- und Fehlerzuständen.
- **Micro-Interview** — Schritt für Schritt durch die wichtigsten Lebenssachverhalte (Angestellte, Rentner, Grenzgänger CH); Antworten werden server-seitig validiert und verschlüsselt abgelegt.
- **Feldverschlüsseltes Profil** — Deine Steuer-ID wird serverseitig mit **AES-256-GCM** verschlüsselt; jeder Zugriff hinterlässt einen unveränderlichen Audit-Log.
- **Konto & Geräte** — E-Mail-Login, Google-Sign-in-Plumbing (#170), QR-Gerätefreigabe für den Desktop-Login ohne Passwort, Sitzungen einzeln widerrufbar.
- **DSGVO by Design** — Voller Datenexport (JSON/PDF mit Headless-Chromium) nach Art. 15/20 und Konto-Löschung nach Art. 17 inklusive Pflicht-Export-Angebot.

> **Was bewusst noch in Arbeit ist:** 1.0 gibt auf Papier ab ([ADR-0050](docs/adr/0050-papierweg-statt-elster-in-1-0.md)): Der Formular-Ausdruck auf amtlichen Vordrucken ist der nächste Schritt, die bezahlte Freischaltung dafür steht. Eine ELSTER-Übermittlung folgt nach 1.0, sobald das Hersteller-Zertifikat vorliegt. Apple Sign-In bleibt bis zu einem iOS-Build abgeschaltet — Details im [Requirements-Register](docs/requirements/register.md).

---

## 🏗️ Architektur im Überblick

Gebaut als sauberes, hochgradig typisiertes Monorepo:

```text
├── apps/
│   ├── mobile-web       # Expo + React Native Web (TanStack Query, i18n, Funke UI)
│   └── api              # NestJS + Fastify REST-API (/v1/*), Prisma auf Postgres
├── packages/
│   ├── core             # UI-freier fachlicher Steuerkern (Determinismus-Grenze)
│   ├── ui               # Neobrutalistisches Design-System (Funke-Komponenten)
│   ├── tokens           # Style Dictionary Design Tokens (Farben, Radien, Schatten)
│   └── api-client       # Typisierter API-Client (OpenAPI-generiert via orval)
└── e2e/                 # Playwright Browser-Gates gegen den realen Stack
```

* Die Architektur ist ausführlich in [arc42](docs/arc42/README.md) dokumentiert.
* Jede wesentliche Entscheidung ist in Architektur-Entscheidungsprotokollen festgehalten: [Engineering ADRs](docs/adr/) und [Produkt ADRs](finanzo-funke-design-system/project/research/adr/).

---

## 🚀 In 60 Sekunden lokal starten

### Produktionsnaher Stack (Postgres + echte Container):

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

* **Web-App:** [http://localhost:8080](http://localhost:8080)
* **API:** [http://localhost:3000](http://localhost:3000)

### Entwicklung mit Hot-Reload:

```bash
docker compose up -d                          # nur Postgres
pnpm install
pnpm --filter @steuereule/mobile-web start   # Expo / Metro
pnpm --filter @steuereule/api start          # NestJS API
```

> **Gut zu wissen vor dem ersten Klick:**
> 1. **Die Datenbank startet leer:** „Sauberes Blatt“ – du kannst direkt als Gast starten oder dich neu registrieren.
> 2. **Apple Silicon (arm64):** Vollständig validiert – Container, Postgres, Migrationen und Headless-Chromium PDF-Export laufen auf M-Chips out of the box.

---

## 🏆 Qualität & Engineering-Exzellenz

* **Vierstufige Definition of Done:** Ticket, REQ, Phase, 1.0 ([ADR-0036](docs/adr/0036-definition-of-done.md)) mit Security- & Performance-Posture.
* **Tiered Testing:** Unit-, Integration- (echtes Postgres) und Acceptance-Tests (echter Socket) sowie Playwright Browser-Gates in CI.
* **AI-Crew Process:** Dokumentierte KI-Kollaborations-Architektur (siehe [CONTRIBUTORS.md](CONTRIBUTORS.md) und [docs/process/](docs/process/)).

---

## 📄 Lizenz & Nutzung

Dieses Repository ist **für die private, persönliche Nutzung frei und quelloffen**.

* **Private Nutzung:** Du darfst den Code ansehen, lokal ausführen, für dich anpassen und deine eigene Steuererklärung damit verwalten.
* **Kommerzielle Nutzung:** Jegliche kommerzielle Verwertung, Bereitstellung als kostenpflichtiger SaaS-Dienst oder Nutzung durch gewerbliche Steuerberater/Unternehmen bedarf einer gesonderten Lizenzvereinbarung.

Lizenziert unter der [PolyForm Noncommercial License 1.0.0](LICENSE). Hinweis: Das ist eine
„Source-Available“-Lizenz, keine OSI-Open-Source-Lizenz.
