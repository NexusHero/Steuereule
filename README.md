<p align="center">
  <img src="images/steuereule-logo.svg" width="120" height="120" alt="SteuerEule Logo — Eule mit Brille" />
</p>

# Steuereule 🦉

<p align="center">
  <b>Steuerberater füllen heute oft nur noch aus. Die Eule erklärt dir, was dir zusteht.</b><br>
  Die moderne, quelloffene Steuer-App für Angestellte, Familien und Grenzgänger: Sie fragt nach, gibt Tipps mit Gesetzesquelle und rechnet so, dass du jede Zahl nachprüfen kannst.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Mission-Beraten_statt_nur_ausf%C3%BCllen-C9F229?style=for-the-badge&labelColor=191B12" alt="Mission" />
  <img src="https://img.shields.io/badge/Design-Neobrutalismus_„Funke“-C9F229?style=for-the-badge&labelColor=191B12" alt="Funke Design System" />
  <img src="https://img.shields.io/badge/Security-AES--256--GCM_Feldverschl%C3%BCsselung-1F9D55?style=for-the-badge" alt="Security" />
  <img src="https://img.shields.io/badge/Grenzg%C3%A4nger-Schweiz_%E2%87%84_DE-blue?style=for-the-badge" alt="Grenzgänger" />
  <img src="https://img.shields.io/badge/DSGVO-Art._15_/_17_/_20_Export-green?style=for-the-badge" alt="DSGVO" />
</p>

---

## ⚡ Warum Steuereule?

**Wir finden: Viele Steuerberater beraten heute nicht mehr, sie füllen nur noch aus.**

Wer Unterstützung bei der Steuer sucht, stößt oft auf dieselben Mauern:

1. 🛑 **Volle Kanzleien, hohe Kosten:** Angestellte, junge Familien oder Grenzgänger finden oft keinen Platz, oder die Rechnung steht in keinem Verhältnis zur Erstattung.
2. 📋 **Ausfüllen statt beraten:** Man sortiert Belege vor, die Kanzlei tippt sie in die Maske. Wer fragt nach der Pauschale, die du vergessen hast? Wer erklärt, warum eine Zeile so aussieht?
3. 🌫️ **Graue Formulare und große Versprechen:** Klassische Programme sind Tabellenwüsten. Andere Apps werben mit festen Beträgen („Hol dir 1.095 € zurück!“), die vor dem Finanzamt nicht halten.

**Wir wollen das ändern und Menschen mit guter Technik etwas Gutes tun.** Steuerwissen soll nicht vom Geldbeutel oder von Kanzleikontakten abhängen.

---

## 🦉 Beraten statt nur ausfüllen: so arbeitet die Eule

* 🦉 **Die Eule denkt mit:** Aus deinen Antworten und deinem Beruf leitet die Eule Tipps ab, zum Beispiel Homeoffice-Pauschale, Fortbildungsfahrten, Spenden, Kinderbetreuung oder eine laufende Einspruchsfrist. Jeder Tipp nennt den Paragraphen und den Rechtsstand.
* 🧮 **Rechnen tut nur der Kern, nie die KI:** Jede Zahl kommt aus einem deterministischen, quelloffenen Rechenkern ([`@steuereule/core`](packages/core/)). KI darf vorschlagen und erklären, aber nichts selbst eintragen: Ein Vorschlag zählt erst, wenn du ihn bestätigst ([ADR-0038](docs/adr/0038-berechnungs-kern-ki-port.md)).
* ⏱️ **Mit wenig Aufwand nachprüfbar:** Das Ergebnis landet auf den amtlichen Vordrucken, Zeile für Zeile. Du, dein Partner oder eine Fachperson könnt jeden Wert in wenigen Minuten gegen deine Belege und die Formulare prüfen. Keine Blackbox.
* 🎯 **Spanne statt Fantasiezahl:** Deine Erstattung zeigen wir als ehrliche Spanne. Fehlt eine Angabe, bleibt der Posten offen, statt dass wir raten ([ADR-0032](docs/adr/0032-nothing-on-screen-promises-what-the-slice-does-not-deliver.md)).
* ⚖️ **Keine Steuerberatung im rechtlichen Sinn:** Steuereule ersetzt keine Beratung nach dem Steuerberatungsgesetz und übernimmt keine Haftung für deine Erklärung. Sie ist ein Werkzeug, mit dem du deine Erklärung selbst, gut vorbereitet und nachvollziehbar erstellst.

---

## ✨ Was Steuereule heute kann

