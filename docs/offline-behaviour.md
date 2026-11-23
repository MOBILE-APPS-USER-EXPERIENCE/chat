# Offline-Verhalten

## Funktionsmatrix

| Funktion | Funktioniert offline? | Mechanismus |
|---|---|---|
| Gespeicherte Chats lesen | Ja | Lokale Chatliste aus der per-Account-SQLite-Datenbank bzw. im Web-Fallback aus dem Speicher |
| Gespeicherte Nachrichten lesen | Ja | Lokale Nachrichtenliste pro Chat aus `raw_messages`; der Chatbildschirm fordert keine Serverantwort für einen bereits gespeicherten Verlauf |
| Gespeicherte Profile lesen | Ja | Lokale Profiltabelle und Chat-Mitglieder werden aus dem Account-Storage gelesen |
| Nachricht schreiben | Ja, Speicherung garantiert; Versand wird nachgereicht | Nachricht wird in den Outbox-Speicher geschrieben und später gemeinsam mit Sync-Zyklen oder unmittelbar nach dem Einreihen gesendet |
| Chat erstellen | Nein für die Serveraktion | `createGroup`/`createDirectChat` ruft den Server synchron auf; offline gibt es einen Netzwerkfehler und keine lokale Optimierung |
| Einladen | Nein für die Serveraktion | `invite` ruft den Server synchron auf; offline gibt es einen Netzwerkfehler |
| Einladung annehmen/öffentlichen Chat beitreten | Nein für die Serveraktion | `joinChat` ruft den Server synchron auf; die lokale Chatliste wird nur nach einer erfolgreichen oder serverseitig abgelehnten Serveraktion aktualisiert |
| Einladung ablehnen | Nein für die Serveraktion | `rejectInvite` ruft den Server synchron auf; die lokale Liste bleibt offline unverändert |
| Anmeldung | Teilweise: gespeicherte Sitzung wird offline wiederhergestellt | Beim Start werden Account, Server und Token aus dem lokalen Registry-/Secret-Storage wiederhergestellt, ohne Netzwerkprüfung. Eine neue Login-/Registrierungsanfrage benötigt den Server |
| Abmelden | Ja lokal | Logout löscht den lokalen Token und die aktive Account-Auswahl; die Serverabmeldung läuft offline nur als 5-Sekunden-Best-Effort |
| Server hinzufügen | Auswahl/Registrierung nur nach Erreichbarkeitstest | Eine eingegebene URL wird geparst und per `ping` geprüft; nur ein erreichbarer Server kann hinzugefügt und ausgewählt werden |

Quellen: [src/messaging/outboxService.ts](/src/messaging/outboxService.ts), [src/messaging/chatActions.ts](/src/messaging/chatActions.ts), [src/session/sessionService.ts](/src/session/sessionService.ts), [src/hooks/use-messages.ts](/src/hooks/use-messages.ts).

## Outbox-Lebenszyklus

Eine Zeile hat einen der Zustände `pending`, `sending` oder `failed`.

- Beim Einreihen wird Text-Nachrichten eine lokale ID zugeordnet und die Zeile mit `createdAt` als `pending` gespeichert.
- `drain()` liest fällige Zeilen alters- und reihenfolgenorientiert, zuerst nach `createdAt` und dann nach Datenbank-Reihenfolge.
- Vor dem eigentlichen Versand geht eine Zeile von `pending` oder `failed` auf `sending`.
- Bei Erfolg wird die Zeile gelöscht. Danach wird für denselben Chat eine sofortige Einzelabfrage gestartet, damit die bestätigte Servernachricht den Optimismus-Eintrag möglichst bald ersetzen kann.
- Bei einem Fehler wird `attempts` erhöht und die Zeile auf `failed` gesetzt. Der nächste Versuch liegt linear bei `attempts * 2 s`, begrenzt auf höchstens 30 s.
- Es gibt kein Attempt-Limit: eine Nachricht bleibt bis zum Erfolg oder bis zum manuell bestätigten Verwerfen in der Warteschlange.
- Das Aufteilen nach Chats funktioniert als Sperre: Jede Chat-ID blockiert spätere Zeilen desselben Chats, solange eine Zeile `sending` ist oder ein aktueller `failed`-Termin noch in der Zukunft liegt. Andere Chats werden weiterhin verarbeitet.
- Bei einem Netzwerkfehler stoppt `drain()` den aktuellen Durchlauf.
- Beim nächsten Öffnen werden alle Zeilen mit Status `sending` auf `pending` zurückgesetzt. Das schützt nach einem App-Absturz oder Prozessende vor dauerhaftem Blockieren.
- Der Server liefert keine lokale Idempotenzkorrelation zurück. Wird ein ungewisser oder abgebrochener Versand später erneut gesendet, kann dieselbe Nachricht serverseitig doppelt angenommen werden; ein Duplikat kann nicht automatisch erkannt werden.
- Eine Zeile kann nur verworfen werden, wenn sie nicht `sending` ist. Nach einem erfolgreichen Verwerfen wird die Warteschlange unmittelbar erneut geflusht. Ein änderbares `Verwerfen`-Element zeigt die UI nur für `failed`-Zeilen an.

