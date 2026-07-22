Kurzlebige Bestätigung — ~1,4 s ohne Aktion, ~5 s mit `aktion` (nach destruktiven Aktionen ist „Rückgängig" Pflicht). Nie für Lernstoff/Erklärungen.

```jsx
{toast && <Toast text="Kopiert" />}
{toast && <Toast text="Duplikat gelöscht" aktion="Rückgängig" onAktion={wiederherstellen} />}
```