| Bereich | Das steckt dahinter |
|:---|:---|
| 🦉 **Eule als Beraterin** | Tipps passend zu deinen Antworten und deinem Beruf, jeweils mit Gesetzesquelle. Du entscheidest, was du übernimmst. |
| 🇨🇭 **Grenzgänger CH ⇄ DE** | Schweizer Lohnausweis, Umrechnung mit dem von dir erfassten Kurs, Nichtrückkehrtage, Anlage N-Gre, AHV/ALV und Pensionskasse, Schweizer Kinderzulage mit Differenzkindergeld. |
| 👫 **Ehepaare** | Zusammenveranlagung mit Splitting. Person B erfasst du direkt mit oder sie tritt per Einladungscode mit eigenem Konto bei. Person A druckt eine gemeinsame Erklärung. |
| 🏡 **Vermietung (Anlage V)** | Mehrere Objekte, mehrere Wohneinheiten, Umlagen, Schuldzinsen, laufende Werbungskosten und lineare AfA wie im Vorjahr. |
| 📈 **Kapitalerträge (Anlage KAP)** | Deutsche und ausländische Depots, Sparer-Pauschbetrag, gemeinsame Depots je zur Hälfte, Antrag auf Günstigerprüfung. |
| 🚗 **Arbeitsweg** | Pendlerpauschale mit Arbeitstagen; Feiertage nach Bundesland oder Kanton werden vorgeschlagen und von dir bestätigt. |
| 📄 **Ausdruck auf amtlichen Vordrucken** | ESt 1 A, Anlagen N, N-Gre, Kind, KAP, V und Vorsorgeaufwand als PDF zum Ausdrucken und Unterschreiben. Die Feldpositionen werden in CI gegen die Vordrucke vermessen. |
| 🔒 **Feldverschlüsselung** | Steuer-ID und sensible Angaben werden serverseitig mit **AES-256-GCM** verschlüsselt, nie im Browser-Speicher abgelegt. Jeder Zugriff wird protokolliert. |
| ⚡ **Gast-Modus** | Ohne Konto starten. Wer bleiben will, nimmt seine Angaben mit einem Klick ins eigene Konto mit. |
| 🔥 **Design „Funke“** | Knalliges Neobrutalismus-Design ([„Funke“-Designsystem](finanzo-funke-design-system/project/readme.md)), fette Konturen und ein Gedanke pro Screen. |

> **Was (noch) nicht geht:** Version 1.0 gibt auf Papier ab ([ADR-0050](docs/adr/0050-papierweg-statt-elster-in-1-0.md)). Eine ELSTER-Übermittlung kommt erst nach 1.0, sobald das Hersteller-Zertifikat vorliegt. Verluste und Krypto bei Kapitalerträgen unterstützen wir noch nicht; die App sagt das offen. Apple Sign-In bleibt bis zu einem iOS-Build abgeschaltet. Details im [Requirements-Register](docs/requirements/register.md).

---

## 📸 Ein Blick in die App

| Cockpit mit ehrlicher Spanne | Quiz-Interview (1 Frage / Screen) | Onboarding |
|:---:|:---:|:---:|
| <img src="images/screenshots/cockpit.png" width="280" alt="Cockpit Screen" /> | <img src="images/screenshots/interview.png" width="280" alt="Interview Screen" /> | <img src="images/screenshots/onboarding.png" width="280" alt="Onboarding Screen" /> |
| *Erstattung transparent als Spanne, keine falschen Garantien.* | *Schnell, fokussiert und ohne Fachchinesisch.* | *Datensparsam, feldverschlüsselt und DSGVO-konform.* |

| Profil & Geräte | QR-Gerätefreigabe ohne Passwort | Login & Gast-Modus |
|:---:|:---:|:---:|
| <img src="images/screenshots/profil.png" width="280" alt="Profil Screen" /> | <img src="images/screenshots/geraetefreigabe.png" width="280" alt="Gerätefreigabe Screen" /> | <img src="images/screenshots/login.png" width="280" alt="Login Screen" /> |
| *Angemeldete Geräte im Blick, einzeln abmeldbar.* | *Nahtloser Login am Desktop via Handy-Kamera.* | *Sofort loslegen ohne Registrierungszwang.* |

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
* **AI-Crew Process:** Dokumentierte KI-Kollaborations-Architektur (siehe [CONTRIBUTORS.md](CONTRIBUTORS.md) und [docs/process/](docs/process/)).

---

## 📄 Lizenz & Nutzung

Dieses Repository ist **für die private, persönliche Nutzung frei und quelloffen**.

* **Private Nutzung:** Du darfst den Code ansehen, lokal ausführen, für dich anpassen und deine eigene Steuererklärung damit verwalten.
* **Kommerzielle Nutzung:** Jegliche kommerzielle Verwertung, Bereitstellung als kostenpflichtiger SaaS-Dienst oder Nutzung durch gewerbliche Steuerberater/Unternehmen bedarf einer gesonderten Lizenzvereinbarung.

Lizenziert unter der [PolyForm Noncommercial License 1.0.0](LICENSE). Hinweis: Das ist eine
„Source-Available“-Lizenz, keine OSI-Open-Source-Lizenz.