Quellen: [src/messaging/outboxService.ts](/src/messaging/outboxService.ts), [src/storage/db/sqliteOutboxRepository.ts](/src/storage/db/sqliteOutboxRepository.ts), [src/messaging/runtime/syncScheduler.ts](/src/messaging/runtime/syncScheduler.ts), [src/app/chat/[chatId].tsx](/src/app/chat/[chatId].tsx).

## `sentAt`, Server-Zone und Cache

`sentAt` ist die aus dem Serverfeld `time` berechnete Epoche in Millisekunden. Der Wert wird beim Einlesen einer Nachricht in [src/messaging/mappers.ts](/src/messaging/mappers.ts) gesetzt, in `raw_messages.sent_at` gespeichert und für Sortierung sowie Uhrzeitdarstellung verwendet.

Die Code-Zonenkarte in [src/session/serverTimeZone.ts](/src/session/serverTimeZone.ts) ordnet URLs zu:

| Server | Zone |
|---|---|
| HS-Default-URL `https:/www2.hs-esslingen.de/~chkohl/chat` | `Europe/Berlin` |
| Backup-URL `https:/api.chat.throin.de` | `UTC` |
| Andere/custom URLs | `UTC` |

Annahme **unverified**: Der HS-Server verwendet tatsächlich Europe/Berlin inklusive Sommer-/Winterzeit. Der Code bildet die Berliner Übergänge nach; wenn diese Annahme falsch ist, verschieben sich angezeigte Uhrzeiten um eine konstante Stundenabweichung, während Server-ID, Reihenfolge und Gruppierung unverändert bleiben. `sentAt` darf bei nicht parsebarem `time` `null` bleiben.

## Chatlisten-Sortierung und Vorschau

Chats werden nach Aktivität absteigend sortiert:

1. Die letzte gespeicherte Nachrichten-ID liefert deren `sentAt` oder, falls `sentAt` fehlt, `receivedAt`.
2. Hat ein Chat keine gespeicherte Nachricht, zählt `firstSeenAt`.
3. Bei gleichem Zeitwert gewinnt die höhere Chat-ID.

Die Vorschau liest die höchste Server-Nachrichten-ID je Chat und zeigt:

- eigene Nachricht: `Du: <Text>`
- fremde Nachricht in einem Nicht-Direktchat: `<Anzeigename oder userid>: <Text>`
- fremde Nachricht in einem Direktchat: nur der Nachrichtentext
- Foto-/Datei-Kennungen werden als `Foto`/`Datei` gezeigt
- ohne anzeigbaren Text: `Noch keine Nachrichten`

Pending-, sending- oder failed-Outbox-Zeilen erscheinen **nicht** in der Chatlisten-Vorschau. Die Vorschau basiert ausschließlich auf gespeicherten bestätigten `raw_messages`. Pending/failed Nachrichten erscheinen im geöffneten Chatbildschirm in der lokalen kombinierten Nachrichtenliste.

Quellen: [src/utils/chat-list-view.ts](/src/utils/chat-list-view.ts), [src/app/(tabs)/index.tsx](/src/app/(tabs)/index.tsx), [src/hooks/use-chat-previews.ts](/src/hooks/use-chat-previews.ts).

## Einmaliger Reset bei fehlendem `sentAt`

Beim Öffnen des Account-Storage wird ein Repair-Scan ausgeführt. Wenn für einen beigetretenen Chat die höchste gespeicherte Nachricht `sentAt === null`, aber `serverTime` parsebar ist, wird nur dieser Chat zurückgesetzt: Alle gespeicherten `raw_messages` des Chats und `polledUpTo` werden gelöscht. Das Chat-Zeilenobjekt, Mitglieder, Profile, Outbox-Zeilen und andere Chats bleiben erhalten. Danach werden die Nachrichten normal neu abgerufen. Der Repair läuft einmal pro Account-Öffnung; ein unparsebarer Wert löst keinen Reset aus.

