# Chat

Eine Chat-App mit Expo SDK 57, React Native und TypeScript für Android, iOS und Web.

## Lokal starten

```sh
npm ci
npm run web
```

Für ein Mobilgerät: `npm start`, anschließend die gewünschte Expo-Entwicklungsumgebung öffnen.

## Funktionen

- Anmelden und registrieren mit HSE-Kennung (z. B. `abcdit01`), Passwort und bei Registrierung Anzeigename sowie Vor- und Nachname.
- Der zurückgegebene Token wird automatisch gespeichert und bei API-Aufrufen verwendet. Die Sitzung wird beim nächsten Start validiert. Abmelden invalidiert den Token und entfernt die lokale Sitzung.
- Kontobereich mit Anzeigename, vollständigem Namen, Kennung und auswählbarem Sitzungs-Token. Das Passwort wird nicht gespeichert.
- Chatliste mit Suche und Filter; auf breiten Bildschirmen steht das Gespräch rechts daneben. Auf kleinen Bildschirmen führt ein Zurück-Knopf wieder zur Liste.
- Nachrichten mit Absender, Datum, Uhrzeit und eigener Darstellung für eigene Beiträge. Texte werden über die API gesendet; Chatliste und geöffnetes Gespräch werden automatisch alle fünf Sekunden nachgeladen.
- Neue private oder öffentliche Chats mit optionalen Einladungen. Nach Erstellung wird der eigene Beitritt bestätigt und der Chat geöffnet; vorübergehend veraltete Listenantworten blenden ihn nicht aus.
- Private Chats mit genau einer ausgewählten Person werden als direkte Gespräche angelegt und zeigen automatisch deren Namen in Liste und Chatkopf.
- Der Chatkopf öffnet die Teilnehmeransicht mit Mitgliedern und offenen Einladungen. Ein eigener Anzeigename lässt sich später ändern und zurücksetzen; er wird für Konto und Server auf diesem Gerät gespeichert. Die API bietet keine gemeinsame Umbenennung.
- Beitritt zu öffentlichen oder eingeladenen Chats. Versandfehler erhalten den Entwurf; ungültige Tokens führen zurück zur Anmeldung.

Die App verwendet standardmäßig `https://www2.hs-esslingen.de/~chkohl/chat`. Die Spezifikation liegt in `docs/openapi.yaml`; die API-Services liegen in `src/api`. Das PHP-Backend ist nicht Teil dieses Repos. Bei Bedarf lässt sich die Standardadresse über `EXPO_PUBLIC_CHAT_API_URL` ändern (danach den Devserver neu starten). Diese Variable ist öffentlich; sie darf keine Zugangsdaten enthalten.

Der Token wird mit AsyncStorage auf dem Gerät bzw. im Browser gespeichert und in der Oberfläche angezeigt. Zeitangaben folgen der Serverzeit aus der API. Foto-, Datei- und Standortbeiträge werden als solche gekennzeichnet; diese Version sendet Textnachrichten.

## Prüfungen

```sh
npm test
npm run lint
npx tsc --noEmit
```

Die automatisierten Tests prüfen die echten API-Services mit isoliertem Storage und simulierten Antworten: Token-Übernahme, Versand, Abmeldung, ungültige Tokens, Nachrichtenzusammenführung und Zeitformatierung. Sie erstellen keine Konten und senden keine Nachrichten an den echten Server.

## UI/UX-Begründung

`docs/ui-ux-begruendung.txt` erläutert die Gestaltung anhand von Fitts, Hick, Jakob, Gestaltprinzipien, Nielsen und ausgewählten WCAG-Kriterien. Sie nennt konkrete Stellen in Oberfläche und Code sowie Prüfergebnisse und Quellen.
