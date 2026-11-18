# Chat

Expo-/React-Native-App für den Chat-Service.

## Entwicklung

Abhängigkeiten installieren:

```bash
npm install
```

Entwicklungsserver starten:

```bash
npx expo start
```

Weitere Befehle:

```bash
npm run android
npm run ios
npm run web
npm test
npx tsc --noEmit
npm run lint
```

Die Routen liegen unter `src/app`. Die Authentifizierung ist unter `src/app/(auth)` organisiert;
`src/api` ist ein zustandsloser Client für den Chat-Server (keine Speicherung, kein Failover).
Server, Konten und die Sitzung (Login, Logout, Wiederherstellung beim Start) verwaltet `src/session`.

## Mitarbeit & KI-Nutzung

- Regeln für Menschen und KI-Agenten: [`AGENTS.md`](AGENTS.md)
- Architekturentscheidungen: `docs/adr/`
- Dokumentation KI-gestützter Entwürfe: `docs/ai-use/`
