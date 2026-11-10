# ADR-0059 — Eigene Keystore-Datenbank für Beleg-Schlüssel (Crypto-Shredding bis in die Backups)

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** NexusHero (Product Owner), Steuereule Engineering
- **Applies to:** `apps/api/src/keystore/`, `apps/api/src/receipt/storage/`, `apps/api/prisma/keystore/`, `infra/gcp/`
- **Ergänzt:** ADR-0008 (Verschlüsselung at Rest), ADR-0013 (DSGVO-Export und Kontolöschung)

## Kontext

#444 speichert Originalbelege verschlüsselt: AES-256-GCM je Datei, mit einem Datenschlüssel
(DEK) pro Nutzer, der unter einem Master-Schlüssel gewrappt ist. Bei der Kontolöschung wird der
DEK gelöscht. Ohne ihn sind die Dateien unlesbar (Crypto-Shredding). Ticket #444 verlangt
ausdrücklich, dass das **auch für Backups** gilt.

Der erste Entwurf legte den gewrappten DEK in **dieselbe Datenbank** wie die verschlüsselten
Dateien. Ein Backup enthält dann beides. Zusammen mit dem Master-Schlüssel (aus der
Feldverschlüsselung abgeleitet) bleibt jede gelöschte Datei aus jedem Backup wiederherstellbar.
Das Versprechen „auch Backups unlesbar“ war damit nicht eingelöst.

## Entscheidung

1. **Eigene Datenbank.** Die gewrappten DEKs liegen in einer separaten Keystore-Datenbank
   (`prisma/keystore/schema.prisma`, Tabelle `NutzerSchluessel`, eigener Prisma-Client, eigene
   Migrationen). Die Steuerdaten-Datenbank enthält nur noch Chiffrat, IV, Auth-Tag und einen MAC.
2. **Kürzere Backup-Aufbewahrung.** In Produktion ist der Keystore eine **eigene Cloud-SQL-Instanz**
   (Backups gelten je Instanz) mit 2 Backups und 1 Tag PITR, gegenüber 7/7 bei den Steuerdaten.
   Nach einer Löschung ist eine Datei damit spätestens nach Ablauf der Keystore-Aufbewahrung in
   **jedem** Backup unlesbar, auch in den länger aufbewahrten Steuerdaten-Backups.
3. **Eigener Master-Schlüssel.** `KEYSTORE_MASTER_KEY` (Rotation über
   `KEYSTORE_MASTER_KEY_PREVIOUS`) ersetzt die Ableitung aus `PRISMA_FIELD_ENCRYPTION_KEY`.
4. **Löschreihenfolge.** Die Kontolöschung zerstört den Schlüssel **vor** der
   Steuerdaten-Transaktion. Scheitert die Transaktion, sind die Dateien bereits unlesbar und ein
   erneuter Versuch schließt die Löschung ab. Der umgekehrte Fall (Zeilen weg, Schlüssel lebt,
   Backups für immer lesbar) ist damit ausgeschlossen. Ein Legal Hold auf Steuerdaten behält den
   Schlüssel.
5. **Kein Klartext-Hash.** Statt SHA-256 über den Klartext speichert `BelegDatei.inhaltsMac` einen
   HMAC unter einem aus dem DEK abgeleiteten Schlüssel. Ein Dritter kann so nicht prüfen, ob ein
   ihm bekanntes Dokument vorliegt.
6. **Kein Mehraufwand außerhalb von Produktion.** Dev, CI und E2E leiten
   `KEYSTORE_DATABASE_URL` als Nachbar-Datenbank `<name>_keystore` auf demselben Server ab.
   `migrate:deploy` legt sie bei Bedarf an und migriert beide Datenbanken. Der Boot-Guard
   verweigert den Start, wenn eine der beiden nicht migriert ist.

## Konsequenzen

- Beim Deploy kommt eine zweite Cloud-SQL-Instanz hinzu, mit kleinen Fixkosten, sowie zwei Secrets
  (`KEYSTORE_DATABASE_URL`, `KEYSTORE_MASTER_KEY`) und die Repo-Variable
  `GCP_KEYSTORE_SQL_INSTANCE`. `scripts/infra/gcp-setup.sh` legt alles an. Fehlt die Variable,
  überspringt der Deploy (wie bei jeder fehlenden Variable).
- Geht der Keystore verloren, sind alle Originalbelege verloren. Die Steuerdaten selbst bleiben
  unberührt, weil sie feldverschlüsselt mit eigenem Schlüssel sind. Darum hat der Keystore eigene,
  wenn auch kurze Backups.
- Schlüssel und Steuerdaten sind nicht in einer Transaktion. Das ist bewusst so (Punkt 4), braucht
  aber die feste Reihenfolge.