Quellen: [src/messaging/runtime/syncScheduler.ts](/src/messaging/runtime/syncScheduler.ts), [src/storage/db/sqliteMessageRepository.ts](/src/storage/db/sqliteMessageRepository.ts).

## Sync-Takt und Offline-Lesen

- Während die App im Vordergrund ist, läuft alle 5 s ein Sync-Takt.
- In jedem Takt wird zuerst die Chatliste angefordert.
- Profile werden höchstens alle 10 Minuten angefragt.
- Der geöffnete Chat wird in jedem Takt angefordert.
- Andere beigetretene Chats werden höchstens alle 30 s angefordert.
- Chats, die aus `getchats` verschwinden, werden höchstens alle 60 s auf ihre Existenz geprüft.
- Ein gespeicherter Chat wird nur gelöscht, wenn eine Chat-Existenzprüfung oder ein offener Chat eine bestätigte Serverantwort 458 erhält.
- Identische Chat-Snapshots werden nach Merge von Task 9c.1 nicht erneut angewendet; der Code führt dafür einen in-Memory-Vergleich des vorherigen JSON-Snapshots. `Identisch` bedeutet dieselbe JSON-Darstellung des gefetchten Snapshots.
- Ein Netzwerkfehler beendet den laufenden Zyklus; lokale Daten bleiben erhalten und werden weiterhin angezeigt.

Quellen: [src/messaging/runtime/syncScheduler.ts](/src/messaging/runtime/syncScheduler.ts), [src/messaging/syncService.ts](/src/messaging/syncService.ts), [src/messaging/ports.ts](/src/messaging/ports.ts).

## Speicher und Sitzung

- Native: Eine SQLite-Datenbank `chat_<accountId>.db` pro Account.
- Web: SQLite nur bei Cross-Origin-Isolation, Secure Context, SharedArrayBuffer und OPFS. Ohne eine Bedingung wird auf In-Memory-Storage gewechselt:
  - `no_isolation`
  - `no_secure_context`
  - `no_opfs`
  - `open_failed`
- Im Memory-Fallback arbeitet die App normal während der laufenden Seite, verliert Account-Daten aber beim Neuladen oder Schließen der Seite. Ein Benutzer sieht keine separate explizite Speicherstatusansicht; die Anwendung nutzt den Fallback stillschweigend.
- Fehlgeschlagene lokale Account-Löschungen werden in der KV-Liste `storage.pendingDeletions` vorgemerkt und beim nächsten erfolgreichen SQLite-Öffnen erneut versucht.
- `Logout` löscht Token und aktive Auswahl, behält aber Registry-Account und Account-Datenbank.
- `Deregister`/Account löschen löscht zuerst nach Servererfolg Secrets, Registry-Eintrag und lokale Account-Daten; bei Netzwerk- oder Serverfehler bleibt lokal alles unverändert.

Quellen: [src/storage/accountStorageManager.ts](/src/storage/accountStorageManager.ts), [src/storage/db/openDatabase.ts](/src/storage/db/openDatabase.ts), [src/session/sessionService.ts](/src/session/sessionService.ts), [docs/adr/adr-003_web-secret-storage.md](/docs/adr/adr-003_web-secret-storage.md).

## Bekannte Grenzen

- Die lokale Datenbank ist nicht verschlüsselt.
- Auf dem Web liegen Tokens und Admin-Schlüssel im `localStorage`; jedes Skript auf derselben Origin kann sie lesen (ADR-003).
- Mehrere Browser-Tabs haben keine durchgehende Lock-/Race-Vermeidung für Session- und Storage-Zugriffe.
- Kein Push.
- Keine Ende-zu-Ende-Verschlüsselung.

## Manuelle Prüfmatrix

