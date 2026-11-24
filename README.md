# Chat

Eine Chat-App für den HSE-PHP-Chatserver. Die App wird mit Expo SDK 58,
React Native 0.88, TypeScript, Tamagui und expo-router für Android, iOS und Web
entwickelt.

## Lokal starten

Abhängigkeiten aus dem Lockfile installieren:

```sh
npm install
```

Entwicklungsserver:

```sh
npm start
npm run android
npm run ios
npm run web
```

Die statische Web-Ausgabe wird über nginx mit den COOP/COEP-Headern aus
`nginx.conf` ausgeliefert.

## Serverauswahl

Beim ersten Start werden der HSE-Server und ein Backup-Server in die lokale
Serverliste aufgenommen. Auf dem Anmeldebildschirm kann ein registrierter
Server ausgewählt werden. Über „Eigenen Server hinzufügen“ lässt sich eine
URL eingeben; der Server wird auf Erreichbarkeit geprüft und erst nach Erfolg
zur Liste hinzugefügt und ausgewählt. Eine automatische Failover-Auswahl gibt es
nicht.

Die API-Spezifikation liegt in `docs/openapi.yaml`. Das PHP-Backend ist nicht Teil
dieses Repositories.

## Implementierte Funktionen

- Anmeldung und Registrierung.
- Logout und Accountlöschung.
- Chatliste mit gespeicherten Chats und Vorschauen.
- Chatbildschirm mit gespeichertem Verlauf, Textversand und Outbox-Zuständen.
- Erstellung öffentlicher und privater Gruppenchats sowie direkter Chats.
- Einladen von registrierten Personen.
- Ansicht für Einladungen mit Annehmen und Ablehnen.
- Öffentliche Chats suchen und beitreten.
- Offline-Lesen gespeicherter Daten, lokale Outbox und automatischer Retry:
  [Offline-Verhalten](docs/offline-behaviour.md).

Nicht implementiert sind das Bearbeiten oder Löschen gesendeter Nachrichten,
Reaktionen, Anhänge/Uploads, QR-Code-Scannen und Push-Nachrichten.

## Architektur

- `src/app/` enthält Expo-Router-Routen, einschließlich Authentifizierung,
  Tabs, Chatansicht, Einladung und Erstellung neuer Chats.
- `src/api/` enthält den zustandslosen HTTP-Client und die API-Services.
- `src/session/` verwaltet Server, Accounts, Anmeldung, Logout und
  Sitzungswiederherstellung.
- `src/storage/` verwaltet Registry, Secrets, SQLite pro Account und den
  Web-Memory-Fallback.
- `src/messaging/` enthält Outbox, Polling, Sync-Zyklen und Chat-Aktionen.
- `src/hooks/` und `src/utils/` liefern lokale UI-Lesezugriffe und
  gemeinsame Logik.

## Prüfungen

```sh
npm test
npm run lint
npx tsc --noEmit
```

Automatisierte Tests liegen neben den implementierten Modulen und prüfen unter
anderem Storage-Verträge, Outbox-Retry, Sync-Zyklen, Session-Verhalten und
Zeitumrechnung. Sie richten sich nicht gegen das echte Backend.

## Dokumentation

- Regeln für Mitwirkende: [AGENTS.md](AGENTS.md)
- Architekturentscheidungen: [docs/adr/](docs/adr/)
- KI-gestützte Entwurfsdokumentation: [docs/ai-use/](docs/ai-use/)

## Mitarbeit & KI-Nutzung

- Regeln für Menschen und KI-Agenten: [`AGENTS.md`](AGENTS.md)
- Architekturentscheidungen: `docs/adr/`
- Dokumentation KI-gestützter Entwürfe: `docs/ai-use/`

## Definition of Ready

Eine Story darf in den Sprint, wenn:

- sie als User Story formuliert ist (Rolle, Ziel, Nutzen),
- prüfbare Akzeptanzkriterien hat, auch für Laden, leer und Fehler,
- der Screen im Figma-Prototyp vorhanden ist,
- Abhängigkeiten und API-Endpunkte bekannt sind,
- sie in einen Sprint passt und schätzbar ist.

## Definition of Done

Eine Story ist fertig, wenn:

- alle Akzeptanzkriterien erfüllt sind,
- sie per Pull Request kam und reviewt wurde,
- Tests, Lint und Typecheck grün sind,
- sie auf Gerät oder Emulator und im Web läuft,
- Laden, leer und Fehler umgesetzt sind,
- sie Tamagui-Tokens und vorhandene Komponenten nutzt,
- das Issue auf „Done“ steht.


