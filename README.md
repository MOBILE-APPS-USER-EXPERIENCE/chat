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
npx tsc --noEmit
npx expo lint
```

Die Routen liegen unter `src/app`. Die Authentifizierung ist unter `src/app/(auth)` organisiert;
API-Zugriffe befinden sich in `src/api`.

## Mitarbeit & KI-Nutzung

- Regeln für Menschen und KI-Agenten: [`AGENTS.md`](AGENTS.md)
- Architekturentscheidungen: `docs/adr/`
- Dokumentation KI-gestützter Entwürfe: `docs/ai-use/`