| ID | Szenario | Schritte | Erwartet | Web | Android | iOS |
|---|---|---|---|---|---|---|
| O-01 | Gespeicherte Chats und Nachrichten im Flugmodus lesen | App öffnen, Flugmodus einschalten, Chatliste und gespeicherten Chat öffnen | Bereits geladene Chats und Nachrichten bleiben lesbar; keine Serverantwort wird benötigt |  |  | not tested (no hardware) |
| O-02 | Offline senden, danach wieder verbinden | Flugmodus einschalten, Nachricht senden, zeigen `pending`/`sending`/`failed`, Flugmodus ausschalten | Nachricht bleibt in der Outbox; nach Wiederverbindung wird sie gesendet und serverseitig bestätigt |  |  | not tested (no hardware) |
| O-03 | Reihenfolge zweier Offline-Nachrichten | Zwei Nachrichten schnell hintereinander offline senden | Beide bleiben pro Chat nach `createdAt` geordnet; zweite wird erst nach erfolgreicher erster bzw. nach deren Fälligkeit verarbeitet |  |  | not tested (no hardware) |
| O-04 | Fehlgeschlagene Nachricht verwerfen | Offline eine Nachricht bis `failed` bringen, `Verwerfen` wählen | Zeile wird lokal entfernt und die Warteschlange wird unmittelbar geflusht |  |  | not tested (no hardware) |
| O-05 | App mit `sending`-Zeile beenden | Nachricht starten und Prozess/App während Status `sending` beenden | Beim nächsten Öffnen wird `sending` zu `pending` zurückgesetzt und erneut gesendet; eine serverseitige Duplikatannahme ist möglich |  |  | not tested (no hardware) |
| O-06 | Hintergrund/Vordergrund | Sync läuft im Vordergrund, App in Hintergrund setzen, zurückkehren | Hintergrund stoppt neue 5-s-Takte; Rückkehr zum Vordergrund startet einen neuen Zyklus |  |  | not tested (no hardware) |
| O-07 | Account wechseln mit pending Nachricht | Nachricht in Account A einreihen, zu Account B wechseln | Account A bleibt auf seiner Warteschlange; laufende oder spätere Schreibzugriffe werden nicht dem aktiven Account zugeschrieben |  |  | not tested (no hardware) |
| O-08 | Web ohne COOP/COEP-Header | Static App ohne Cross-Origin-Isolation laden | Storage-Fallback `no_isolation`; Funktion läuft in Memory, Daten über Reload nicht persistiert |  |  | not tested (no hardware) |
| O-09 | Reload bei Web-Memory-Fallback | Nachricht/Chatdaten in Memory-Fallback laden, Seite neu laden | Daten des laufenden Memory-Stores sind verschwunden; erneuter Login/Server-Sync erforderlich |  |  | not tested (no hardware) |
| O-10 | Logout und erneuter Login behalten Daten | Offline oder online Logout durchführen, erneut anmelden | Account/Chats/Nachrichten bleiben lokal erhalten; nur Secrets und aktive Auswahl werden beim Logout entfernt |  |  | not tested (no hardware) |
| O-11 | Deregister löscht Daten | Account löschen mit erfolgreicher Serverantwort | Secrets, Registry-Account und Account-Datenbank werden entfernt; bereits gesendete Servernachrichten bleiben auf dem Server bestehen |  |  | not tested (no hardware) |
| O-12 | Server beim Start unerreichbar | Gespeicherte Sitzung wählen und Server offline lassen, App starten | Bestehende lokale Sitzung wird ohne Netzwerkprüfung wiederhergestellt; lokale Chats und Nachrichten bleiben lesbar |  |  | not tested (no hardware) |
| O-13 | 456 erzwingt Logout | Ungültigen/abgelaufenen Token erzeugen und Sync oder Outbox auslösen | 456 wechselt die aktive Sitzung zum Logout, löscht Token und aktive Auswahl; lokale Accountdaten bleiben erhalten |  |  | not tested (no hardware) |
| O-14 | Chat offline erstellen | Im New-Chat-Dialog offline Gruppe/Direktchat erstellen | Netzwerkfehler wird angezeigt; kein Chat wird optimistisch hinzugefügt |  |  | not tested (no hardware) |
| O-15 | Offline einladen | Bei erreichbar gespeichertem Chat offline eine Person einladen | Netzwerkfehler wird angezeigt; der Chat und die Einladungsansicht ändern sich nicht |  |  | not tested (no hardware) |
| O-16 | Öffentlichen Chat offline beitreten | Öffentliche Liste öffnen und offline `Beitreten` wählen | Netzwerkfehler wird angezeigt; Chat bleibt unbeitgetreten bzw. lokale Mitgliedschaft ändert sich nicht |  |  | not tested (no hardware) |
| O-17 | Einladung offline ablehnen | Offline auf `Ablehnen` bestätigen | Netzwerkfehler wird angezeigt; Einladung bleibt lokal in der Liste |  |  | not tested (no hardware) |
| O-18 | Feststeckende Warteschlange prüfen | Eine frühere Zeile dauerhaft `failed` halten, danach eine spätere Zeile desselben Chats einreihen | Die spätere Zeile bleibt durch Head-of-Line-Blocking stehen, bis die frühere verworfen oder erfolgreich gesendet wurde |  |  | not tested (no hardware) |
